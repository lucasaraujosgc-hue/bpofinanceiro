import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { FlaskConical, RotateCcw, Save, ArrowRight, ShieldCheck, Info } from 'lucide-react';
import { brl, brlShort, pctTxt, fmtMonthKey, CHART_AXIS, CHART_TOOLTIP, Card } from './reportUi';
import {
  ASSUMPTION_GROUPS, NULLABLE_KEYS, assumptionsToForm, formToAssumptions,
} from './assumptions';

interface Props { token: string; }

const HORIZONS = [3, 6, 12, 18, 24, 36];
const EMPTY_FORM = assumptionsToForm(null);

// Indicadores comparados. dir = +1 quando "maior é melhor", -1 quando "menor é melhor", 0 neutro.
const ROWS: { label: string; pick: (d: any) => number | null; dir: number; money?: boolean; pct?: boolean }[] = [
  { label: 'Receita', pick: d => d.resumo.receita, dir: 1, money: true },
  { label: 'Custos + despesas', pick: d => d.resumo.despesa, dir: -1, money: true },
  { label: 'Resultado operacional (EBITDA)', pick: d => d.resumo.resultadoOperacional, dir: 1, money: true },
  { label: 'Lucro líquido', pick: d => d.resumo.lucroLiquido, dir: 1, money: true },
  { label: 'Margem líquida', pick: d => d.resumo.margemLiquidaPct, dir: 1, pct: true },
  { label: 'Ponto de equilíbrio', pick: d => d.indicadores.pontoEquilibrio, dir: -1, money: true },
  { label: 'Caixa final projetado', pick: d => d.indicadores.caixaFinal, dir: 1, money: true },
  { label: 'Menor caixa no período', pick: d => d.indicadores.menorCaixaProjetado, dir: 1, money: true },
  { label: 'Capital de giro (Caixa + NCG)', pick: d => d.indicadores.caixaFinal + (d.indicadores.ncgFinal || 0), dir: 1, money: true },
  { label: 'Necessidade de capital de giro', pick: d => d.indicadores.ncgFinal, dir: -1, money: true },
];

const QUICK: { label: string; patch: Record<string, string> }[] = [
  { label: 'Receita +20%', patch: { receita_crescimento_pct: '20' } },
  { label: 'Receita −15%', patch: { receita_crescimento_pct: '-15' } },
  { label: 'Custos −10%', patch: { custos_variaveis_delta_pct: '-10', custos_fixos_delta_pct: '-10' } },
  { label: 'Inadimplência 8%', patch: { inadimplencia_pct: '8' } },
];

