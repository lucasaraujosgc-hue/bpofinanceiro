// Seed do plano de contas de um usuário novo (aplicado no signup e no primeiro
// GET /api/categories). O SCHEMA do banco não mora mais aqui — ver
// src/server/migrations/ + src/server/migrate.js.

export const INITIAL_CATEGORIES_SEED = [
  // ---- Receitas -------------------------------------------------------
  { name: 'Vendas de Mercadorias', type: 'receita', group: 'receita_bruta', behavior: 'variavel' },
  { name: 'Prestação de Serviços', type: 'receita', group: 'receita_bruta', behavior: 'variavel' },
  { name: 'Comissões Recebidas', type: 'receita', group: 'receita_bruta', behavior: 'variavel' },
  { name: 'Receita de Aluguel', type: 'receita', group: 'outras_receitas', behavior: 'fixa' },
  { name: 'Outras Receitas Operacionais', type: 'receita', group: 'outras_receitas', behavior: 'variavel' },
  { name: 'Reembolsos de Clientes', type: 'receita', group: 'outras_receitas', behavior: 'variavel' },
  { name: 'Receitas Financeiras (juros, rendimentos)', type: 'receita', group: 'receita_financeira', behavior: 'variavel' },
  { name: 'Venda de Ativo Imobilizado', type: 'receita', group: 'receita_nao_operacional', behavior: 'variavel' },
  { name: 'Aportes de Sócios / Investimentos', type: 'receita', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Empréstimos Recebidos', type: 'receita', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Transferências entre Contas (Entrada)', type: 'receita', group: 'nao_operacional', behavior: 'variavel' },
  // ---- Custos (CMV / CPV / CSP) --------------------------------------
  { name: 'Compra de Mercadorias', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  { name: 'Custos de Serviços Prestados', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  { name: 'Insumos e Matéria-Prima', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  { name: 'Frete sobre Compras', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  // ---- Despesas com Vendas -----------------------------------------
  { name: 'Comissões sobre Vendas', type: 'despesa', group: 'despesa_com_vendas', behavior: 'variavel' },
  { name: 'Marketing e Publicidade', type: 'despesa', group: 'despesa_com_vendas', behavior: 'variavel' },
  { name: 'Frete sobre Vendas', type: 'despesa', group: 'despesa_com_vendas', behavior: 'variavel' },
  // ---- Despesas com Pessoal ---------------------------------------
  { name: 'Salários e Ordenados', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  { name: 'Pró-Labore', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  { name: 'Encargos (FGTS, INSS, IRRF)', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  { name: 'Benefícios (VT, VR, Plano de Saúde)', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  // ---- Despesas Administrativas ----------------------------------
  { name: 'Aluguel e Condomínio', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Energia, Água e Internet', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Material de Escritório e Limpeza', type: 'despesa', group: 'despesa_administrativa', behavior: 'variavel' },
  { name: 'Seguros', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Sistemas e Softwares (assinaturas)', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Serviços de Terceiros (Contabilidade, Jurídico)', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  // ---- Despesas Gerais / Operacionais ---------------------------
  { name: 'Combustível e Deslocamento', type: 'despesa', group: 'despesa_operacional', behavior: 'variavel' },
  { name: 'Manutenção e Reparos', type: 'despesa', group: 'despesa_operacional', behavior: 'variavel' },
  // ---- Deduções e Tributos -------------------------------------
  { name: 'Impostos sobre Vendas (DAS, ISS, ICMS, PIS/COFINS)', type: 'despesa', group: 'impostos', behavior: 'variavel' },
  { name: 'IRPJ e CSLL', type: 'despesa', group: 'impostos_sobre_lucro', behavior: 'variavel' },
  // ---- Resultado Financeiro -----------------------------------
  { name: 'Tarifas Bancárias', type: 'despesa', group: 'despesa_financeira', behavior: 'fixa' },
  { name: 'Juros e Multas Pagos', type: 'despesa', group: 'despesa_financeira', behavior: 'variavel' },
  // ---- Não operacional / patrimonial (fora do DRE) ------------
  { name: 'Distribuição de Lucros', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Pagamento de Empréstimos', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Compra de Ativo Imobilizado', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Transferências entre Contas (Saída)', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' }
];
