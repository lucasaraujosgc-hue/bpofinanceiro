import { pool } from '../db.js';
import { ACCOUNTING_GROUPS, dreBucketFor } from '../accounting.js';
import { computeDre } from './dre.js';

// ---------------------------------------------------------------------------
// Cenários — aplica um conjunto de premissas sobre uma base (média histórica
// por categoria dos últimos N meses) e devolve DRE projetada, fluxo de caixa
// projetado e indicadores (ponto de equilíbrio, caixa final, NCG).
//
// Princípios:
//   - A DRE projetada usa a MESMA estrutura gerencial (ACCOUNTING_GROUPS +
//     computeDre). Nenhuma classificação paralela.
//   - Regime de caixa, como o resto do sistema. A DRE já é "de caixa"; o fluxo
//     de caixa projetado = resultado do período + itens patrimoniais
//     (investimentos, aportes, empréstimo, distribuição) − variação da NCG.
//   - O cenário "Base" (todas as premissas em zero) ≈ Forecast por média
//     histórica sem crescimento. As premissas ajustam a partir daí.
//   - PMR/PMP alimentam SÓ a necessidade de capital de giro (NCG). Não
//     reprogramam o fluxo de caixa (que segue em regime de caixa).
//   - Movimentos patrimoniais históricos (aporte, distribuição, compra de
//     imobilizado) NÃO são projetados estatisticamente — só entram pelas
//     premissas explícitas.
// ---------------------------------------------------------------------------

const groupOrder = Object.keys(ACCOUNTING_GROUPS);
const rawGt = (gt, kind) => gt || (kind === 'receita' ? 'outras_receitas' : 'despesa_operacional');
const gtKey = (gt, kind) => `${rawGt(gt, kind)}|${kind}`;
const groupLabel = (gt, kind) => {
    const raw = rawGt(gt, kind);
    const base = ACCOUNTING_GROUPS[raw]?.label || (kind === 'receita' ? 'Outras Receitas Operacionais' : 'Despesas Gerais e Operacionais');
    return ACCOUNTING_GROUPS[raw]?.type === 'ambos' ? `${base} (${kind === 'receita' ? 'entradas' : 'saídas'})` : base;
};
const orderIdx = (key) => groupOrder.indexOf(String(key).split('|')[0]);
const mkKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Premissas cruas -> objeto normalizado (defaults e clamps sãos).
export function normalizeAssumptions(a = {}) {
    const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const clampPct = (v) => Math.max(-100, Math.min(1000, num(v)));
    const dias = (v) => {
        const n = parseInt(v, 10);
        return Number.isInteger(n) && n >= 0 && n <= 3650 ? n : null;
    };
    const meses = (v) => {
        const n = parseInt(v, 10);
        return Number.isInteger(n) && n >= 0 && n <= 600 ? n : 0;
    };
    const nnMoney = (v) => Math.max(0, Math.min(1e12, num(v)));
    return {
        receita_crescimento_pct: clampPct(a.receita_crescimento_pct),
        custos_variaveis_delta_pct: clampPct(a.custos_variaveis_delta_pct),
        custos_fixos_delta_pct: clampPct(a.custos_fixos_delta_pct),
        margem_bruta_alvo_pct: (a.margem_bruta_alvo_pct === null || a.margem_bruta_alvo_pct === undefined || a.margem_bruta_alvo_pct === '')
            ? null : Math.max(-100, Math.min(99, num(a.margem_bruta_alvo_pct))),
        inadimplencia_pct: Math.max(0, Math.min(100, num(a.inadimplencia_pct))),
        pmr_dias: dias(a.pmr_dias),
        pmp_dias: dias(a.pmp_dias),
        investimentos_mensais: nnMoney(a.investimentos_mensais),
        aportes_mensais: nnMoney(a.aportes_mensais),
        emprestimo_valor: nnMoney(a.emprestimo_valor),
        emprestimo_juros_mes_pct: Math.max(0, Math.min(100, num(a.emprestimo_juros_mes_pct))),
        emprestimo_amortizacao_meses: meses(a.emprestimo_amortizacao_meses),
        distribuicao_lucros_pct: Math.max(0, Math.min(100, num(a.distribuicao_lucros_pct))),
    };
}

const OP_BUCKETS = new Set(['cmv', 'desp_vendas', 'desp_pessoal', 'desp_admin', 'desp_gerais']);

