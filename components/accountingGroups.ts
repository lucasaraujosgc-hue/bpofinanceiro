// Grupos contábeis — batem com src/server/accounting.js (ACCOUNTING_GROUPS).
// Ordem = ordem no DRE. Usado em Categorias e no Orçamento.

export interface GroupDef { id: string; label: string; kind: 'receita' | 'despesa'; dre: boolean; }

export const INCOME_GROUPS: GroupDef[] = [
  { id: 'receita_bruta', label: 'Receita Bruta', kind: 'receita', dre: true },
  { id: 'outras_receitas', label: 'Outras Receitas Operacionais', kind: 'receita', dre: true },
  { id: 'receita_financeira', label: 'Receitas Financeiras', kind: 'receita', dre: true },
  { id: 'receita_nao_operacional', label: 'Receitas Não Operacionais', kind: 'receita', dre: true },
  { id: 'nao_operacional', label: 'Movimentações Patrimoniais / Internas', kind: 'receita', dre: false },
];

export const EXPENSE_GROUPS: GroupDef[] = [
  { id: 'impostos', label: 'Impostos sobre Vendas (Deduções)', kind: 'despesa', dre: true },
  { id: 'custo_operacional', label: 'Custos (CMV / CPV / CSP)', kind: 'despesa', dre: true },
  { id: 'despesa_com_vendas', label: 'Despesas com Vendas', kind: 'despesa', dre: true },
  { id: 'despesa_pessoal', label: 'Despesas com Pessoal', kind: 'despesa', dre: true },
  { id: 'despesa_administrativa', label: 'Despesas Administrativas', kind: 'despesa', dre: true },
  { id: 'despesa_operacional', label: 'Despesas Gerais e Operacionais', kind: 'despesa', dre: true },
  { id: 'despesa_financeira', label: 'Despesas Financeiras', kind: 'despesa', dre: true },
  { id: 'despesa_nao_operacional', label: 'Despesas Não Operacionais', kind: 'despesa', dre: true },
  { id: 'impostos_sobre_lucro', label: 'IRPJ e CSLL', kind: 'despesa', dre: true },
  { id: 'nao_operacional', label: 'Movimentações Patrimoniais / Internas', kind: 'despesa', dre: false },
];

export const ALL_GROUPS = [...INCOME_GROUPS, ...EXPENSE_GROUPS];

export const groupLabel = (id: string | undefined | null, kind?: 'receita' | 'despesa'): string => {
  if (!id) return kind === 'receita' ? 'Outras Receitas Operacionais' : 'Despesas Gerais e Operacionais';
  const list = kind === 'receita' ? INCOME_GROUPS : kind === 'despesa' ? EXPENSE_GROUPS : ALL_GROUPS;
  return list.find(g => g.id === id)?.label || id;
};