const PlanningSimulator: React.FC<Props> = ({ token }) => {
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  const [scenarios, setScenarios] = useState<any[]>([]);
  const [startFrom, setStartFrom] = useState<'base' | number>('base');
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [horizon, setHorizon] = useState(12);
  const [metric, setMetric] = useState<'resultado' | 'receita' | 'caixa'>('resultado');
  const [data, setData] = useState<{ base: any; simulado: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // premissas da base (cenário de partida) — '' quando parte do zero
  const baseForm = useMemo(() => {
    if (startFrom === 'base') return EMPTY_FORM;
    const sc = scenarios.find(s => s.id === startFrom);
    return sc ? assumptionsToForm(sc.assumptions) : EMPTY_FORM;
  }, [startFrom, scenarios]);

  const dirty = useMemo(
    () => Object.keys(EMPTY_FORM).some(k => (form[k] ?? '') !== (baseForm[k] ?? '')),
    [form, baseForm],
  );

  useEffect(() => {
    fetch('/api/planning/scenarios', { headers })
      .then(r => (r.ok ? r.json() : { scenarios: [] }))
      .then(j => setScenarios(j.scenarios || []))
      .catch(() => setScenarios([]));
  }, [headers]);

  // ao trocar a base, o form volta a espelhá-la
  useEffect(() => { setForm(baseForm); }, [baseForm]);

  // recomputa (debounced) sempre que premissas / base / horizonte mudam
  const timer = useRef<any>(null);
  const run = useCallback(() => {
    const body = JSON.stringify({
      baseAssumptions: formToAssumptions(baseForm),
      assumptions: formToAssumptions(form),
      horizonMonths: horizon,
    });
    fetch('/api/planning/scenarios/simulate', { method: 'POST', headers, body })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j) { setData(j); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [headers, baseForm, form, horizon]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, 280);
    return () => clearTimeout(timer.current);
  }, [run]);

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const applyQuick = (patch: Record<string, string>) => setForm(f => ({ ...f, ...patch }));
  const reset = () => setForm(baseForm);

  const saveAsScenario = async () => {
    const name = window.prompt('Salvar esta simulação como cenário. Nome:');
    if (!name) return;
    setBusy(true); setSaveMsg(null);
    try {
      const r = await fetch('/api/planning/scenarios', {
        method: 'POST', headers,
        body: JSON.stringify({
          name, kind: 'custom', baseYear: new Date().getFullYear(),
          horizonMonths: horizon, assumptions: formToAssumptions(form),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const list = await (await fetch('/api/planning/scenarios', { headers })).json();
        setScenarios(list.scenarios || []);
        setSaveMsg(`Cenário "${name}" criado — veja na aba Cenários.`);
        setTimeout(() => setSaveMsg(null), 4000);
      } else setSaveMsg(j.error || 'Erro ao salvar.');
    } finally { setBusy(false); }
  };

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  if (!data) return <p className="text-faint text-sm text-center py-16">Sem histórico suficiente para simular.</p>;

  const chartRows = data.base.serieMensal.map((s: any, i: number) => ({
    mes: fmtMonthKey(s.mes),
    Base: metric === 'caixa' ? (data.base.fluxoCaixa.serie[i]?.caixaFim ?? null) : s[metric],
    Simulado: metric === 'caixa' ? (data.simulado.fluxoCaixa.serie[i]?.caixaFim ?? null) : data.simulado.serieMensal[i]?.[metric],
  }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-2.5 text-xs text-muted flex items-start gap-2">
        <ShieldCheck size={14} className="text-ok shrink-0 mt-0.5" />
        <span>O simulador trabalha sobre uma <strong>cópia temporária</strong> das premissas. Nada aqui altera seus lançamentos, previsões ou cenários salvos. Use <em>Salvar como cenário</em> se quiser guardar o resultado.</span>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted flex items-center gap-1.5">
          Partir de:
          <select value={String(startFrom)} onChange={e => setStartFrom(e.target.value === 'base' ? 'base' : Number(e.target.value))}
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm outline-none focus:border-brand">
            <option value="base">Situação atual (média histórica)</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>Cenário: {s.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">Horizonte</span>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className={`px-2 py-1 rounded-md text-xs font-medium ${horizon === h ? 'bg-brand text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}>{h}m</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={reset} disabled={!dirty}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border ${dirty ? 'border-line text-muted hover:text-ink' : 'border-line/50 text-faint'}`}>
            <RotateCcw size={12} /> Redefinir
          </button>
          <button onClick={saveAsScenario} disabled={busy || !dirty}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium ${dirty ? 'bg-brand text-white hover:bg-brand-strong' : 'bg-sunken text-faint'}`}>
            <Save size={14} /> Salvar como cenário
          </button>
        </div>
      </div>
      {saveMsg && <p className="text-xs text-ok">{saveMsg}</p>}

      <div className="grid lg:grid-cols-[340px_1fr] gap-5 min-w-0">
        {/* controles */}
        <Card className="!p-4 self-start min-w-0">
          <h3 className="text-ink font-bold text-sm flex items-center gap-2 mb-1">
            <FlaskConical size={15} className="text-brand" /> Premissas
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {QUICK.map(q => (
              <button key={q.label} onClick={() => applyQuick(q.patch)}
                className="text-[11px] px-2 py-1 rounded-full border border-brand/30 bg-brand/10 text-brand hover:bg-brand/20">
                {q.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {ASSUMPTION_GROUPS.map(group => (
              <div key={group.title} className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-faint">{group.title}</p>
                {group.fields.map(f => {
                  const raw = form[f.key] ?? '';
                  const nv = Number(String(raw).replace(',', '.'));
                  const changed = (baseForm[f.key] ?? '') !== raw;
                  return (
                    <div key={f.key}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted flex items-center gap-1" title={f.hint}>
                          {f.label}
                          {changed && <span className="w-1.5 h-1.5 rounded-full bg-brand" title="alterado" />}
                        </span>
                        <span className="text-faint">{f.suffix}</span>
                      </div>
                      {f.slider ? (
                        <div className="flex items-center gap-2 mt-1 min-w-0">
                          <input
                            type="range" min={f.slider.min} max={f.slider.max} step={f.slider.step}
                            value={Number.isFinite(nv) ? nv : 0}
                            onChange={e => setField(f.key, e.target.value)}
                            className="flex-1 min-w-0 accent-brand"
                          />
                          <input
                            inputMode="decimal" value={raw}
                            onChange={e => setField(f.key, e.target.value)}
                            className="w-16 bg-surface border border-line rounded px-1.5 py-1 text-ink text-xs text-right tabular-nums outline-none focus:border-brand"
                          />
                        </div>
                      ) : (
                        <input
                          inputMode="decimal" value={raw}
                          onChange={e => setField(f.key, e.target.value)}
                          placeholder={NULLABLE_KEYS.has(f.key) ? '—' : '0'}
                          className="mt-1 w-full bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm outline-none focus:border-brand tabular-nums"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        {/* impacto */}
        <div className="space-y-5 min-w-0">
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <h3 className="text-ink font-bold text-sm">Impacto no horizonte de {horizon} meses</h3>
              {data.simulado.aviso && <span className="text-[11px] text-warn">{data.simulado.aviso}</span>}
            </div>
            <div className="overflow-x-auto custom-scroll">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                    <th className="text-left font-semibold px-4 py-2">Indicador</th>
                    <th className="text-right font-semibold px-3 py-2">Base</th>
                    <th className="text-right font-semibold px-3 py-2">Simulado</th>
                    <th className="text-right font-semibold px-4 py-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(row => {
                    const b = row.pick(data.base);
                    const s = row.pick(data.simulado);
                    const fmt = (v: number | null) => v == null ? '—' : row.pct ? pctTxt(v) : brl(v);
                    const delta = (b == null || s == null) ? null : s - b;
                    const good = delta == null || row.dir === 0 ? null : (delta * row.dir >= 0);
                    return (
                      <tr key={row.label} className="border-t border-line">
                        <td className="px-4 py-2 text-muted">{row.label}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-faint">{fmt(b)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-ink font-semibold">{fmt(s)}</td>
                        <td className={`px-4 py-2 text-right font-mono tabular-nums ${good == null ? 'text-faint' : good ? 'text-ok' : 'text-danger'}`}>
                          {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${row.pct ? `${delta.toFixed(1)} p.p.` : brlShort(delta)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-ink font-bold text-sm flex items-center gap-2"><ArrowRight size={14} className="text-brand" /> Base × Simulado mês a mês</h3>
              <div className="flex gap-1 bg-sunken p-1 rounded-lg text-xs">
                {(['resultado', 'receita', 'caixa'] as const).map(m => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={`px-3 py-1 rounded-md font-medium capitalize ${metric === m ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="h-64 w-full overflow-x-auto">
              <div className="min-w-[560px] h-full">
                <ResponsiveContainer>
                  <ComposedChart data={chartRows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                    <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => (v == null ? '—' : brl(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Base" stroke="var(--color-faint)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Simulado" stroke="var(--color-brand)" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <p className="text-faint text-[11px] flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            {data.simulado.meta?.baseMetodo
              ? `Base de cálculo: ${data.simulado.meta.baseMetodo}. Regime de caixa — a DRE projetada já é de caixa; o caixa final soma os itens patrimoniais e desconta a variação da NCG.`
              : 'Regime de caixa.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlanningSimulator;
