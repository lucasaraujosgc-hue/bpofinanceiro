import { dreBucketFor } from '../accounting.js';
import { computeDre, OPERACIONAIS } from './dre.js';

// ---------------------------------------------------------------------------
// Ciclo Financeiro — PMR, PMP, PME, Ciclo Operacional, CCC, NCG, Capital de
// Giro Líquido, Saldo em Tesouraria.
//
// O sistema é 100% regime de caixa: não há contas a receber/pagar nem estoque.
// Logo, o único sinal de prazos e de necessidade de capital de giro é a
// CARTEIRA DE PREVISÕES EM ABERTO (forecasts com realized = 0):
//   PMR ≈ média ponderada por valor dos dias de hoje até a data prevista das
//         previsões de RECEITA operacional em aberto.
//   PMP ≈ idem para as previsões de DESPESA operacional em aberto.
//   NCG ≈ (total a receber em aberto) − (total a pagar operacional em aberto).
//   PME: sempre indisponível (depende de controle de estoque).
//   Caixa: reconstruído do histórico de lançamentos.
//   CGL ≈ Caixa + NCG.   Saldo em Tesouraria = CGL − NCG = Caixa.
//
// Como não há data de competência, PMR/PMP/CCC/NCG são um retrato do momento
// (não uma série histórica); a série mensal traz só caixa e receita/despesa.
// ---------------------------------------------------------------------------

const ymd = (s) => String(s || '').slice(0, 10);
const DAY = 86400000;
const daysBetween = (a, b) => {
    const da = Date.parse(ymd(a)); const db = Date.parse(ymd(b));
    if (Number.isNaN(da) || Number.isNaN(db)) return null;
    return Math.max(0, Math.round((db - da) / DAY));
};
const monthKey = (s) => ymd(s).slice(0, 7);
const daysInMonth = (yy, mm1) => new Date(Date.UTC(yy, mm1, 0)).getUTCDate();
const lastDay = (yy, mm1) => `${yy}-${String(mm1).padStart(2, '0')}-${String(daysInMonth(yy, mm1)).padStart(2, '0')}`;

// prazo médio (ponderado por valor) de hoje até a data prevista da carteira
function carteiraPrazo(forecasts, hojeStr) {
    let num = 0, den = 0;
    for (const f of forecasts) {
        const d = daysBetween(hojeStr, f.date);
        if (d === null) continue;
        const v = Math.abs(Number(f.value) || 0);
        num += v * d; den += v;
    }
    return den > 0 ? { prazo: num / den, base: den } : null;
}

