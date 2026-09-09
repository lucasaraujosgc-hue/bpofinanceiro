import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { computeDre } from '../lib/dre.js';
import { computeFinancialCycle } from '../lib/financialCycle.js';

// Validação de year/month (mesmo espírito do parsePeriod dos relatórios).
function parseRef(q) {
    const y = parseInt(q.year, 10);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return { bad: 'ano inválido' };
    const raw = q.month;
    const has = raw !== undefined && raw !== '' && raw !== 'null' && raw !== null;
    let m = has ? parseInt(raw, 10) : new Date().getMonth();
    if (!Number.isInteger(m) || m < 0 || m > 11) return { bad: 'mês inválido' };
    return { y, m };
}

const ymd = (s) => String(s || '').slice(0, 10);
const monthKey = (s) => ymd(s).slice(0, 7);
const lastDayOf = (yy, m0) => new Date(Date.UTC(yy, m0 + 1, 0)).toISOString().slice(0, 10);

export default function register(app) {
// Visão executiva de Planejamento: realizado × previsto (orçado entra na F2).
// REGRA: realizado = transactions; previsto = forecasts WHERE realized = 0.
// Nunca somar previsão realizada com transação.
app.get('/api/planning/overview', authenticateToken, async (req, res) => {
    const p = parseRef(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const horizonte = [3, 6, 12].includes(parseInt(req.query.horizonte, 10)) ? parseInt(req.query.horizonte, 10) : 3;
    const userId = req.userId;

    const refKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const refEnd = lastDayOf(y, m);
    const winStart = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
    const hoje = new Date().toISOString().slice(0, 10);
    const horizonteEnd = lastDayOf(y, m + horizonte);

    try {
        const [txRes, caixaRes, fcRes] = await Promise.all([
            pool.query(
                `SELECT t.type, t.value, t.date,
                        c.name AS category_name, c.group_type, c.behavior_type
                 FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.date::date >= $2::date AND t.date::date <= $3::date`,
                [userId, winStart, refEnd]),
            pool.query(
                `SELECT COALESCE(SUM(CASE WHEN type = 'credito' THEN value ELSE -value END), 0) AS caixa
                 FROM transactions WHERE user_id = $1 AND credit_card_id IS NULL`,
                [userId]),
            pool.query(
                `SELECT f.type, f.value, f.date, f.credit_card_id, c.group_type
                 FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id
                 WHERE f.user_id = $1 AND COALESCE(f.realized, 0) = 0`,
                [userId]),
        ]);

        const tx = txRes.rows;
        const caixaAtual = Number(caixaRes.rows[0].caixa) || 0;
        const forecasts = fcRes.rows;

        // ---- DRE por mês (12 meses) ----
        const monthsSeq = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(Date.UTC(y, m - i, 1));
            monthsSeq.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
        }
        const dreByMonth = {};
        for (const mk of monthsSeq) dreByMonth[mk] = computeDre(tx.filter(r => monthKey(r.date) === mk));

        // ---- previsto: forecasts pendentes por mês (receita/despesa) ----
        const fcByMonth = {};
        for (const f of forecasts) {
            const mk = monthKey(f.date);
            if (!fcByMonth[mk]) fcByMonth[mk] = { receita: 0, despesa: 0 };
            const v = Math.abs(Number(f.value) || 0);
            if (f.type === 'credito') fcByMonth[mk].receita += v;
            else fcByMonth[mk].despesa += v;
        }

        const cur = dreByMonth[refKey] || computeDre([]);
        const prevYearKey = `${y - 1}-${String(m + 1).padStart(2, '0')}`;
        const prevYearDre = dreByMonth[prevYearKey] || null;

        const receitaRealizada = cur.receitaBruta;
        const despesaRealizada = cur.cmv + cur.despesasOperacionais + cur.despesasFinanceiras + cur.deducoes;
        const receitaPrevista = (fcByMonth[refKey]?.receita) || 0;
        const despesaPrevista = (fcByMonth[refKey]?.despesa) || 0;

        const resultadoRealizado = cur.lucroLiquido;
        const resultadoProjetado = resultadoRealizado + (receitaPrevista - despesaPrevista);

        // caixa projetado = atual + Σ previsões pendentes (crédito − débito, exceto cartão) até o fim do horizonte
        let caixaProjetado = caixaAtual;
        for (const f of forecasts) {
            if (f.credit_card_id) continue;
            const d = ymd(f.date);
            if (d >= hoje && d <= horizonteEnd) {
                caixaProjetado += (f.type === 'credito' ? 1 : -1) * (Number(f.value) || 0);
            }
        }

        // crescimento projetado (receita realizada+prevista vs. mesmo mês ano anterior)
        const receitaProjetadaMes = receitaRealizada + receitaPrevista;
        const crescimentoProjetadoPct = prevYearDre && prevYearDre.receitaBruta > 0
            ? ((receitaProjetadaMes - prevYearDre.receitaBruta) / prevYearDre.receitaBruta) * 100
            : null;

        // margem: 3m atrás vs 3m recentes p/ tendência de despesa x receita
        const rec3 = monthsSeq.slice(-3).reduce((s, k) => s + (dreByMonth[k]?.receitaLiquida || 0), 0);
        const rec3ant = monthsSeq.slice(-6, -3).reduce((s, k) => s + (dreByMonth[k]?.receitaLiquida || 0), 0);
        const desp3 = monthsSeq.slice(-3).reduce((s, k) => s + ((dreByMonth[k]?.cmv || 0) + (dreByMonth[k]?.despesasOperacionais || 0)), 0);
        const desp3ant = monthsSeq.slice(-6, -3).reduce((s, k) => s + ((dreByMonth[k]?.cmv || 0) + (dreByMonth[k]?.despesasOperacionais || 0)), 0);
        const crescRec = rec3ant > 0 ? (rec3 - rec3ant) / rec3ant : null;
        const crescDesp = desp3ant > 0 ? (desp3 - desp3ant) / desp3ant : null;

        // NCG — mesma fonte da aba Ciclo Financeiro (consistência entre telas).
        const cycle = await computeFinancialCycle({ pool, userId, year: y, month: m, months: 6 }).catch(() => null);
        const ncgValor = cycle?.atual?.ncg ?? null;
        const ncgMetodo = cycle?.atual?.ncgMetodo ?? null;

        // ---- alertas (só data-driven) ----
        const alertas = [];
        const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        if (caixaProjetado < 0) {
            alertas.push({ tipo: 'caixa', severidade: 'alta', mensagem: `Caixa projetado negativo em ${horizonte} ${horizonte === 1 ? 'mês' : 'meses'}: ${brl(caixaProjetado)}.` });
        }
        if (cur.pontoEquilibrio && receitaProjetadaMes > 0 && receitaProjetadaMes < cur.pontoEquilibrio) {
            alertas.push({ tipo: 'equilibrio', severidade: 'alta', mensagem: `Receita projetada do mês (${brl(receitaProjetadaMes)}) abaixo do ponto de equilíbrio (${brl(cur.pontoEquilibrio)}). Faltam ${brl(cur.pontoEquilibrio - receitaProjetadaMes)}.` });
        }
        if (crescRec !== null && crescDesp !== null && crescDesp > crescRec + 0.1) {
            alertas.push({ tipo: 'despesa', severidade: 'media', mensagem: `Despesas crescendo mais rápido que a receita nos últimos 3 meses (${(crescDesp * 100).toFixed(1)}% vs ${(crescRec * 100).toFixed(1)}%).` });
        }
        if (ncgValor !== null && ncgValor > 0 && cur.receitaLiquida > 0 && ncgValor / cur.receitaLiquida > 0.30) {
            alertas.push({ tipo: 'capital_giro', severidade: 'media', mensagem: `Necessidade de capital de giro em ${((ncgValor / cur.receitaLiquida) * 100).toFixed(0)}% da receita líquida — pode exigir capital adicional.` });
        }
        if (cur.margemLiquidaPct < 0 && cur.receitaBruta > 0) {
            alertas.push({ tipo: 'margem', severidade: 'alta', mensagem: `Margem líquida negativa no mês (${cur.margemLiquidaPct.toFixed(1)}%).` });
        }

        // ---- séries (12 meses) ----
        const series = {
            receita: monthsSeq.map(k => ({ mes: k, realizado: dreByMonth[k].receitaBruta, previsto: (fcByMonth[k]?.receita) || 0, orcado: null })),
            despesa: monthsSeq.map(k => ({ mes: k, realizado: (dreByMonth[k].cmv + dreByMonth[k].despesasOperacionais), previsto: (fcByMonth[k]?.despesa) || 0, orcado: null })),
            resultado: monthsSeq.map(k => ({ mes: k, realizado: dreByMonth[k].lucroLiquido, previsto: ((fcByMonth[k]?.receita) || 0) - ((fcByMonth[k]?.despesa) || 0), orcado: null })),
            margem: monthsSeq.map(k => ({ mes: k, pct: dreByMonth[k].margemLiquidaPct })),
        };
        // caixa acumulado (12 meses) — cumulativo do net mensal + estimativa até refKey
        // usamos o caixaAtual como âncora do refKey e voltamos pelo net mensal
        const netByMonth = {};
        for (const r of tx) {
            const mk = monthKey(r.date);
            netByMonth[mk] = (netByMonth[mk] || 0) + (r.type === 'credito' ? 1 : -1) * (Number(r.value) || 0);
        }
        const caixaSeries = [];
        let anchor = caixaAtual;
        for (let i = monthsSeq.length - 1; i >= 0; i--) {
            caixaSeries[i] = { mes: monthsSeq[i], saldo: anchor };
            anchor -= (netByMonth[monthsSeq[i]] || 0);
        }
        series.caixa = caixaSeries;

        res.json({
            periodo: { ano: y, mes: m + 1 },
            horizonte,
            receita: { realizada: receitaRealizada, orcada: null, prevista: receitaPrevista },
            despesa: { realizada: despesaRealizada, orcada: null, prevista: despesaPrevista },
            resultado: { realizado: resultadoRealizado, orcado: null, projetado: resultadoProjetado },
            caixa: { atual: caixaAtual, projetado: caixaProjetado },
            pontoEquilibrio: cur.pontoEquilibrio,
            margemSegurancaPct: cur.margemSegurancaPct,
            margemAtualPct: cur.margemLiquidaPct,
            margemContribuicaoPct: cur.margemContribuicaoPct,
            crescimentoProjetadoPct,
            ncg: ncgValor !== null ? { valor: ncgValor, metodo: ncgMetodo } : null,
            alertas,
            series,
            meta: {
                regime: 'caixa',
                nota: 'Orçado ainda não disponível — habilita na aba Orçamento. Realizado vem dos lançamentos; Previsto, das previsões em aberto.',
            },
        });
    } catch (err) {
        console.error('Planning Overview Error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});
}
