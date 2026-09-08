// ---------------------------------------------------------------------------
// Plano de contas gerencial — fonte única da verdade.
// Cada group_type de uma categoria mapeia para uma linha do DRE.
// `dre: null` => movimento patrimonial/interno: NÃO entra no DRE.
// ---------------------------------------------------------------------------
export const ACCOUNTING_GROUPS = {
  // receitas
  receita_bruta:            { type: 'receita', label: 'Receita Bruta',                       dre: 'receita_bruta' },
  outras_receitas:          { type: 'receita', label: 'Outras Receitas Operacionais',        dre: 'outras_receitas_op' },
  receita_financeira:       { type: 'receita', label: 'Receitas Financeiras',                dre: 'receita_financeira' },
  receita_nao_operacional:  { type: 'receita', label: 'Receitas Não Operacionais',           dre: 'receita_nao_op' },
  // despesas
  impostos:                 { type: 'despesa', label: 'Impostos sobre Vendas',               dre: 'deducoes' },
  custo_operacional:        { type: 'despesa', label: 'Custos (CMV / CPV / CSP)',             dre: 'cmv' },
  despesa_com_vendas:       { type: 'despesa', label: 'Despesas com Vendas',                 dre: 'desp_vendas' },
  despesa_pessoal:          { type: 'despesa', label: 'Despesas com Pessoal',                dre: 'desp_pessoal' },
  despesa_administrativa:   { type: 'despesa', label: 'Despesas Administrativas',            dre: 'desp_admin' },
  despesa_operacional:      { type: 'despesa', label: 'Despesas Gerais e Operacionais',      dre: 'desp_gerais' },
  despesa_financeira:       { type: 'despesa', label: 'Despesas Financeiras',                dre: 'despesa_financeira' },
  despesa_nao_operacional:  { type: 'despesa', label: 'Despesas Não Operacionais',           dre: 'despesa_nao_op' },
  impostos_sobre_lucro:     { type: 'despesa', label: 'IRPJ e CSLL',                         dre: 'irpj_csll' },
  // patrimonial / interno — fora do DRE
  nao_operacional:          { type: 'ambos',   label: 'Movimentações Patrimoniais / Internas', dre: null },
};

// Resolve o "bucket" de DRE de uma linha de transação a partir do group_type.
// Sem categoria/grupo: receita entra em receita_bruta, despesa em desp_gerais
// (mantém o comportamento anterior de não "sumir" com lançamentos soltos).
export function dreBucketFor(row) {
  const g = ACCOUNTING_GROUPS[row.group_type];
  if (g) return g.dre; // pode ser null (fora do DRE)
  return row.type === 'credito' ? 'receita_bruta' : 'desp_gerais';
}
