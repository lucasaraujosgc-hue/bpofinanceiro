/* Datas de lançamento/previsão são strings 'YYYY-MM-DD' (data de caixa, sem
 * hora). `new Date('YYYY-MM-DD')` parseia em UTC — em fuso negativo (Brasil,
 * UTC-3) o `.toLocaleDateString()` mostra o dia anterior. Formate a partir da
 * string, nunca via Date. */

export const fmtDateBR = (iso?: string | null): string => {
  const s = String(iso ?? '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : s;
};

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export const ymKey = (iso?: string | null): string => String(iso ?? '').slice(0, 7);

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** data de hoje em 'YYYY-MM-DD' no fuso local (sem UTC drift) */
export const todayISO = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
};

/** 'YYYY-MM' de um ano/mês (mês 0-11) — para comparar com ymKey() */
export const ymOf = (year: number, month0: number): string => `${year}-${pad2(month0 + 1)}`;