export async function computeFinancialCycle({ pool, userId, year, month, months }) {
    const ref1 = month + 1;
    const win = Math.max(months, 36) + 1;
    const startDate = new Date(Date.UTC(year, month - win + 1, 1)).toISOString().slice(0, 10);
    const endDate = lastDay(year, ref1);
    const hoje = new Date().toISOString().slice(0, 10);

    const [txRes, netRes, fcRes] = await Promise.all([
        pool.query(
            `SELECT t.type, t.value, t.date,
                    c.name AS category_name, c.group_type, c.behavior_type
             FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND t.date::date >= $2::date AND t.date::date <= $3::date`,
            [userId, startDate, endDate]),
        pool.query(
            `SELECT to_char(date::date, 'YYYY-MM') AS mes,
                    SUM(CASE WHEN type = 'credito' THEN value ELSE -value END) AS net
             FROM transactions
             WHERE user_id = $1 AND credit_card_id IS NULL
             GROUP BY 1 ORDER BY 1`,
            [userId]),
        pool.query(
            `SELECT f.type, f.value, f.date, c.group_type
             FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id
             WHERE f.user_id = $1 AND COALESCE(f.realized, 0) = 0 AND f.date::date >= $2::date`,
            [userId, hoje]),
    ]);

    const tx = txRes.rows;
    const forecasts = fcRes.rows;

    // ---- caixa acumulado por mês (todo o histórico) ----
    const caixaAcum = {};
    let running = 0;
    for (const r of netRes.rows) { running += Number(r.net) || 0; caixaAcum[r.mes] = running; }
    const caixaAte = (mk) => {
        const keys = Object.keys(caixaAcum).filter(k => k <= mk);
        return keys.length ? caixaAcum[keys[keys.length - 1]] : 0;
    };

    // ---- carteira de previsões em aberto (retrato atual) ----
    const fcReceita = forecasts.filter(f => f.type === 'credito' && dreBucketFor(f) === 'receita_bruta');
    const fcDespesaOp = forecasts.filter(f => f.type === 'debito' && OPERACIONAIS.has(dreBucketFor(f)));
    const carteiraReceber = fcReceita.reduce((s, f) => s + Math.abs(Number(f.value) || 0), 0);
    const carteiraPagar = fcDespesaOp.reduce((s, f) => s + Math.abs(Number(f.value) || 0), 0);
    const pmrCarteira = carteiraPrazo(fcReceita, hoje);
    const pmpCarteira = carteiraPrazo(fcDespesaOp, hoje);
    const temCarteira = carteiraReceber > 0 || carteiraPagar > 0;

    // ---- carteira distribuída pelos próximos 12 meses (a receber × a pagar) ----
    const carteiraFuturaMap = {};
    for (const f of forecasts) {
        const mk = monthKey(f.date);
        const g = (carteiraFuturaMap[mk] ||= { mes: mk, aReceber: 0, aPagar: 0 });
        const v = Math.abs(Number(f.value) || 0);
        if (f.type === 'credito') g.aReceber += v; else g.aPagar += v;
    }
    const carteiraFutura = Object.values(carteiraFuturaMap).sort((a, b) => a.mes.localeCompare(b.mes)).slice(0, 12);

    // ---- série mensal: só o que existe em regime de caixa ----
    function metricsForMonth(yy, mm1) {
        const mk = `${yy}-${String(mm1).padStart(2, '0')}`;
        const dre = computeDre(tx.filter(r => monthKey(r.date) === mk));
        const caixa = caixaAte(mk);
        return {
            mes: mk, ano: yy,
            pmr: null, pmp: null, pme: null,
            cicloOperacional: null, ccc: null,
            caixa, ncg: null, cgl: null, tesouraria: caixa, ncgSobreReceita: null,
            receitaLiquida: dre.receitaLiquida, receitaBruta: dre.receitaBruta,
            despesaOperacional: dre.cmv + dre.despesasOperacionais,
        };
    }
    const serieMensal = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(year, month - i, 1));
        serieMensal.push(metricsForMonth(d.getUTCFullYear(), d.getUTCMonth() + 1));
    }

    function metricsForYear(yy) {
        const dre = computeDre(tx.filter(r => Number(ymd(r.date).slice(0, 4)) === yy));
        const caixa = caixaAte(`${yy}-12`);
        return {
            ano: yy, pmr: null, pmp: null, pme: null,
            cicloOperacional: null, ccc: null,
            caixa, ncg: null, cgl: null, tesouraria: caixa, ncgSobreReceita: null,
            receitaLiquida: dre.receitaLiquida,
        };
    }
    const serieAnual = [year - 2, year - 1, year].map(metricsForYear);

    // ---- retrato atual (pela carteira) ----
    const refM = serieMensal[serieMensal.length - 1];
    const pmr = pmrCarteira ? pmrCarteira.prazo : null;
    const pmp = pmpCarteira ? pmpCarteira.prazo : null;
    const ncg = temCarteira ? carteiraReceber - carteiraPagar : null;
    const caixa = refM.caixa;
    const ccc = (pmr !== null && pmp !== null) ? pmr - pmp : null;
    const ncgSobreReceita = (ncg !== null && refM.receitaLiquida > 0) ? (ncg / refM.receitaLiquida) * 100 : null;

    const atual = {
        mes: refM.mes, ano: refM.ano,
        pmr, pmp, pme: null,
        pmrMetodo: pmr !== null ? 'carteira' : 'indisponivel',
        pmpMetodo: pmp !== null ? 'carteira' : 'indisponivel',
        pmeMetodo: 'indisponivel',
        cicloOperacional: pmr,
        ccc,
        caixa,
        ncg,
        ncgMetodo: ncg !== null ? 'carteira' : 'indisponivel',
        cgl: ncg !== null ? caixa + ncg : null,
        tesouraria: caixa,
        ncgSobreReceita,
        receitaLiquida: refM.receitaLiquida,
        receitaBruta: refM.receitaBruta,
        despesaOperacional: refM.despesaOperacional,
        carteiraReceber, carteiraPagar,
    };

    // ---- comparações (só caixa tem série; prazos são retrato) ----
    const prevM = serieMensal.length >= 2 ? serieMensal[serieMensal.length - 2] : null;
    const delta = (a, b) => (a != null && b != null) ? a - b : null;
    const comparacao = {
        vsMesAnterior: prevM ? {
            pmr: null, pmp: null, ccc: null, ncg: null,
            caixa: delta(atual.caixa, prevM.caixa),
        } : null,
        vsAnoAnterior: null,
    };

    // ---- interpretação (só com suporte nos dados) ----
    const interpretacao = [];
    const rd = (v) => Math.round(v);
    const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (pmr !== null) interpretacao.push(`Pela carteira de previsões em aberto, o prazo médio de recebimento é de ~${rd(pmr)} dias.`);
    if (pmp !== null) interpretacao.push(`O prazo médio de pagamento (previsões de despesa operacional em aberto) é de ~${rd(pmp)} dias.`);
    if (ccc !== null) {
        interpretacao.push(`CCC de ${rd(ccc)} dias: a diferença entre receber e pagar. Um CCC ${ccc < 0 ? 'negativo' : 'positivo'} não é automaticamente ${ccc < 0 ? 'bom' : 'ruim'} — depende do negócio.`);
    }
    if (temCarteira) {
        interpretacao.push(`Previsões em aberto: ${brl(carteiraReceber)} a receber e ${brl(carteiraPagar)} a pagar (operacional) — necessidade de capital de giro de ${brl(ncg)}.`);
    }
    if (ncgSobreReceita !== null) {
        interpretacao.push(`A NCG equivale a ${ncgSobreReceita.toFixed(1)}% da receita líquida do mês de referência.`);
    }
    if (!temCarteira) {
        interpretacao.push('Cadastre previsões de recebimento e de pagamento (aba Previsões) para o sistema estimar PMR, PMP, o CCC e a necessidade de capital de giro.');
    }

    const metodologia = {
        regime: 'caixa',
        pmr: 'Média ponderada, por valor, dos dias entre hoje e a data prevista das previsões de receita operacional ainda não realizadas (carteira em aberto). O sistema é regime de caixa — sem contas a receber, este é o único sinal de prazo disponível.',
        pmp: 'Mesma lógica do PMR, para as previsões de custos e despesas operacionais em aberto (CMV, vendas, pessoal, administrativas, gerais).',
        pme: 'Indisponível. Depende de controle de estoque (saldo periódico ou registro de compras vs. baixas). Enquanto não existir, o Ciclo Operacional e o CCC não incluem a parcela de estoque.',
        caixa: 'Reconstruído a partir do histórico de lançamentos (crédito − débito, exceto cartão de crédito), acumulado até o fim de cada mês.',
        ncg: 'NCG = (previsões de receita em aberto) − (previsões de despesa operacional em aberto). É um retrato do momento, não uma série histórica.',
        cgl: 'Capital de Giro Líquido ≈ Caixa + NCG. Ativo circulante operacional = caixa + previsões a receber; passivo circulante operacional = previsões a pagar. Estoque e outras contas não entram.',
        tesouraria: 'Saldo em Tesouraria = Capital de Giro Líquido − NCG, que aqui equivale ao Caixa. O sistema não separa dívida financeira de curto prazo, então ela não é deduzida.',
    };

    return {
        meta: { ano: year, mes: ref1, janelaMeses: months, metodologia },
        atual,
        serieMensal,
        serieAnual,
        carteiraFutura,
        comparacao,
        interpretacao,
    };
}