// Constrói a base: média mensal por categoria (só categorias que entram no DRE).
async function loadBase(userId, historyMonths) {
    const now = new Date();
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - historyMonths, 1)).toISOString().slice(0, 10);
    const end = anchor.toISOString().slice(0, 10);

    const [catRes, caixaRes] = await Promise.all([
        pool.query(
            `SELECT t.category_id, c.name, c.type AS kind, c.group_type, c.behavior_type,
                    to_char(t.date::date, 'YYYY-MM') AS mes, SUM(t.value)::float AS total
             FROM transactions t JOIN categories c ON c.id = t.category_id
             WHERE t.user_id = $1 AND t.date::date >= $2::date AND t.date::date < $3::date
             GROUP BY t.category_id, c.name, c.type, c.group_type, c.behavior_type, mes`,
            [userId, start, end]),
        pool.query(
            `SELECT COALESCE(SUM(CASE WHEN type = 'credito' THEN value ELSE -value END), 0)::float AS caixa
             FROM transactions WHERE user_id = $1 AND credit_card_id IS NULL`,
            [userId]),
    ]);

    const cats = {};
    const monthsSeen = new Set();
    for (const r of catRes.rows) {
        monthsSeen.add(r.mes);
        const gt = r.group_type || null;
        // patrimonial/interno (dre: null) fora — só entra pelas premissas explícitas
        if (gt && ACCOUNTING_GROUPS[gt] && ACCOUNTING_GROUPS[gt].dre === null) continue;
        const c = (cats[r.category_id] ||= {
            categoryId: Number(r.category_id), name: r.name, kind: r.kind || 'despesa',
            groupType: gt, behaviorType: r.behavior_type || null, soma: 0,
        });
        c.soma += Math.abs(Number(r.total) || 0);
    }
    for (const c of Object.values(cats)) c.media = c.soma / historyMonths;

    return { cats: Object.values(cats), caixaAtual: Number(caixaRes.rows[0].caixa) || 0, dataMonths: monthsSeen.size };
}

// Valor projetado de uma categoria num mês futuro `m` (1..horizon), dado o
// fator de crescimento de receita `gRec` já calculado para o mês.
function projectCategoryValue(c, A, gRec) {
    const bucket = dreBucketFor({ group_type: c.groupType, type: c.kind === 'receita' ? 'credito' : 'debito' });
    if (c.kind === 'receita') {
        if (bucket === 'receita_bruta' || bucket === 'outras_receitas_op') return c.media * gRec;
        return c.media; // financeira / não operacional — não acompanha a operação
    }
    // despesas
    if (bucket === 'deducoes') return c.media * gRec;                     // impostos sobre vendas acompanham a receita
    if (bucket === 'cmv') return c.media * (1 + A.custos_variaveis_delta_pct / 100);
    if (OP_BUCKETS.has(bucket)) {
        const pct = c.behaviorType === 'fixa' ? A.custos_fixos_delta_pct : A.custos_variaveis_delta_pct;
        return c.media * (1 + pct / 100);
    }
    return c.media; // financeira / não operacional / irpj — flat
}

