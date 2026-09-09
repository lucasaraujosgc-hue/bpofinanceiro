import { dreBucketFor } from '../accounting.js';
import { computeDre, OPERACIONAIS } from './dre.js';

// ---------------------------------------------------------------------------
// Ciclo Financeiro — PMR, PMP, PME, Ciclo Operacional, CCC, NCG, Capital de
// Giro Líquido, Saldo em Tesouraria.
//
// O sistema é regime de caixa: não há contas a receber/pagar nem estoque.
//   - PMR/PMP: da data de competência (accrual_date) vs. data de caixa (date).
//     Sem competência num período → estimativa pela carteira de previsões em
//     aberto (rótulo 'carteira'). Sem nada → null.
//   - PME: sempre indisponível (precisa de estoque).
//   - Caixa: reconstruído do histórico de lançamentos.
//   - NCG: PMR × receita bruta diária − PMP × despesa operacional diária
//     (sem a parcela de estoque). Fallback: carteira de previsões.
//   - Capital de Giro Líquido ≈ Caixa + NCG.  Saldo em Tesouraria = CGL − NCG.
// ---------------------------------------------------------------------------

const DAY = 86400000;
const ymd = (s) => String(s || '').slice(0, 10);
const daysBetween = (a, b) => {
    const da = Date.parse(ymd(a)); const db = Date.parse(ymd(b));
    if (Number.isNaN(da) || Number.isNaN(db)) return null;
    return Math.max(0, Math.round((db - da) / DAY));
};
const monthKey = (s) => ymd(s).slice(0, 7);              // 'YYYY-MM'
const daysInMonth = (yy, mm1) => new Date(Date.UTC(yy, mm1, 0)).getUTCDate();
const lastDay = (yy, mm1) => `${yy}-${String(mm1).padStart(2, '0')}-${String(daysInMonth(yy, mm1)).padStart(2, '0')}`;

// média ponderada por valor de dias(accrual → caixa)
function weightedPrazo(rows) {
    let num = 0, den = 0;
    for (const r of rows) {
        if (!r.accrual_date) continue;
        const d = daysBetween(r.accrual_date, r.date);
        if (d === null) continue;
        const v = Math.abs(Number(r.value) || 0);
        num += v * d; den += v;
    }
    return den > 0 ? { prazo: num / den, base: den } : null;
}

// prazo médio da carteira de previsões pendentes (hoje → data prevista)
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

const isReceitaOp = (r) => r.type === 'credito' && dreBucketFor(r) === 'receita_bruta';
const isDespesaOp = (r) => r.type === 'debito' && OPERACIONAIS.has(dreBucketFor(r));

