import { dreBucketFor } from '../accounting.js';

// ---------------------------------------------------------------------------
// Redução de um conjunto de linhas de transação ao DRE gerencial + margem de
// contribuição + ponto de equilíbrio + composição fixo/variável + Pareto.
//
// Fonte única — o handler /api/reports/analysis e o Dashboard de Planejamento
// consomem daqui. NÃO alterar o cálculo sem revisar os dois.
//
// Cada `row` precisa de: { type: 'credito'|'debito', value, category_name,
// group_type, behavior_type }.
//
// Fórmulas (conferidas):
//   Margem de Contribuição (MC) = Receita Líquida − custos/despesas VARIÁVEIS
//   MC% = MC / RL
//   Ponto de Equilíbrio (R$ de RL) = custos/despesas FIXAS ÷ MC%
//   Margem de Segurança % = (RL − PE) / RL
//   Grau de Alavancagem Operacional = MC ÷ Resultado Operacional
//
// Nota: "variável" x "fixa" vem de `behavior_type` na categoria; despesa
// operacional sem behavior_type cai como variável (default conservador — puxa
// o PE para cima). É comportamento intencional herdado.
// ---------------------------------------------------------------------------

// Custos/despesas operacionais que entram no cálculo de fixo x variável.
export const OPERACIONAIS = new Set(['cmv', 'desp_vendas', 'desp_pessoal', 'desp_admin', 'desp_gerais']);

export function computeDre(rows) {
    const B = {};                // bucket -> soma
    const catDespesa = {};       // categoria -> soma (só despesas que afetam o DRE)
    const catReceita = {};       // categoria -> soma (só receitas operacionais)
    let custosFixos = 0, custosVariaveis = 0;
    let nReceitaBruta = 0;
    let entradasCaixa = 0, saidasCaixa = 0;   // movimento real de caixa (tudo)

    rows.forEach(r => {
        const val = Number(r.value) || 0;
        if (r.type === 'credito') entradasCaixa += val; else saidasCaixa += val;

        const bk = dreBucketFor(r);
        if (!bk) return; // patrimonial/interno — fora do DRE
        B[bk] = (B[bk] || 0) + val;

        const cat = r.category_name || 'Sem categoria';
        if (r.type === 'credito') {
            if (bk === 'receita_bruta') { nReceitaBruta += 1; catReceita[cat] = (catReceita[cat] || 0) + val; }
            if (bk === 'outras_receitas_op') catReceita[cat] = (catReceita[cat] || 0) + val;
        } else {
            if (OPERACIONAIS.has(bk)) {
                catDespesa[cat] = (catDespesa[cat] || 0) + val;
                if (r.behavior_type === 'fixa') custosFixos += val;
                else custosVariaveis += val;
            }
        }
    });
    const g = k => B[k] || 0;

    const receitaBruta = g('receita_bruta');
    const deducoes = g('deducoes');
    const receitaLiquida = receitaBruta - deducoes;
    const cmv = g('cmv');
    const lucroBruto = receitaLiquida - cmv;
    const despVendas = g('desp_vendas'), despPessoal = g('desp_pessoal'),
          despAdmin = g('desp_admin'), despGerais = g('desp_gerais');
    const despesasOperacionais = despVendas + despPessoal + despAdmin + despGerais;
    const outrasRecOp = g('outras_receitas_op');
    const resultadoOperacional = lucroBruto - despesasOperacionais + outrasRecOp;
    const resultadoFinanceiro = g('receita_financeira') - g('despesa_financeira');
    const despesasFinanceiras = g('despesa_financeira');
    const resultadoAntesTributos = resultadoOperacional + resultadoFinanceiro;
    const resultadoNaoOperacional = g('receita_nao_op') - g('despesa_nao_op');
    const irpjCsll = g('irpj_csll');
    const lucroLiquido = resultadoAntesTributos + resultadoNaoOperacional - irpjCsll;

    // Margem de contribuição = RL − (custos e despesas VARIÁVEIS)
    const custosDespVariaveis = custosVariaveis;
    const margemContribuicao = receitaLiquida - custosDespVariaveis;
    const margemContribuicaoPct = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0;
    const custosDespFixas = custosFixos;
    // Ponto de equilíbrio contábil (R$ de receita líquida)
    const pontoEquilibrio = margemContribuicaoPct > 0 ? custosDespFixas / (margemContribuicaoPct / 100) : null;
    const margemSegurancaPct = (pontoEquilibrio && receitaLiquida > 0)
        ? ((receitaLiquida - pontoEquilibrio) / receitaLiquida) * 100 : null;
    const grauAlavancagem = resultadoOperacional !== 0 ? margemContribuicao / resultadoOperacional : null;

    return {
        receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto,
        despVendas, despPessoal, despAdmin, despGerais, despesasOperacionais, outrasRecOp,
        resultadoOperacional, resultadoFinanceiro, despesasFinanceiras,
        resultadoAntesTributos, resultadoNaoOperacional, irpjCsll, lucroLiquido,
        margemBrutaPct: receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
        margemOperacionalPct: receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : 0,
        margemLiquidaPct: receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0,
        margemContribuicao, margemContribuicaoPct,
        custosDespFixas, custosDespVariaveis,
        pctCustoFixo: (custosFixos + custosVariaveis) > 0 ? (custosFixos / (custosFixos + custosVariaveis)) * 100 : 0,
        pontoEquilibrio, margemSegurancaPct, grauAlavancagem,
        nReceitaBruta, ticketMedio: nReceitaBruta > 0 ? receitaBruta / nReceitaBruta : 0,
        entradasCaixa, saidasCaixa, geracaoCaixa: entradasCaixa - saidasCaixa,
        catDespesa, catReceita,
    };
}