export async function computeScenario(userId, { assumptions = {}, horizonMonths = 12, historyMonths = 12 } = {}) {
    const A = normalizeAssumptions(assumptions);
    const horizon = [3, 6, 12, 18, 24, 36].includes(Number(horizonMonths)) ? Number(horizonMonths) : 12;
    const histN = [6, 12, 18, 24].includes(Number(historyMonths)) ? Number(historyMonths) : 12;

    const { cats, caixaAtual, dataMonths } = await loadBase(userId, histN);
    const now = new Date();
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const grow = (m) => Math.pow(1 + A.receita_crescimento_pct / 100, m / 12);

    // Empréstimo: cronograma de amortização linear do principal.
    const amortMes = A.emprestimo_amortizacao_meses > 0 ? A.emprestimo_valor / A.emprestimo_amortizacao_meses : 0;
    const saldoDevedorEm = (m) => {
        if (A.emprestimo_valor <= 0) return 0;
        const pagos = A.emprestimo_amortizacao_meses > 0 ? Math.min(m - 1, A.emprestimo_amortizacao_meses) : 0;
        return Math.max(0, A.emprestimo_valor - amortMes * pagos);
    };

    // ---- NCG da base (operação atual) — âncora p/ a variação da NCG ----
    // Usa as premissas de prazo sobre a média histórica (sem crescimento). A
    // variação da NCG entre este ponto e cada mês projetado é o que consome
    // (ou libera) caixa; a NCG que a operação atual já financia não é cobrada.
    let receitaBrutaBase = 0, despesaOpBase = 0;
    for (const c of cats) {
        const bucket = dreBucketFor({ group_type: c.groupType, type: c.kind === 'receita' ? 'credito' : 'debito' });
        if (c.kind === 'receita' && bucket === 'receita_bruta') receitaBrutaBase += c.media;
        if (c.kind === 'despesa' && OP_BUCKETS.has(bucket)) despesaOpBase += c.media;
    }
    const ncgBase = (A.pmr_dias !== null && A.pmp_dias !== null)
        ? A.pmr_dias * (receitaBrutaBase / 30) - A.pmp_dias * (despesaOpBase / 30)
        : null;

    // ---- monta as linhas sintéticas por mês e roda o DRE ----
    const monthRows = {};        // mk -> rows[] p/ computeDre
    const allRows = [];
    const serieMensal = [];
    const grupoAgg = {};         // gtKey -> { groupType, label, kind, total, meses:{mk:val} }
    const ncgSerie = [];         // { mk, ncg }
    let ncgPrev = ncgBase;

    const pushRow = (mk, type, value, catName, groupType, behavior) => {
        if (!(value > 0)) return;
        const row = { type, value, category_name: catName, group_type: groupType, behavior_type: behavior };
        (monthRows[mk] ||= []).push(row);
        allRows.push(row);
        const kind = type === 'credito' ? 'receita' : 'despesa';
        const key = gtKey(groupType, kind);
        const g = (grupoAgg[key] ||= { groupType: rawGt(groupType, kind), label: groupLabel(groupType, kind), kind, total: 0, meses: {} });
        g.meses[mk] = (g.meses[mk] || 0) + value;
        g.total += value;
    };

    for (let m = 1; m <= horizon; m++) {
        const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + m, 1));
        const mk = mkKey(d);
        const gRec = grow(m);

        // 1) receitas + deduções + despesas estatísticas (exceto CMV se houver meta de margem)
        let receitaBrutaMes = 0, deducoesMes = 0;
        const cmvCats = [];
        for (const c of cats) {
            const v = round2(projectCategoryValue(c, A, gRec));
            const bucket = dreBucketFor({ group_type: c.groupType, type: c.kind === 'receita' ? 'credito' : 'debito' });
            if (c.kind === 'receita') {
                pushRow(mk, 'credito', v, c.name, c.groupType, c.behaviorType);
                if (bucket === 'receita_bruta') receitaBrutaMes += v;
            } else if (bucket === 'deducoes') {
                deducoesMes += v;
                pushRow(mk, 'debito', v, c.name, c.groupType, c.behaviorType);
            } else if (bucket === 'cmv' && A.margem_bruta_alvo_pct !== null) {
                cmvCats.push(c); // adiado — depende da receita líquida
            } else {
                pushRow(mk, 'debito', v, c.name, c.groupType, c.behaviorType);
            }
        }

        // 2) CMV pela meta de margem bruta (se definida)
        if (A.margem_bruta_alvo_pct !== null) {
            const receitaLiquidaMes = receitaBrutaMes - deducoesMes;
            const cmvAlvo = round2(Math.max(0, receitaLiquidaMes * (1 - A.margem_bruta_alvo_pct / 100)));
            pushRow(mk, 'debito', cmvAlvo, 'Custo das mercadorias (meta de margem)', 'custo_operacional', 'variavel');
        }

        // 3) inadimplência estimada (linha operacional visível)
        if (A.inadimplencia_pct > 0 && receitaBrutaMes > 0) {
            pushRow(mk, 'debito', round2(receitaBrutaMes * A.inadimplencia_pct / 100),
                'Perdas estimadas com inadimplência', 'despesa_operacional', 'variavel');
        }

        // 4) juros do empréstimo (despesa financeira)
        const jurosMes = round2(saldoDevedorEm(m) * A.emprestimo_juros_mes_pct / 100);
        if (jurosMes > 0) pushRow(mk, 'debito', jurosMes, 'Juros de empréstimo (cenário)', 'despesa_financeira', 'fixa');

        // ---- DRE do mês ----
        const dre = computeDre(monthRows[mk] || []);
        const despesaOpMes = dre.cmv + dre.despesasOperacionais;

        // ---- NCG do mês (só com PMR e PMP) ----
        let ncgMes = null;
        if (A.pmr_dias !== null && A.pmp_dias !== null) {
            ncgMes = A.pmr_dias * (dre.receitaBruta / 30) - A.pmp_dias * (despesaOpMes / 30);
        }
        ncgSerie.push({ mes: mk, ncg: ncgMes });
        let deltaNcg = (ncgMes !== null && ncgPrev !== null) ? (ncgMes - ncgPrev) : 0;
        if (Math.abs(deltaNcg) < 1) deltaNcg = 0;          // ruído de arredondamento
        if (ncgMes !== null) ncgPrev = ncgMes;

        serieMensal.push({
            mes: mk,
            receita: round2(dre.receitaBruta),
            receitaBruta: round2(dre.receitaBruta),
            despesa: round2(dre.deducoes + dre.cmv + dre.despesasOperacionais + dre.despesasFinanceiras + dre.irpjCsll),
            resultadoOperacional: round2(dre.resultadoOperacional),
            resultado: round2(dre.lucroLiquido),
            margemLiquidaPct: round2(dre.margemLiquidaPct),
            ncg: ncgMes === null ? null : round2(ncgMes),
            // DRE gerencial completa do mês (para a aba Modelagem)
            dre: {
                receitaBruta: round2(dre.receitaBruta),
                deducoes: round2(dre.deducoes),
                receitaLiquida: round2(dre.receitaLiquida),
                cmv: round2(dre.cmv),
                lucroBruto: round2(dre.lucroBruto),
                despesasOperacionais: round2(dre.despesasOperacionais),
                outrasRecOp: round2(dre.outrasRecOp),
                resultadoOperacional: round2(dre.resultadoOperacional),
                resultadoFinanceiro: round2(dre.resultadoFinanceiro),
                resultadoAntesTributos: round2(dre.resultadoAntesTributos),
                resultadoNaoOperacional: round2(dre.resultadoNaoOperacional),
                irpjCsll: round2(dre.irpjCsll),
                lucroLiquido: round2(dre.lucroLiquido),
                margemBrutaPct: round2(dre.margemBrutaPct),
                margemOperacionalPct: round2(dre.margemOperacionalPct),
                margemLiquidaPct: round2(dre.margemLiquidaPct),
            },
            _deltaNcg: deltaNcg,
            _lucro: dre.lucroLiquido,
            _despesaOp: despesaOpMes,
        });
    }

    // ---- DRE agregada do horizonte (com PE, margem de contribuição) ----
    const dreTotal = computeDre(allRows);

    // ---- fluxo de caixa projetado mês a mês ----
    let caixa = caixaAtual;
    let menorCaixa = caixaAtual;
    const fluxo = [];
    for (let i = 0; i < serieMensal.length; i++) {
        const s = serieMensal[i];
        const m = i + 1;
        const distrib = A.distribuicao_lucros_pct > 0 ? Math.max(0, s._lucro) * A.distribuicao_lucros_pct / 100 : 0;
        const amort = (A.emprestimo_amortizacao_meses > 0 && m <= A.emprestimo_amortizacao_meses) ? amortMes : 0;
        const captacao = m === 1 ? A.emprestimo_valor : 0;
        const patrimonial = A.aportes_mensais + captacao - A.investimentos_mensais - amort - distrib;
        const variacaoNcg = s._deltaNcg || 0;
        const geracao = s._lucro;                 // resultado do mês (regime de caixa, já inclui juros)
        const liquido = geracao + patrimonial - variacaoNcg;
        caixa = round2(caixa + liquido);
        menorCaixa = Math.min(menorCaixa, caixa);
        fluxo.push({
            mes: s.mes,
            geracaoOperacional: round2(geracao),
            aportes: round2(A.aportes_mensais),
            captacaoEmprestimo: round2(captacao),
            investimentos: round2(A.investimentos_mensais),
            amortizacao: round2(amort),
            distribuicaoLucros: round2(distrib),
            variacaoNcg: round2(variacaoNcg),
            fluxoLiquido: round2(liquido),
            caixaFim: caixa,
        });
        delete s._deltaNcg; delete s._lucro; delete s._despesaOp;
    }
    const caixaFinal = caixa;
    let mesMenorCaixa = null, _menor = Infinity;
    for (const f of fluxo) { if (f.caixaFim < _menor) { _menor = f.caixaFim; mesMenorCaixa = f.mes; } }

    // ---- quadro de capital de giro por mês (Caixa · NCG · CGL) ----
    const capitalGiroSerie = fluxo.map((f, i) => {
        const ncgM = ncgSerie[i]?.ncg ?? null;
        return {
            mes: f.mes,
            caixa: f.caixaFim,
            ncg: ncgM === null ? null : round2(ncgM),
            cgl: ncgM === null ? null : round2(f.caixaFim + ncgM),
        };
    });

    // ---- grupos do DRE (estrutura ACCOUNTING_GROUPS) ----
    const dreGrupos = Object.values(grupoAgg)
        .filter(g => g.total > 0.01)
        .map(g => ({
            groupType: g.groupType, label: g.label, kind: g.kind, total: round2(g.total),
            meses: serieMensal.map(s => ({ mes: s.mes, valor: round2(g.meses[s.mes] || 0) })),
        }))
        .sort((a, b) => orderIdx(a.groupType) - orderIdx(b.groupType) || (a.kind === b.kind ? 0 : a.kind === 'receita' ? -1 : 1));

    // ---- NCG final ----
    const ncgFinal = ncgSerie.length ? ncgSerie[ncgSerie.length - 1].ncg : null;
    const ncgMetodo = (A.pmr_dias !== null && A.pmp_dias !== null) ? 'premissas' : 'indisponivel';

    const mediaMensalReceita = dreTotal.receitaBruta / horizon;
    const mediaMensalResultado = dreTotal.lucroLiquido / horizon;

    const notas = [
        `Base: média mensal por categoria dos últimos ${histN} meses (equivale ao cenário Base — Forecast por média histórica sem crescimento).`,
        'Regime de caixa: a DRE projetada já é de caixa. O fluxo de caixa projetado = resultado do período + itens patrimoniais (aportes, empréstimo, investimentos, amortização, distribuição) − variação da NCG.',
    ];
    if (A.inadimplencia_pct > 0) notas.push(`Inadimplência de ${A.inadimplencia_pct}% lançada como despesa operacional ("Perdas estimadas com inadimplência"), sobre a receita bruta projetada.`);
    if (A.pmr_dias !== null && A.pmp_dias !== null) notas.push(`NCG = PMR (${A.pmr_dias}d) × receita bruta diária − PMP (${A.pmp_dias}d) × despesa operacional diária. A variação da NCG entre meses entra no fluxo de caixa.`);
    else notas.push('NCG não projetada: informe as premissas de PMR e PMP para o cenário estimar a necessidade de capital de giro.');
    if (A.margem_bruta_alvo_pct !== null) notas.push(`CMV recalculado para a receita líquida atingir margem bruta de ${A.margem_bruta_alvo_pct}% (sobrepõe o Δ de custo variável no CMV).`);
    if (A.emprestimo_valor > 0) notas.push(`Empréstimo de ${A.emprestimo_valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} captado no 1º mês; juros de ${A.emprestimo_juros_mes_pct}% a.m. sobre o saldo (despesa financeira) e amortização em ${A.emprestimo_amortizacao_meses || 0} meses (principal, fora do resultado).`);

    let aviso = null;
    if (dataMonths < 3) aviso = `Apenas ${dataMonths} ${dataMonths === 1 ? 'mês' : 'meses'} de histórico — a base do cenário é pouco confiável.`;
    else if (dataMonths < 6) aviso = `Histórico curto (${dataMonths} meses) — trate os números como ordem de grandeza.`;

    return {
        params: { horizon, historyMonths: histN },
        assumptions: A,
        dataMonths,
        meta: { regime: 'caixa', baseMetodo: `média histórica de ${histN} meses`, notas },
        resumo: {
            horizonteMeses: horizon,
            receita: round2(dreTotal.receitaBruta),
            receitaLiquida: round2(dreTotal.receitaLiquida),
            despesa: round2(dreTotal.deducoes + dreTotal.cmv + dreTotal.despesasOperacionais + dreTotal.despesasFinanceiras + dreTotal.irpjCsll),
            resultadoOperacional: round2(dreTotal.resultadoOperacional),
            lucroLiquido: round2(dreTotal.lucroLiquido),
            margemLiquidaPct: round2(dreTotal.margemLiquidaPct),
            margemContribuicaoPct: round2(dreTotal.margemContribuicaoPct),
            mediaMensalReceita: round2(mediaMensalReceita),
            mediaMensalResultado: round2(mediaMensalResultado),
        },
        indicadores: {
            pontoEquilibrio: dreTotal.pontoEquilibrio === null ? null : round2(dreTotal.pontoEquilibrio),
            pontoEquilibrioMensal: dreTotal.pontoEquilibrio === null ? null : round2(dreTotal.pontoEquilibrio / horizon),
            margemSegurancaPct: dreTotal.margemSegurancaPct === null ? null : round2(dreTotal.margemSegurancaPct),
            margemContribuicao: round2(dreTotal.margemContribuicao),
            margemContribuicaoPct: round2(dreTotal.margemContribuicaoPct),
            grauAlavancagem: dreTotal.grauAlavancagem === null ? null : round2(dreTotal.grauAlavancagem),
            custosDespFixas: round2(dreTotal.custosDespFixas),
            custosDespVariaveis: round2(dreTotal.custosDespVariaveis),
            caixaInicial: round2(caixaAtual),
            caixaFinal: round2(caixaFinal),
            menorCaixaProjetado: round2(menorCaixa),
            mesMenorCaixa,
            // dinheiro que falta cobrir se o caixa ficar negativo em algum mês
            necessidadeMaximaCaixa: menorCaixa < 0 ? round2(-menorCaixa) : 0,
            ncgFinal: ncgFinal === null ? null : round2(ncgFinal),
            cglFinal: ncgFinal === null ? null : round2(caixaFinal + ncgFinal),
            ncgMetodo,
        },
        dre: {
            receitaBruta: round2(dreTotal.receitaBruta),
            deducoes: round2(dreTotal.deducoes),
            receitaLiquida: round2(dreTotal.receitaLiquida),
            cmv: round2(dreTotal.cmv),
            lucroBruto: round2(dreTotal.lucroBruto),
            despesasOperacionais: round2(dreTotal.despesasOperacionais),
            outrasRecOp: round2(dreTotal.outrasRecOp),
            resultadoOperacional: round2(dreTotal.resultadoOperacional),
            resultadoFinanceiro: round2(dreTotal.resultadoFinanceiro),
            resultadoAntesTributos: round2(dreTotal.resultadoAntesTributos),
            resultadoNaoOperacional: round2(dreTotal.resultadoNaoOperacional),
            irpjCsll: round2(dreTotal.irpjCsll),
            lucroLiquido: round2(dreTotal.lucroLiquido),
            margemBrutaPct: round2(dreTotal.margemBrutaPct),
            margemOperacionalPct: round2(dreTotal.margemOperacionalPct),
            margemLiquidaPct: round2(dreTotal.margemLiquidaPct),
        },
        dreGrupos,
        serieMensal,
        fluxoCaixa: {
            caixaInicial: round2(caixaAtual),
            caixaFinal: round2(caixaFinal),
            menorCaixaProjetado: round2(menorCaixa),
            serie: fluxo,
        },
        capitalGiroSerie,
        ncgSerie: ncgSerie.map(x => ({ mes: x.mes, ncg: x.ncg === null ? null : round2(x.ncg) })),
        aviso,
    };
}