export async function computeFinancialCycle({ pool, userId, year, month, months }) {
    const ref1 = month + 1;                                  // mês de referência 1-12
    const win = Math.max(months, 36) + 1;                    // meses puxados (cobre série mensal + 3 anos)
    // início da janela = `win` meses antes do fim do mês de referência
    const startDate = new Date(Date.UTC(year, month - win + 1, 1)).toISOString().slice(0, 10);
    const endDate = lastDay(year, ref1);
    const hoje = new Date().toISOString().slice(0, 10);

    const [txRes, netRes, fcRes] = await Promise.all([
        pool.query(
            `SELECT t.type, t.value, t.date, t.accrual_date,
                    c.name AS category_name, c.group_type, c.behavior_type
             FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND t.date::date >= $2::date AND t.date::date <= $3::date`,
            [userId, startDate, endDate]),
        // net mensal em TODO o histórico → caixa acumulado sem buracos
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
        // último mês com movimento <= mk
        const keys = Object.keys(caixaAcum).filter(k => k <= mk);
        return keys.length ? caixaAcum[keys[keys.length - 1]] : 0;
    };

    // ---- carteira de previsões (snapshot atual) ----
    // dreBucketFor mapeia group_type -> bucket do DRE (ex.: 'despesa_administrativa' -> 'desp_admin').
    const fcReceita = forecasts.filter(f => f.type === 'credito' && dreBucketFor(f) === 'receita_bruta');
    const fcDespesaOp = forecasts.filter(f => f.type === 'debito' && OPERACIONAIS.has(dreBucketFor(f)));
    const carteiraReceber = fcReceita.reduce((s, f) => s + Math.abs(Number(f.value) || 0), 0);
    const carteiraPagar = fcDespesaOp.reduce((s, f) => s + Math.abs(Number(f.value) || 0), 0);
    const pmrCarteira = carteiraPrazo(fcReceita, hoje);
    const pmpCarteira = carteiraPrazo(fcDespesaOp, hoje);

    // ---- métricas de um mês ----
    function metricsForMonth(yy, mm1) {
        const mk = `${yy}-${String(mm1).padStart(2, '0')}`;
        const nd = daysInMonth(yy, mm1);
        const rows = tx.filter(r => monthKey(r.date) === mk);
        const dre = computeDre(rows);

        const pmrW = weightedPrazo(rows.filter(isReceitaOp));
        const pmpW = weightedPrazo(rows.filter(isDespesaOp));
        const pmr = pmrW ? pmrW.prazo : null;
        const pmp = pmpW ? pmpW.prazo : null;

        const receitaBrutaDia = dre.receitaBruta / nd;
        const despOpDia = (dre.cmv + dre.despesasOperacionais) / nd;
        // NCG pelo ciclo (sem PME). null se faltar PMR ou PMP no mês.
        const ncgCiclo = (pmr !== null && pmp !== null)
            ? pmr * receitaBrutaDia - pmp * despOpDia
            : null;

        const caixa = caixaAte(mk);
        const ncg = ncgCiclo;
        const cgl = ncg !== null ? caixa + ncg : null;
        const tesouraria = caixa;                       // CGL − NCG = caixa
        const cicloOperacional = pmr !== null ? pmr /* + PME(0) */ : null;
        const ccc = (pmr !== null && pmp !== null) ? pmr - pmp /* + PME(0) */ : null;
        const ncgSobreReceita = (ncg !== null && dre.receitaLiquida > 0) ? (ncg / dre.receitaLiquida) * 100 : null;

        return {
            mes: mk, ano: yy,
            pmr, pmp, pme: null,
            cicloOperacional, ccc,
            caixa, ncg, cgl, tesouraria, ncgSobreReceita,
            receitaLiquida: dre.receitaLiquida, receitaBruta: dre.receitaBruta,
            despesaOperacional: dre.cmv + dre.despesasOperacionais,
        };
    }

    // ---- série mensal (últimos `months` meses até a referência) ----
    const serieMensal = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(year, month - i, 1));
        serieMensal.push(metricsForMonth(d.getUTCFullYear(), d.getUTCMonth() + 1));
    }

    // ---- série anual (ano de referência e 2 anteriores) ----
    function metricsForYear(yy) {
        const rows = tx.filter(r => Number(ymd(r.date).slice(0, 4)) === yy);
        const dre = computeDre(rows);
        const nd = (yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? 366 : 365;
        const pmrW = weightedPrazo(rows.filter(isReceitaOp));
        const pmpW = weightedPrazo(rows.filter(isDespesaOp));
        const pmr = pmrW ? pmrW.prazo : null;
        const pmp = pmpW ? pmpW.prazo : null;
        const ncg = (pmr !== null && pmp !== null)
            ? pmr * (dre.receitaBruta / nd) - pmp * ((dre.cmv + dre.despesasOperacionais) / nd)
            : null;
        const caixa = caixaAte(`${yy}-12`);
        return {
            ano: yy, pmr, pmp, pme: null,
            cicloOperacional: pmr, ccc: (pmr !== null && pmp !== null) ? pmr - pmp : null,
            caixa, ncg, cgl: ncg !== null ? caixa + ncg : null, tesouraria: caixa,
            ncgSobreReceita: (ncg !== null && dre.receitaLiquida > 0) ? (ncg / dre.receitaLiquida) * 100 : null,
            receitaLiquida: dre.receitaLiquida,
        };
    }
    const serieAnual = [year - 2, year - 1, year].map(metricsForYear);

    // ---- valor "atual" (mês de referência) com fallback de carteira ----
    const refM = serieMensal[serieMensal.length - 1];
    const pmrFallback = refM.pmr === null && pmrCarteira ? pmrCarteira.prazo : null;
    const pmpFallback = refM.pmp === null && pmpCarteira ? pmpCarteira.prazo : null;
    const ncgCarteira = (carteiraReceber > 0 || carteiraPagar > 0) ? carteiraReceber - carteiraPagar : null;

    const atual = {
        ...refM,
        pmr: refM.pmr ?? pmrFallback,
        pmrMetodo: refM.pmr !== null ? 'competencia' : (pmrFallback !== null ? 'carteira' : 'indisponivel'),
        pmp: refM.pmp ?? pmpFallback,
        pmpMetodo: refM.pmp !== null ? 'competencia' : (pmpFallback !== null ? 'carteira' : 'indisponivel'),
        pmeMetodo: 'indisponivel',
        ncg: refM.ncg ?? ncgCarteira,
        ncgMetodo: refM.ncg !== null ? 'ciclo' : (ncgCarteira !== null ? 'carteira' : 'indisponivel'),
        carteiraReceber, carteiraPagar,
    };
    if (atual.ncg !== null && atual.cgl === null) atual.cgl = atual.caixa + atual.ncg;
    atual.cicloOperacional = atual.pmr ?? null;
    atual.ccc = (atual.pmr !== null && atual.pmp !== null) ? atual.pmr - atual.pmp : null;

    // ---- comparações ----
    const prevM = serieMensal.length >= 2 ? serieMensal[serieMensal.length - 2] : null;
    const sameMonthLastYear = tx.length ? metricsForMonth(year - 1, ref1) : null;
    const delta = (a, b) => (a !== null && a !== undefined && b !== null && b !== undefined) ? a - b : null;
    const comparacao = {
        vsMesAnterior: prevM ? {
            pmr: delta(atual.pmr, prevM.pmr), pmp: delta(atual.pmp, prevM.pmp),
            ccc: delta(atual.ccc, prevM.ccc), ncg: delta(atual.ncg, prevM.ncg),
            caixa: delta(atual.caixa, prevM.caixa),
        } : null,
        vsAnoAnterior: sameMonthLastYear ? {
            pmr: delta(atual.pmr, sameMonthLastYear.pmr), pmp: delta(atual.pmp, sameMonthLastYear.pmp),
            ccc: delta(atual.ccc, sameMonthLastYear.ccc), ncg: delta(atual.ncg, sameMonthLastYear.ncg),
        } : null,
    };

    // ---- interpretação automática (só com suporte nos dados) ----
    const interpretacao = [];
    const rd = (v) => Math.round(v);
    const pmrPoints = serieMensal.filter(s => s.pmr !== null);
    if (pmrPoints.length >= 2) {
        const first = pmrPoints[0], last = pmrPoints[pmrPoints.length - 1];
        const dif = last.pmr - first.pmr;
        if (Math.abs(dif) >= 5) {
            interpretacao.push(`O PMR passou de ${rd(first.pmr)} para ${rd(last.pmr)} dias entre ${first.mes} e ${last.mes}. ${dif > 0 ? 'Prazos maiores tendem a aumentar a necessidade de capital de giro.' : 'A redução alivia a necessidade de capital de giro.'}`);
        }
    }
    const pmpPoints = serieMensal.filter(s => s.pmp !== null);
    if (pmpPoints.length >= 2) {
        const first = pmpPoints[0], last = pmpPoints[pmpPoints.length - 1];
        if (Math.abs(last.pmp - first.pmp) >= 5) {
            interpretacao.push(`O PMP passou de ${rd(first.pmp)} para ${rd(last.pmp)} dias entre ${first.mes} e ${last.mes}.`);
        }
    }
    if (atual.ccc !== null) {
        interpretacao.push(`CCC de ${rd(atual.ccc)} dias: em média, a empresa precisa financiar cerca de ${rd(atual.ccc)} dias do ciclo operacional com recursos próprios ou de terceiros. Um CCC ${atual.ccc < 0 ? 'negativo' : 'positivo'} não é automaticamente ${atual.ccc < 0 ? 'bom' : 'ruim'} — depende da natureza do negócio.`);
    }
    if (atual.ncgSobreReceita !== null) {
        interpretacao.push(`A NCG equivale a ${atual.ncgSobreReceita.toFixed(1)}% da receita líquida do período.`);
    }
    if (comparacao.vsMesAnterior && comparacao.vsMesAnterior.ncg !== null && comparacao.vsMesAnterior.ncg > 0
        && prevM && Math.abs(atual.receitaLiquida - prevM.receitaLiquida) / Math.max(prevM.receitaLiquida, 1) < 0.05) {
        interpretacao.push('A NCG cresceu com a receita praticamente estável — atenção ao caixa necessário para sustentar a operação.');
    }
    if (atual.pmrMetodo === 'indisponivel') {
        interpretacao.push('PMR indisponível: informe a "data de competência" nos lançamentos de receita para o sistema calcular o prazo médio de recebimento.');
    }

    const metodologia = {
        regime: 'caixa',
        pmr: 'Média ponderada, por valor, dos dias entre a data de competência (emissão) e a data de recebimento das receitas operacionais. Lançamento sem competência = à vista (0 dias). Sem nenhuma competência no período, usa-se o prazo médio da carteira de previsões de receita em aberto (rótulo "carteira").',
        pmp: 'Mesma lógica do PMR, para custos e despesas operacionais (CMV, vendas, pessoal, administrativas, gerais).',
        pme: 'Indisponível. Depende de controle de estoque: saldo de estoque periódico OU registro de compras vs. baixas, para calcular Estoque Médio ÷ CMV × dias. Enquanto não existir, o Ciclo Operacional e o CCC mostrados não incluem a parcela de estoque.',
        caixa: 'Reconstruído a partir do histórico de lançamentos (crédito − débito, exceto cartão de crédito), acumulado até o fim de cada mês.',
        ncg: 'NCG = PMR × (receita bruta diária) − PMP × (despesa operacional diária). Sem PME, a parcela de estoque fica de fora. Quando não há dados de competência, usa-se a carteira de previsões: (receita a receber) − (despesa operacional a pagar).',
        cgl: 'Capital de Giro Líquido ≈ Caixa + NCG. Ativo circulante operacional = caixa + contas a receber; passivo circulante operacional = contas a pagar. Estoque e outras contas não entram.',
        tesouraria: 'Saldo em Tesouraria = Capital de Giro Líquido − NCG, que aqui equivale ao Caixa. É o dinheiro efetivamente disponível (caixa + aplicações). O sistema não separa dívida financeira de curto prazo, então ela não é deduzida.',
    };

    return {
        meta: { ano: year, mes: ref1, janelaMeses: months, metodologia },
        atual,
        serieMensal,
        serieAnual,
        comparacao,
        interpretacao,
    };
}
