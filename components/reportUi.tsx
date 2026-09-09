import React from 'react';

// Kit visual compartilhado entre Relatórios e Planejamento — mesmos tokens de
// tema (bg-surface/ink/muted/faint/line, ok/danger, brand) e mesmo estilo de
// gráfico (recharts lendo var(--color-*)).

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const brlShort = (v: number | null | undefined) => {
  const n = v ?? 0;
  const a = Math.abs(n);
  if (a >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
};

export const pctTxt = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? '—' : `${v.toFixed(1)}%`;

export const daysTxt = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? '—' : `${Math.round(v)} dias`;

// 'YYYY-MM' -> 'mmm/aa'
export const fmtMonthKey = (k: string) => {
  const [y, m] = String(k).split('-').map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]}/${String(y).slice(2)}`;
};

export const CHART_AXIS = { fill: 'var(--color-faint)', fontSize: 12 };
export const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-line)',
    borderRadius: '10px',
    color: 'var(--color-ink)',
    fontSize: '12px',
  },
  labelStyle: { color: 'var(--color-muted)' },
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-surface rounded-xl border border-line p-5 ${className}`}>{children}</div>
);

export const Stat: React.FC<{
  label: string; value: string; hint?: string;
  tone?: 'ok' | 'danger' | 'ink' | 'muted' | 'warn';
}> = ({ label, value, hint, tone = 'ink' }) => {
  const toneCls =
    tone === 'ok' ? 'text-ok' :
    tone === 'danger' ? 'text-danger' :
    tone === 'warn' ? 'text-warn' :
    tone === 'muted' ? 'text-muted' : 'text-ink';
  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <p className="text-muted text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${toneCls}`}>{value}</p>
      {hint && <p className="text-faint text-[11px] mt-0.5">{hint}</p>}
    </div>
  );
};

// Card de "em breve" para as sub-abas de Planejamento ainda não implementadas.
export const ComingSoon: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-surface rounded-xl border border-dashed border-line p-10 text-center max-w-2xl mx-auto">
    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 rounded-full px-3 py-1 mb-4">
      Em breve
    </div>
    <h3 className="text-ink font-bold text-lg mb-2">{title}</h3>
    <p className="text-muted text-sm leading-relaxed">{children}</p>
  </div>
);

// Bloco de metodologia recolhível (usado no Ciclo Financeiro).
export const MethodologyNote: React.FC<{ items: [string, string][] }> = ({ items }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="bg-sunken/60 rounded-xl border border-line">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-muted hover:text-ink"
      >
        <span>Metodologia e limitações dos dados</span>
        <span className="text-faint">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <dl className="px-4 pb-4 space-y-2 text-xs leading-relaxed">
          {items.map(([term, desc]) => (
            <div key={term}>
              <dt className="font-semibold text-ink">{term}</dt>
              <dd className="text-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};