// Roda vários cenários e devolve um comparativo lado a lado.
export async function compareScenarios(userId, scenarios, { horizonMonths, historyMonths } = {}) {
    const out = [];
    for (const sc of scenarios) {
        const proj = await computeScenario(userId, {
            assumptions: sc.assumptions || {},
            horizonMonths: horizonMonths || sc.horizon_months || 12,
            historyMonths,
        });
        out.push({
            id: sc.id, name: sc.name, kind: sc.kind,
            receita: proj.resumo.receita,
            despesa: proj.resumo.despesa,
            lucroLiquido: proj.resumo.lucroLiquido,
            margemLiquidaPct: proj.resumo.margemLiquidaPct,
            resultadoOperacional: proj.resumo.resultadoOperacional,
            pontoEquilibrio: proj.indicadores.pontoEquilibrio,
            margemSegurancaPct: proj.indicadores.margemSegurancaPct,
            caixaFinal: proj.indicadores.caixaFinal,
            menorCaixaProjetado: proj.indicadores.menorCaixaProjetado,
            ncgFinal: proj.indicadores.ncgFinal,
            serieResultado: proj.serieMensal.map(s => ({ mes: s.mes, resultado: s.resultado })),
            serieCaixa: proj.fluxoCaixa.serie.map(s => ({ mes: s.mes, caixaFim: s.caixaFim })),
        });
    }
    return out;
}
