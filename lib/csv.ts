/* Geração de CSV para exportação (abre no Excel / Google Sheets).
 * Separador ';' e decimal ',' — padrão pt-BR. BOM UTF-8 no download. */

export const csvNum = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? '' : v.toFixed(2).replace('.', ',');

export function toCSV(rows: (string | number | null | undefined)[][], sep = ';'): string {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return (s.includes(sep) || /["\n\r]/.test(s)) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(sep)).join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
