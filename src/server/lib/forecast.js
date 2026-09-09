import { pool } from '../db.js';
import { ACCOUNTING_GROUPS } from '../accounting.js';

// ---------------------------------------------------------------------------
// Forecast — projeção Realizado + Forecast.
//
// Aproveita as previsões já cadastradas (forecasts, realized=0): quando há
// previsão manual para uma categoria/mês, o forecast do mês usa
// max(projeção estatística, previsão manual) — o que você já sabe não é
// substituído por uma média.
//
// Métodos (por categoria, por mês futuro):
//   media_historica     — média dos últimos N meses
//   media_movel         — média móvel dos últimos 3 meses
//   crescimento_historico — extrapola a tendência (taxa mensal dos últimos meses)
//   orcamento           — usa o orçamento do ano (fallback: média histórica)
//   sazonalidade        — nível (média 12m) × índice sazonal do mês (precisa 24m+)
// `growthPct` (ao ano) é combinável com qualquer método.
// ---------------------------------------------------------------------------

const METHOD_LABELS = {
    media_historica: 'Média histórica',
    media_movel: 'Média móvel (3 meses)',
    crescimento_historico: 'Crescimento histórico',
    orcamento: 'Orçamento do ano',
    sazonalidade: 'Sazonalidade',
};
const groupOrder = Object.keys(ACCOUNTING_GROUPS);
const rawGt = (gt, kind) => gt || (kind === 'receita' ? 'outras_receitas' : 'despesa_operacional');
// Chave por (grupo, tipo): 'nao_operacional' (type 'ambos') tem entradas e saídas.
const gtKey = (gt, kind) => `${rawGt(gt, kind)}|${kind}`;
const groupLabel = (gt, kind) => {
    const raw = rawGt(gt, kind);
    const base = ACCOUNTING_GROUPS[raw]?.label || (kind === 'receita' ? 'Outras Receitas Operacionais' : 'Despesas Gerais e Operacionais');
    return ACCOUNTING_GROUPS[raw]?.type === 'ambos' ? `${base} (${kind === 'receita' ? 'entradas' : 'saídas'})` : base;
};
const orderIdx = (key) => groupOrder.indexOf(key.split('|')[0]);

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mkKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function computeForecast(userId, { method = 'media_historica', horizon = 12, historyMonths = 12, growthPct = 0 } = {}) {
    const now = new Date();
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // 1º dia do mês corrente
    const lookback = Math.max(historyMonths, 24) + 1;
    const histStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - lookback, 1)).toISOString().slice(0, 10);
    const futureEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + horizon + 1, 0)).toISOString().slice(0, 10);

    const [realRes, budRes, fcRes] = await Promise.all([
        pool.query(
            `SELECT t.category_id, c.name, c.type AS kind, c.group_type,
                    to_char(t.date::date, 'YYYY-MM') AS mes, SUM(t.value)::float AS total
             FROM transactions t JOIN categories c ON c.id = t.category_id
             WHERE t.user_id = $1 AND t.date::date >= $2::date
             GROUP BY t.category_id, c.name, c.type, c.group_type, mes`,
            [userId, histStart]),
        pool.query(
            `SELECT bi.category_id, c.type AS kind, c.group_type, b.year, bi.month, SUM(bi.amount)::float AS amount
             FROM budget_items bi JOIN budgets b ON b.id = bi.budget_id
             LEFT JOIN categories c ON c.id = bi.category_id
             WHERE bi.user_id = $1 AND bi.category_id IS NOT NULL
             GROUP BY bi.category_id, c.type, c.group_type, b.year, bi.month`,
            [userId]),
        pool.query(
            `SELECT f.category_id, c.type AS kind, c.group_type,
                    to_char(f.date::date, 'YYYY-MM') AS mes, SUM(f.value)::float AS total
             FROM forecasts f LEFT JOIN categories c ON c.id = f.category_id
             WHERE f.user_id = $1 AND COALESCE(f.realized,0) = 0 AND f.date::date >= $2::date AND f.date::date <= $3::date
             GROUP BY f.category_id, c.type, c.group_type, mes`,
            [userId, anchor.toISOString().slice(0, 10), futureEnd]),
    ]);

    // ---- séries históricas por categoria ----
    const cats = {}; // catId -> { name, kind, groupType, byMonth: {mk: val} }
    for (const r of realRes.rows) {
        const c = (cats[r.category_id] ||= { categoryId: Number(r.category_id), name: r.name, kind: r.kind || 'despesa', groupType: r.group_type || null, byMonth: {} });
        c.byMonth[r.mes] = Math.abs(Number(r.total) || 0);
    }
    const monthsWithData = new Set(realRes.rows.map(r => r.mes));
    const dataMonths = monthsWithData.size;

    // meses históricos ordenados (últimos `historyMonths` antes do anchor)
    const histKeys = [];
    for (let i = historyMonths; i >= 1; i--) {
        histKeys.push(mkKey(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))));
    }
    const seasonalKeys = []; // 24 meses p/ sazonalidade
    for (let i = 24; i >= 1; i--) seasonalKeys.push(mkKey(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))));

    // orçamento por categoria/ano-mês
    const bud = {};
    for (const r of budRes.rows) bud[`${r.category_id}|${r.year}-${String(r.month).padStart(2, '0')}`] = Number(r.amount) || 0;
    // previsão manual pendente por categoria/mês
    const manual = {};
    for (const r of fcRes.rows) manual[`${r.category_id}|${r.mes}`] = (manual[`${r.category_id}|${r.mes}`] || 0) + Math.abs(Number(r.total) || 0);
    // previsão manual sem categoria (agregada por mês/tipo) — entra no total
    const manualNoCat = {}; // `${mes}|${kind}` -> soma
    for (const r of fcRes.rows) if (!r.category_id) manualNoCat[`${r.mes}|${r.kind || 'despesa'}`] = (manualNoCat[`${r.mes}|${r.kind || 'despesa'}`] || 0) + Math.abs(Number(r.total) || 0);

    const grow = (m) => Math.pow(1 + (Number(growthPct) || 0) / 100, m / 12);

    // índice sazonal por número de mês (1..12), a partir de 24 meses
    let seasonal = null;
    if (method === 'sazonalidade' && dataMonths >= 24) {
        const byNum = {}; const all = [];
        for (const c of Object.values(cats)) {
            for (const mk of seasonalKeys) {
                const v = c.byMonth[mk];
                if (v === undefined) continue;
                const n = Number(mk.slice(5, 7));
                (byNum[n] ||= []).push(v); all.push(v);
            }
        }
        const gAll = mean(all) || 1;
        seasonal = {};
        for (let n = 1; n <= 12; n++) seasonal[n] = byNum[n]?.length ? mean(byNum[n]) / gAll : 1;
    }

    // ---- projeção por categoria por mês futuro ----
    function projectCat(c, futureDate, m) {
        const hist = histKeys.map(k => c.byMonth[k]).filter(v => v !== undefined);
        const last12 = seasonalKeys.slice(-12).map(k => c.byMonth[k]).filter(v => v !== undefined);
        let base;
        if (method === 'media_movel') {
            const mm = histKeys.slice(-3).map(k => c.byMonth[k]).filter(v => v !== undefined);
            base = mean(mm.length ? mm : hist);
        } else if (method === 'crescimento_historico') {
            const recent = mean(histKeys.slice(-3).map(k => c.byMonth[k]).filter(v => v !== undefined));
            const older = mean(histKeys.slice(-6, -3).map(k => c.byMonth[k]).filter(v => v !== undefined));
            const rate = older > 0 ? clamp(Math.pow(recent / older, 1 / 3) - 1, -0.15, 0.15) : 0;
            const anchorVal = histKeys.slice(-1).map(k => c.byMonth[k]).find(v => v !== undefined) ?? mean(hist);
            base = anchorVal * Math.pow(1 + rate, m);
        } else if (method === 'orcamento') {
            const bk = `${c.categoryId}|${mkKey(futureDate)}`;
            base = bud[bk] !== undefined ? bud[bk] : mean(hist);
        } else if (method === 'sazonalidade' && seasonal) {
            base = mean(last12.length ? last12 : hist) * (seasonal[futureDate.getUTCMonth() + 1] || 1);
        } else {
            base = mean(hist); // media_historica (default)
        }
        const proj = Math.max(0, base) * grow(m);
        const man = manual[`${c.categoryId}|${mkKey(futureDate)}`] || 0;
        // Categorias patrimoniais/internas (aporte, distribuição, transferência)
        // não se projetam estatisticamente — só entram se houver previsão lançada.
        const dreLinha = ACCOUNTING_GROUPS[c.groupType]?.dre !== null || c.groupType == null;
        return { proj: dreLinha ? proj : 0, manual: man, forecast: dreLinha ? Math.max(proj, man) : man };
    }

    // ---- monta a série (12 realizados + horizon projetados) ----
    const series = [];
    for (let i = 12; i >= 1; i--) {
        const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
        const mk = mkKey(d);
        let rec = 0, desp = 0;
        for (const c of Object.values(cats)) {
            const v = c.byMonth[mk] || 0;
            if (c.kind === 'receita') rec += v; else desp += v;
        }
        series.push({ mes: mk, tipo: 'realizado', receita: rec, despesa: desp, resultado: rec - desp, previstoManual: 0 });
    }
    // mês corrente (parcial, realizado até agora)
    {
        const mk = mkKey(anchor);
        let rec = 0, desp = 0;
        for (const c of Object.values(cats)) { const v = c.byMonth[mk] || 0; if (c.kind === 'receita') rec += v; else desp += v; }
        series.push({ mes: mk, tipo: 'parcial', receita: rec, despesa: desp, resultado: rec - desp, previstoManual: 0 });
    }

    const byGroupMap = {};
    const resumo = { horizonteMeses: horizon, receita: 0, despesa: 0, resultado: 0 };
    for (let m = 1; m <= horizon; m++) {
        const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + m, 1));
        const mk = mkKey(d);
        let rec = 0, desp = 0, manM = 0;
        for (const c of Object.values(cats)) {
            const { forecast, manual: man } = projectCat(c, d, m);
            if (c.kind === 'receita') rec += forecast; else desp += forecast;
            manM += man;
            const gk = gtKey(c.groupType, c.kind);
            const g = (byGroupMap[gk] ||= { groupType: gk, label: groupLabel(c.groupType, c.kind), kind: c.kind, meses: {}, total: 0 });
            g.meses[mk] = (g.meses[mk] || 0) + forecast;
            g.total += forecast;
        }
        // previsão manual sem categoria
        rec += manualNoCat[`${mk}|receita`] || 0;
        desp += manualNoCat[`${mk}|despesa`] || 0;
        series.push({ mes: mk, tipo: 'projetado', receita: rec, despesa: desp, resultado: rec - desp, previstoManual: manM });
        resumo.receita += rec; resumo.despesa += desp; resumo.resultado += (rec - desp);
    }
    resumo.mediaMensalReceita = resumo.receita / horizon;
    resumo.mediaMensalResultado = resumo.resultado / horizon;

    // vs. mesmo período do ano anterior (se houver histórico suficiente)
    let vsAnoAnterior = null;
    const prevRec = [], prevDesp = [];
    for (let m = 1; m <= horizon; m++) {
        const d = new Date(Date.UTC(anchor.getUTCFullYear() - 1, anchor.getUTCMonth() + m, 1));
        const mk = mkKey(d);
        if (!monthsWithData.has(mk)) continue;
        let rec = 0, desp = 0;
        for (const c of Object.values(cats)) { const v = c.byMonth[mk] || 0; if (c.kind === 'receita') rec += v; else desp += v; }
        prevRec.push(rec); prevDesp.push(desp);
    }
    if (prevRec.length >= Math.min(horizon, 3)) {
        const pr = prevRec.reduce((a, b) => a + b, 0), pd = prevDesp.reduce((a, b) => a + b, 0);
        vsAnoAnterior = {
            receita: pr, despesa: pd, resultado: pr - pd,
            crescimentoReceitaPct: pr > 0 ? ((resumo.receita - pr) / pr) * 100 : null,
        };
    }
    resumo.vsAnoAnterior = vsAnoAnterior;

    const byGroup = Object.values(byGroupMap)
        .filter(g => g.total > 0.01)
        .map(g => ({ ...g, meses: Object.entries(g.meses).sort().map(([mes, v]) => ({ mes, valor: v })) }))
        .sort((a, b) => orderIdx(a.groupType) - orderIdx(b.groupType) || (a.kind === b.kind ? 0 : a.kind === 'receita' ? -1 : 1));

    let aviso = null;
    if (dataMonths < 6) aviso = `Apenas ${dataMonths} ${dataMonths === 1 ? 'mês' : 'meses'} de histórico — a projeção é pouco confiável.`;
    else if (method === 'sazonalidade' && dataMonths < 24) aviso = `Sazonalidade precisa de 24 meses de histórico (há ${dataMonths}). Usando média histórica.`;

    return {
        method: (method === 'sazonalidade' && !seasonal) ? 'media_historica' : method,
        methodLabel: (method === 'sazonalidade' && !seasonal) ? METHOD_LABELS.media_historica : (METHOD_LABELS[method] || METHOD_LABELS.media_historica),
        descricao: descreve(method, seasonal, historyMonths, growthPct, horizon),
        params: { horizon, historyMonths, growthPct },
        dataMonths,
        sazonalidadeDisponivel: dataMonths >= 24,
        series,
        byGroup,
        resumo,
        aviso,
    };
}

function descreve(method, seasonal, N, growth, horizon) {
    const g = Number(growth) || 0;
    const gTxt = g ? ` ${g > 0 ? '+' : ''}${g}% ao ano` : '';
    const base = {
        media_historica: `média dos últimos ${N} meses`,
        media_movel: 'média móvel dos últimos 3 meses',
        crescimento_historico: 'extrapolação da tendência recente',
        orcamento: 'valores do orçamento do ano (média histórica onde não houver orçamento)',
        sazonalidade: seasonal ? 'nível dos últimos 12 meses ajustado pelo padrão sazonal de cada mês' : `média dos últimos ${N} meses`,
    }[method] || `média dos últimos ${N} meses`;
    return `Projeção por ${base}${gTxt}, horizonte de ${horizon} meses. Onde há previsão cadastrada para o mês, usa-se o maior entre a previsão e a projeção.`;
}
