import { pool } from '../db.js';
import { ACCOUNTING_GROUPS } from '../accounting.js';

// ---------------------------------------------------------------------------
// Orçado × Realizado — comparação por categoria e grupo do DRE num período.
// Realizado = soma (valor absoluto) das transações da categoria no período.
// Orçado = soma dos itens do orçamento do ano para os meses do período.
// ---------------------------------------------------------------------------

const groupLabel = (gt, kind) =>
    ACCOUNTING_GROUPS[gt]?.label || (kind === 'receita' ? 'Outras Receitas Operacionais' : 'Despesas Gerais e Operacionais');
const groupOrder = Object.keys(ACCOUNTING_GROUPS);
const gtKey = (gt, kind) => gt || (kind === 'receita' ? 'outras_receitas' : 'despesa_operacional');

function statusFor(kind, orcado, realizado) {
    if (orcado <= 0) return realizado > 0 ? 'sem_orcamento' : 'zerado';
    const r = realizado / orcado;
    if (kind === 'receita') return r >= 1 ? 'acima' : r >= 0.9 ? 'atencao' : 'abaixo';
    return r <= 1 ? 'ok' : r <= 1.1 ? 'atencao' : 'estouro';
}

export async function budgetVsActual(userId, year, fromMonth, toMonth) {
    const [budRes, realRes] = await Promise.all([
        pool.query(
            `SELECT bi.category_id, c.name, c.type AS kind, c.group_type, SUM(bi.amount)::float AS orcado
             FROM budget_items bi
             JOIN budgets b ON b.id = bi.budget_id
             LEFT JOIN categories c ON c.id = bi.category_id
             WHERE bi.user_id = $1 AND b.year = $2 AND bi.month BETWEEN $3 AND $4 AND bi.category_id IS NOT NULL
             GROUP BY bi.category_id, c.name, c.type, c.group_type`,
            [userId, year, fromMonth, toMonth]),
        pool.query(
            `SELECT t.category_id, c.name, c.type AS kind, c.group_type, SUM(t.value)::float AS realizado
             FROM transactions t
             JOIN categories c ON c.id = t.category_id
             WHERE t.user_id = $1
               AND EXTRACT(YEAR FROM t.date::date) = $2
               AND EXTRACT(MONTH FROM t.date::date) BETWEEN $3 AND $4
             GROUP BY t.category_id, c.name, c.type, c.group_type`,
            [userId, year, fromMonth, toMonth]),
    ]);

    const hasBudget = budRes.rows.length > 0;

    // merge por categoria
    const byCat = {};
    const put = (catId, meta) => (byCat[catId] ||= { categoryId: Number(catId), name: meta.name || 'Sem categoria', kind: meta.kind || 'despesa', groupType: meta.group_type || null, orcado: 0, realizado: 0 });
    for (const r of realRes.rows) put(r.category_id, r).realizado += Math.abs(Number(r.realizado) || 0);
    for (const r of budRes.rows) put(r.category_id, r).orcado += Number(r.orcado) || 0;

    const linhas = Object.values(byCat)
        .filter(l => l.orcado > 0 || l.realizado > 0)
        .map(l => {
            const difAbs = l.realizado - l.orcado;
            return {
                ...l,
                difAbs,
                difPct: l.orcado > 0 ? (difAbs / l.orcado) * 100 : null,
                status: statusFor(l.kind, l.orcado, l.realizado),
            };
        });

    // agrupa por grupo do DRE
    const grpMap = {};
    for (const l of linhas) {
        const k = gtKey(l.groupType, l.kind);
        (grpMap[k] ||= { groupType: k, label: groupLabel(l.groupType, l.kind), kind: l.kind, orcado: 0, realizado: 0, categorias: [] });
        grpMap[k].orcado += l.orcado;
        grpMap[k].realizado += l.realizado;
        grpMap[k].categorias.push(l);
    }
    const grupos = Object.values(grpMap)
        .map(g => {
            const difAbs = g.realizado - g.orcado;
            g.categorias.sort((a, b) => Math.abs(b.difAbs) - Math.abs(a.difAbs));
            return { ...g, difAbs, difPct: g.orcado > 0 ? (difAbs / g.orcado) * 100 : null, status: statusFor(g.kind, g.orcado, g.realizado) };
        })
        .sort((a, b) => groupOrder.indexOf(a.groupType) - groupOrder.indexOf(b.groupType));

    // totais
    const sum = (arr, kind, field) => arr.filter(x => x.kind === kind).reduce((s, x) => s + x[field], 0);
    const recOrc = sum(linhas, 'receita', 'orcado'), recReal = sum(linhas, 'receita', 'realizado');
    const despOrc = sum(linhas, 'despesa', 'orcado'), despReal = sum(linhas, 'despesa', 'realizado');
    const resultadoOrcado = recOrc - despOrc;
    const resultadoRealizado = recReal - despReal;

    const indicadores = {
        receita: { orcado: recOrc, realizado: recReal, difAbs: recReal - recOrc, difPct: recOrc > 0 ? ((recReal - recOrc) / recOrc) * 100 : null },
        despesa: { orcado: despOrc, realizado: despReal, difAbs: despReal - despOrc, difPct: despOrc > 0 ? ((despReal - despOrc) / despOrc) * 100 : null },
        resultado: { orcado: resultadoOrcado, realizado: resultadoRealizado, difAbs: resultadoRealizado - resultadoOrcado },
        atingimentoReceitaPct: recOrc > 0 ? (recReal / recOrc) * 100 : null,
        controleDespesaPct: despOrc > 0 ? (despReal / despOrc) * 100 : null,
        margemOrcadaPct: recOrc > 0 ? (resultadoOrcado / recOrc) * 100 : null,
        margemRealizadaPct: recReal > 0 ? (resultadoRealizado / recReal) * 100 : null,
    };

    // análise automática (só com suporte nos dados)
    const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const insights = [];
    for (const g of grupos) {
        if (g.orcado <= 0) continue;
        const desvio = g.difPct;
        if (g.kind === 'despesa' && desvio > 5) {
            const top = g.categorias[0];
            insights.push({
                tipo: 'estouro', peso: Math.abs(g.difAbs),
                mensagem: `${g.label} ${desvio.toFixed(1)}% acima do orçado (${brl(g.difAbs)})${top && top.difAbs > 0 ? `, puxado por "${top.name}" (${brl(top.difAbs)})` : ''}.`,
            });
        } else if (g.kind === 'receita' && desvio < -5) {
            const top = [...g.categorias].sort((a, b) => a.difAbs - b.difAbs)[0];
            insights.push({
                tipo: 'abaixo', peso: Math.abs(g.difAbs),
                mensagem: `${g.label} ${Math.abs(desvio).toFixed(1)}% abaixo do orçado (${brl(g.difAbs)})${top && top.difAbs < 0 ? `, principalmente "${top.name}" (${brl(top.difAbs)})` : ''}.`,
            });
        } else if (g.kind === 'despesa' && desvio < -10) {
            insights.push({ tipo: 'economia', peso: Math.abs(g.difAbs), mensagem: `${g.label} ${Math.abs(desvio).toFixed(1)}% abaixo do orçado — economia de ${brl(Math.abs(g.difAbs))}.` });
        }
    }
    insights.sort((a, b) => b.peso - a.peso);
    const analise = insights.slice(0, 5).map(i => ({ tipo: i.tipo, mensagem: i.mensagem }));
    if (recOrc > 0 || despOrc > 0) {
        const dr = resultadoRealizado - resultadoOrcado;
        analise.unshift({
            tipo: dr >= 0 ? 'insight' : 'alerta',
            mensagem: `Resultado realizado de ${brl(resultadoRealizado)} vs. orçado de ${brl(resultadoOrcado)} (${dr >= 0 ? '+' : ''}${brl(dr)}).`,
        });
    }

    return { hasBudget, periodo: { ano: year, deMes: fromMonth, ateMes: toMonth }, indicadores, grupos, linhas, analise };
}
