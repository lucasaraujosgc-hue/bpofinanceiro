# Relatórios Financeiros — modelo contábil

> Para revisão do contador. Se algo aqui não bate com a norma, me diga o ponto
> exato que eu ajusto.

## Premissas

- **Regime de caixa.** O sistema só conhece lançamentos **realizados**
  (`transactions`). Não há competência, provisão, depreciação nem contas a
  receber/pagar. O DRE é gerencial, montado sobre o que entrou e saiu.
- **Base:** empresa do **Simples Nacional** (o DAS já embute IRPJ/CSLL/PIS/
  COFINS/CPP e ICMS/ISS). Por isso os "Impostos sobre Vendas" entram como
  **dedução da receita bruta** e a linha **IRPJ/CSLL** normalmente fica zerada
  (só aparece se houver categoria classificada nela).
- **Estrutura do DRE:** art. 187 da Lei 6.404/76, adaptado ao regime de caixa.

## Plano de contas → linha do DRE

Cada **categoria** (aba Categorias) tem um **grupo contábil** (`group_type`). O
mapa é a fonte única da verdade (`ACCOUNTING_GROUPS` em `server.js`):

| Grupo (categoria) | Linha do DRE |
|---|---|
| Receita Bruta | Receita Operacional Bruta |
| Impostos sobre Vendas | (-) Deduções (DAS, ISS, ICMS, PIS/COFINS) |
| Custos (CMV/CPV/CSP) | (-) Custo dos Produtos/Serviços Vendidos |
| Despesas com Vendas | (-) Despesas Operacionais → Vendas |
| Despesas com Pessoal | (-) Despesas Operacionais → Pessoal |
| Despesas Administrativas | (-) Despesas Operacionais → Administrativas |
| Despesas Gerais e Operacionais | (-) Despesas Operacionais → Gerais |
| Outras Receitas Operacionais | (+) Outras Receitas Operacionais |
| Receitas Financeiras | (+) Resultado Financeiro |
| Despesas Financeiras | (-) Resultado Financeiro |
| Receitas Não Operacionais | (+/-) Não Operacional (ganho de capital) |
| Despesas Não Operacionais | (+/-) Não Operacional (perda de capital) |
| IRPJ e CSLL | (-) IRPJ/CSLL |
| **Movimentações Patrimoniais / Internas** | **fora do DRE** |

O último grupo (aportes de sócios, empréstimos tomados/pagos, distribuição de
lucros, compra de ativo, transferências entre contas próprias) **não** afeta o
resultado — é movimento de patrimônio/caixa, não de resultado. Antes tudo isso
inflava "Resultado Não Operacional" e distorcia o lucro.

## DRE Gerencial

```
  Receita Operacional Bruta
(-) Impostos e Deduções sobre Vendas
= Receita Operacional Líquida                        ← base da Análise Vertical (100%)
(-) Custos (CMV / CPV / CSP)
= Lucro Bruto
(-) Despesas com Vendas
(-) Despesas com Pessoal
(-) Despesas Administrativas
(-) Despesas Gerais e Operacionais
(+) Outras Receitas Operacionais
= Resultado Operacional (EBIT)
(+/-) Resultado Financeiro
= Resultado Antes dos Tributos
(+/-) Outras Receitas e Despesas Não Operacionais
(-) IRPJ e CSLL
= Lucro / Prejuízo Líquido do Exercício
```

Mudança principal: a linha que o sistema chamava de **"EBITDA"** era só
`Lucro Bruto − Despesas Operacionais`. Sem regime de competência não há
depreciação/amortização para somar de volta, então EBITDA ≈ EBIT — a linha
agora se chama **Resultado Operacional (EBIT)**, que é o nome correto.

## Análise Detalhada

| Indicador | Fórmula |
|---|---|
| Margem Bruta | Lucro Bruto ÷ Receita Líquida |
| Margem Operacional | Resultado Operacional ÷ Receita Líquida |
| Margem Líquida | Lucro Líquido ÷ Receita Líquida |
| Margem de Contribuição | (Receita Líquida − Custos e Despesas **Variáveis**) ÷ Receita Líquida |
| Ponto de Equilíbrio (R$) | Custos e Despesas **Fixas** ÷ Margem de Contribuição % |
| Margem de Segurança | (Receita Líquida − Ponto de Equilíbrio) ÷ Receita Líquida |
| GAO (alavancagem operacional) | Margem de Contribuição ÷ Resultado Operacional |
| Ticket Médio | Receita Bruta ÷ nº de lançamentos de receita |

**Fixo × Variável:** definido por categoria (aba Categorias → engrenagem →
"Comportamento do custo"). Só custos e despesas **operacionais** (CMV + Vendas
+ Pessoal + Admin + Gerais) entram nessa conta. Padrão do seed: matéria-prima,
comissões, impostos e frete = variável; aluguel, salários, softwares, seguros
= fixo.

Também traz **análise vertical** (cada linha como % da Receita Líquida) e
**horizontal** (variação vs. período anterior), composição das despesas, curva
ABC por categoria, e a conciliação **caixa do período × resultado do DRE** (a
diferença são as movimentações patrimoniais).

## Fluxo de Caixa

- Gráfico principal: **saldo acumulado dia a dia** (área) partindo do saldo de
  abertura do período, com barras de entradas/saídas por dia e destaque para o
  **menor saldo** (risco de furo de caixa).
- `daily-flow` agora normaliza a data com `::date` (lançamentos importados de
  NFe podiam vir com hora e ficar de fora do `BETWEEN`).
- Categorias em barras horizontais (top 7 + "Outros") no lugar das pizzas.

## O que fazer depois de atualizar

1. Categorias antigas continuam funcionando (o servidor deriva a linha do DRE
   pelo `group_type`). Mas revise na aba **Categorias** se cada uma está no
   grupo certo — principalmente separar o que é **movimentação patrimonial**
   (aporte, empréstimo, distribuição de lucro, transferência).
2. Marque fixo/variável nas categorias de custo/despesa para o ponto de
   equilíbrio ficar correto.
3. Contas novas já nascem com o seed novo.
