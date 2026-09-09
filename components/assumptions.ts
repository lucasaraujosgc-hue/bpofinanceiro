/* Premissas de cenário / simulador — metadados compartilhados entre
 * PlanningScenarios e PlanningSimulator. As chaves batem com
 * src/server/schemas.js (assumptionsSchema) e src/server/lib/scenario.js. */

export interface AssumptionField {
  key: string;
  label: string;
  suffix: string;
  hint: string;
  nullable?: boolean;               // '' → null (não aplica), em vez de 0
  slider?: { min: number; max: number; step: number };
}

export const ASSUMPTION_GROUPS: { title: string; fields: AssumptionField[] }[] = [
  {
    title: 'Receita',
    fields: [
      { key: 'receita_crescimento_pct', label: 'Crescimento da receita', suffix: '% a.a.',
        hint: 'Aplicado às receitas operacionais. Impostos sobre vendas acompanham.',
        slider: { min: -50, max: 100, step: 1 } },
    ],
  },
  {
    title: 'Custos e despesas',
    fields: [
      { key: 'custos_variaveis_delta_pct', label: 'Variação dos custos variáveis', suffix: '%',
        hint: 'CMV e despesas variáveis (comissões, frete, marketing…).',
        slider: { min: -50, max: 50, step: 1 } },
      { key: 'custos_fixos_delta_pct', label: 'Variação dos custos fixos', suffix: '%',
        hint: 'Aluguel, folha, pró-labore, contabilidade…',
        slider: { min: -50, max: 50, step: 1 } },
      { key: 'margem_bruta_alvo_pct', label: 'Margem bruta alvo', suffix: '%', nullable: true,
        hint: 'Se preenchida, recalcula o CMV para atingir essa margem (sobrepõe o Δ de custo variável no CMV). Vazio = não usa.' },
    ],
  },
  {
    title: 'Recebimento e pagamento',
    fields: [
      { key: 'inadimplencia_pct', label: 'Inadimplência', suffix: '% da receita',
        hint: 'Lançada como despesa operacional ("Perdas estimadas com inadimplência").',
        slider: { min: 0, max: 30, step: 0.5 } },
      { key: 'pmr_dias', label: 'Prazo médio de recebimento', suffix: 'dias', nullable: true,
        hint: 'Usado só para estimar a necessidade de capital de giro (NCG).' },
      { key: 'pmp_dias', label: 'Prazo médio de pagamento', suffix: 'dias', nullable: true,
        hint: 'Usado só para estimar a NCG.' },
    ],
  },
  {
    title: 'Caixa e capital',
    fields: [
      { key: 'investimentos_mensais', label: 'Investimentos / mês', suffix: 'R$',
        hint: 'Saída de caixa mensal (imobilizado). Não afeta o resultado.' },
      { key: 'aportes_mensais', label: 'Aportes de sócios / mês', suffix: 'R$',
        hint: 'Entrada de caixa mensal. Não afeta o resultado.' },
      { key: 'emprestimo_valor', label: 'Empréstimo (captação)', suffix: 'R$',
        hint: 'Entrada de caixa única no 1º mês projetado.' },
      { key: 'emprestimo_juros_mes_pct', label: 'Juros do empréstimo', suffix: '% a.m.',
        hint: 'Sobre o saldo devedor. Entra como despesa financeira.' },
      { key: 'emprestimo_amortizacao_meses', label: 'Amortização', suffix: 'meses',
        hint: 'Nº de meses para pagar o principal (saída de caixa, fora do resultado).' },
      { key: 'distribuicao_lucros_pct', label: 'Distribuição de lucros', suffix: '% do lucro',
        hint: 'Saída de caixa mensal = % sobre o lucro líquido do mês.',
        slider: { min: 0, max: 100, step: 5 } },
    ],
  },
];

export const ASSUMPTION_FIELDS: AssumptionField[] = ASSUMPTION_GROUPS.flatMap(g => g.fields);
export const NULLABLE_KEYS = new Set(ASSUMPTION_FIELDS.filter(f => f.nullable).map(f => f.key));

export type Assumptions = Record<string, number | null>;

/** valor de premissa → string p/ input controlado */
export const assumptionToStr = (v: any) => (v === null || v === undefined ? '' : String(v));

/** string do input → número (ou null p/ campos nullable vazios) */
export function parseAssumption(key: string, s: string): number | null {
  const t = String(s).trim().replace(',', '.');
  if (t === '') return NULLABLE_KEYS.has(key) ? null : 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : (NULLABLE_KEYS.has(key) ? null : 0);
}

/** objeto de premissas (do backend, já normalizado) → { key: string } p/ o form */
export function assumptionsToForm(a: Assumptions | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ASSUMPTION_FIELDS) out[f.key] = assumptionToStr(a?.[f.key]);
  return out;
}

/** { key: string } do form → objeto de premissas p/ enviar ao backend */
export function formToAssumptions(form: Record<string, string>): Assumptions {
  const out: Assumptions = {};
  for (const f of ASSUMPTION_FIELDS) out[f.key] = parseAssumption(f.key, form[f.key] ?? '');
  return out;
}

/** true se todas as premissas estão em zero / vazias (= cenário "base") */
export function isEmptyAssumptions(a: Assumptions): boolean {
  return ASSUMPTION_FIELDS.every(f => {
    const v = a[f.key];
    return v === null || v === undefined || v === 0;
  });
}
