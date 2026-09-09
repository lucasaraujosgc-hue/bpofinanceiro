/* Recorrência de lançamentos e previsões.
 *
 * Gera as datas ('YYYY-MM-DD') de uma série recorrente com aritmética de
 * calendário pura — sem `new Date('YYYY-MM-DD')` (que é parseado como UTC e
 * derrapa de fuso) e sem `setMonth` (que transborda: 31/01 + 1 mês virava
 * 03/03, e uma recorrência "dia 1" chegava a aparecer 2x no mesmo mês).
 * Quando o dia-âncora não existe no mês de destino (ex.: 31 em fevereiro), a
 * data é fixada no último dia do mês. */

export type Frequency =
  | 'unica' | 'semanal' | 'quinzenal' | 'mensal'
  | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'fixo';

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'unica', label: 'Não repete' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'fixo', label: 'Fixo (mensal, contínuo)' },
];

const FIXO_MESES = 60;                 // "contínuo" = 5 anos de previsões
const MONTH_STEP: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, fixo: 1 };

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m1: number) => new Date(y, m1, 0).getDate(); // m1 = 1..12

/** Nº de ocorrências efetivo para uma frequência + contagem pedida. */
export function occurrencesFor(frequency: Frequency, count: number): number {
  if (frequency === 'unica') return 1;
  if (frequency === 'fixo') return FIXO_MESES;
  return Math.max(1, Math.min(600, Math.floor(Number(count) || 1)));
}

/** Datas 'YYYY-MM-DD' da recorrência a partir de `startISO`. */
export function recurrenceDates(startISO: string, frequency: Frequency, count: number): string[] {
  const [y0, m0, d0] = String(startISO).slice(0, 10).split('-').map(Number);
  if (!y0 || !m0 || !d0) return [String(startISO).slice(0, 10)];

  const n = occurrencesFor(frequency, count);
  const out: string[] = [];

  if (frequency === 'semanal' || frequency === 'quinzenal') {
    const step = frequency === 'semanal' ? 7 : 14;
    for (let i = 0; i < n; i++) {
      const dt = new Date(Date.UTC(y0, m0 - 1, d0) + i * step * 86400000);
      out.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    }
    return out;
  }

  const monthStep = MONTH_STEP[frequency];
  if (!monthStep) return [`${y0}-${pad(m0)}-${pad(d0)}`]; // 'unica'

  for (let i = 0; i < n; i++) {
    const total = (m0 - 1) + i * monthStep;
    const y = y0 + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const d = Math.min(d0, daysInMonth(y, m));  // 31 em fev -> 28/29; nunca transborda
    out.push(`${y}-${pad(m)}-${pad(d)}`);
  }
  return out;
}

/** `installmentTotal` a gravar: 0 = "fixo" (badge ∞), N = "i/N", null = sem recorrência. */
export function installmentTotalFor(frequency: Frequency, occurrences: number): number | null {
  if (frequency === 'fixo') return 0;
  if (frequency === 'unica' || occurrences <= 1) return null;
  return occurrences;
}
