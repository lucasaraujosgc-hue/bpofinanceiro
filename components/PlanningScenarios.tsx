import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  Sparkles, Save, Trash2, Plus, GitCompare, AlertTriangle, RotateCcw,
} from 'lucide-react';
import {
  brl, brlShort, pctTxt, fmtMonthKey, CHART_AXIS, CHART_TOOLTIP,
  Card, Stat, MethodologyNote,
} from './reportUi';
import {
  ASSUMPTION_GROUPS, NULLABLE_KEYS, assumptionsToForm, formToAssumptions,
} from './assumptions';

interface Props { token: string; }

const HORIZONS = [3, 6, 12, 18, 24, 36];

const KIND_BADGE: Record<string, string> = {
  base: 'bg-info/15 text-info',
  otimista: 'bg-ok/15 text-ok',
  pessimista: 'bg-danger/15 text-danger',
  custom: 'bg-sunken text-muted',
};
const KIND_LABEL: Record<string, string> = {
  base: 'Base', otimista: 'Otimista', pessimista: 'Pessimista', custom: 'Personalizado',
};

const PlanningScenarios: React.FC<Props> = ({ token }) => {
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [horizon, setHorizon] = useState(12);
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [loading, setLoading] = useState(true);
  const [proj, setProj] = useState<any>(null);
  const [projLoading, setProjLoading] = useState(false);
  const [cmp, setCmp] = useState<any[] | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sel = useMemo(() => scenarios.find(s => s.id === selId) || null, [scenarios, selId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/planning/scenarios', { headers });
      const j = r.ok ? await r.json() : { scenarios: [] };
      setScenarios(j.scenarios);
      setSelId(prev => (prev && j.scenarios.some((s: any) => s.id === prev)) ? prev : (j.scenarios[0]?.id ?? null));
    } finally { setLoading(false); }
  }, [headers]);

  useEffect(() => { loadList(); }, [loadList]);

  // sincroniza o formulário com o cenário selecionado
  useEffect(() => {
    if (!sel) { setForm({}); return; }
    setForm(assumptionsToForm(sel.assumptions));
    setDirty(false);
  }, [sel]);

  // projeção do cenário selecionado
  useEffect(() => {
    if (mode !== 'single' || !selId) { setProj(null); return; }
    let cancelled = false;
    setProjLoading(true);
    fetch(`/api/planning/scenarios/${selId}/projection?horizon=${horizon}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setProj(j); setProjLoading(false); } })
      .catch(() => { if (!cancelled) setProjLoading(false); });
    return () => { cancelled = true; };
  }, [mode, selId, horizon, headers, scenarios]);

  // comparação
  useEffect(() => {
    if (mode !== 'compare') { setCmp(null); return; }
    let cancelled = false;
    fetch(`/api/planning/scenarios/compare?horizon=${horizon}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setCmp(j?.scenarios || []); })
      .catch(() => { if (!cancelled) setCmp([]); });
    return () => { cancelled = true; };
  }, [mode, horizon, headers, scenarios]);

  const setField = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const createDefaults = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/planning/scenarios/defaults?year=${new Date().getFullYear()}`, { method: 'POST', headers });
      if (r.ok) { await loadList(); setMsg('Cenários Base, Otimista e Pessimista criados.'); }
      else { const e = await r.json().catch(() => ({})); setMsg(e.error || 'Erro ao criar.'); }
    } finally { setBusy(false); }
  };

  const addScenario = async () => {
    const name = window.prompt('Nome do novo cenário:');
    if (!name) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/planning/scenarios', {
        method: 'POST', headers,
        body: JSON.stringify({ name, kind: 'custom', baseYear: new Date().getFullYear(), horizonMonths: horizon }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { await loadList(); setSelId(j.scenario?.id ?? null); setMode('single'); }
      else setMsg(j.error || 'Erro ao criar cenário.');
    } finally { setBusy(false); }
  };

  const removeScenario = async (id: number) => {
    if (!window.confirm('Excluir este cenário?')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/planning/scenarios/${id}`, { method: 'DELETE', headers });
      if (r.ok) await loadList();
    } finally { setBusy(false); }
  };

  const saveAssumptions = async () => {
    if (!sel) return;
    setSaving(true); setMsg(null);
    const assumptions = formToAssumptions(form);
    try {
      const r = await fetch(`/api/planning/scenarios/${sel.id}`, { method: 'PUT', headers, body: JSON.stringify({ assumptions }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Erro ao salvar.'); return; }
      setScenarios(list => list.map(s => (s.id === sel.id ? j.scenario : s)));
      setDirty(false);
      setMsg('Premissas salvas.');
      setTimeout(() => setMsg(null), 2500);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;

  if (scenarios.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-dashed border-line p-10 text-center max-w-xl mx-auto">
        <Sparkles size={28} className="mx-auto text-brand mb-3" />
        <h3 className="text-ink font-bold text-lg mb-2">Nenhum cenário ainda</h3>
        <p className="text-muted text-sm mb-5">
          Um cenário aplica premissas (crescimento de receita, variação de custos, prazos, inadimplência,
          investimentos, empréstimos, distribuição) sobre a média histórica e projeta a DRE gerencial, o
          fluxo de caixa e os indicadores. Comece pelos três cenários padrão e ajuste as premissas.
        </p>
        <button onClick={createDefaults} disabled={busy}
          className="inline-flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-lg font-medium hover:bg-brand-strong disabled:opacity-60">
          <Plus size={16} /> Criar cenários Base / Otimista / Pessimista
        </button>
        {msg && <p className="text-xs text-muted mt-3">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* barra de cenários */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-surface p-1 rounded-lg border border-line overflow-x-auto custom-scroll">
          {scenarios.map(s => (
            <button key={s.id} onClick={() => { setSelId(s.id); setMode('single'); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-1.5 ${
                mode === 'single' && selId === s.id ? 'bg-brand text-white' : 'text-muted hover:text-ink hover:bg-sunken'}`}>
              {s.name}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${mode === 'single' && selId === s.id ? 'bg-white/20 text-white' : KIND_BADGE[s.kind] || KIND_BADGE.custom}`}>
                {KIND_LABEL[s.kind] || 'Personalizado'}
              </span>
            </button>
          ))}
        </div>
        <button onClick={addScenario} disabled={busy} title="Novo cenário"
          className="p-2 rounded-lg border border-line text-muted hover:text-ink hover:bg-sunken"><Plus size={15} /></button>
        <button onClick={() => setMode(m => (m === 'compare' ? 'single' : 'compare'))}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium ${
            mode === 'compare' ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'}`}>
          <GitCompare size={14} /> Comparar
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted">Horizonte</span>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className={`px-2 py-1 rounded-md text-xs font-medium ${horizon === h ? 'bg-brand text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}>{h}m</button>
          ))}
        </div>
      </div>

      {msg && <p className="text-xs text-muted">{msg}</p>}

      {mode === 'compare' ? (
        <CompareView cmp={cmp} horizon={horizon} />
      ) : (
        <>
          {/* premissas */}
          {sel && (
            <Card className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-ink font-bold text-sm flex items-center gap-2">
                  <Sparkles size={15} className="text-brand" /> Premissas — {sel.name}
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setForm(assumptionsToForm(sel.assumptions)); setDirty(false); }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-line text-muted hover:text-ink"><RotateCcw size={12} /> Desfazer</button>
                  <button onClick={saveAssumptions} disabled={saving || !dirty}
                    className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-medium ${dirty ? 'bg-brand text-white hover:bg-brand-strong' : 'bg-sunken text-faint'}`}>
                    <Save size={14} /> {saving ? 'Salvando…' : 'Salvar premissas'}
                  </button>
                  {scenarios.length > 1 && (
                    <button onClick={() => removeScenario(sel.id)} title="Excluir cenário" className="p-1.5 text-faint hover:text-danger"><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
                {ASSUMPTION_GROUPS.map(group => (
                  <div key={group.title} className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-faint">{group.title}</p>
                    {group.fields.map(f => (
                      <label key={f.key} className="block">
                        <span className="text-xs text-muted flex items-center gap-1" title={f.hint}>{f.label} <span className="text-faint">({f.suffix})</span></span>
                        <input
                          inputMode="decimal"
                          value={form[f.key] ?? ''}
                          onChange={e => setField(f.key, e.target.value)}
                          placeholder={NULLABLE_KEYS.has(f.key) ? '—' : '0'}
                          className="mt-0.5 w-full bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm focus:border-brand outline-none tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              {dirty && <p className="text-[11px] text-warn mt-3 flex items-center gap-1"><AlertTriangle size={12} /> Salve as premissas para atualizar a projeção.</p>}
            </Card>
          )}

          {projLoading && !proj ? (
            <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand" /></div>
          ) : proj ? (
            <ProjectionView proj={proj} />
          ) : (
            <p className="text-faint text-sm text-center py-12">Sem dados para projetar.</p>
          )}
        </>
      )}
    </div>
  );
};

// ---- projeção de um cenário ----
const ProjectionView: React.FC<{ proj: any }> = ({ proj }) => {
  const { resumo: r, indicadores: ind, dre, dreGrupos, serieMensal, fluxoCaixa, meta, aviso } = proj;
  const [tab, setTab] = useState<'dre' | 'caixa'>('dre');

  const resultChart = serieMensal.map((s: any) => ({
    mes: fmtMonthKey(s.mes), Receita: s.receita, Despesa: s.despesa, Resultado: s.resultado,
  }));
  const caixaChart = fluxoCaixa.serie.map((s: any) => ({ mes: fmtMonthKey(s.mes), Caixa: s.caixaFim }));

  return (
    <div className="space-y-5">
      {aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 text-warn px-3 py-2 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{aviso}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Receita projetada (${r.horizonteMeses}m)`} value={brl(r.receita)} tone="ok" hint={`média ${brlShort(r.mediaMensalReceita)}/mês`} />
        <Stat label="Despesa projetada" value={brl(r.despesa)} tone="danger" />
        <Stat label="Lucro líquido projetado" value={brl(r.lucroLiquido)} tone={r.lucroLiquido >= 0 ? 'ok' : 'danger'} hint={`margem ${pctTxt(r.margemLiquidaPct)}`} />
        <Stat label="Caixa final projetado" value={brl(ind.caixaFinal)} tone={ind.caixaFinal >= 0 ? 'ink' : 'danger'} hint={`inicial ${brlShort(ind.caixaInicial)}`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Ponto de equilíbrio" value={ind.pontoEquilibrio ? brl(ind.pontoEquilibrio) : '—'} tone="muted" hint={ind.pontoEquilibrioMensal ? `${brlShort(ind.pontoEquilibrioMensal)}/mês` : 'sem margem de contribuição'} />
        <Stat label="Margem de segurança" value={pctTxt(ind.margemSegurancaPct)} tone={((ind.margemSegurancaPct ?? -1) >= 0) ? 'ok' : 'danger'} />
        <Stat label="Menor caixa no período" value={brl(ind.menorCaixaProjetado)} tone={ind.menorCaixaProjetado >= 0 ? 'ink' : 'danger'} />
        <Stat label="NCG projetada" value={ind.ncgFinal === null ? '—' : brl(ind.ncgFinal)} tone="muted"
          hint={ind.ncgMetodo === 'premissas' ? 'PMR × receita/dia − PMP × despesa/dia' : 'informe PMR e PMP nas premissas'} />
      </div>

      <Card>
        <h3 className="text-ink font-bold mb-1">Receita × Despesa × Resultado</h3>
        <p className="text-muted text-xs mb-4">Projeção mês a mês do cenário.</p>
        <div className="h-64 w-full overflow-x-auto">
          <div className="min-w-[560px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={resultChart} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receita" fill="var(--color-ok)" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="Despesa" fill="var(--color-danger)" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Line type="monotone" dataKey="Resultado" stroke="var(--color-brand)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-ink font-bold mb-1">Evolução do caixa projetado</h3>
        <p className="text-muted text-xs mb-4">Caixa inicial + resultado + itens patrimoniais − variação da NCG.</p>
        <div className="h-56 w-full overflow-x-auto">
          <div className="min-w-[560px] h-full">
            <ResponsiveContainer>
              <AreaChart data={caixaChart} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="sc-caixa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                <Area type="monotone" dataKey="Caixa" stroke="var(--color-brand)" fill="url(#sc-caixa)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* DRE projetada / Fluxo de caixa */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center gap-1 bg-sunken/40">
          <button onClick={() => setTab('dre')} className={`text-sm font-bold px-3 py-1 rounded-md ${tab === 'dre' ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>DRE projetada</button>
          <button onClick={() => setTab('caixa')} className={`text-sm font-bold px-3 py-1 rounded-md ${tab === 'caixa' ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>Fluxo de caixa</button>
        </div>
        {tab === 'dre' ? (
          <table className="w-full text-sm">
            <tbody>
              <DreRow label="Receita bruta" value={dre.receitaBruta} strong />
              <DreRow label="(−) Impostos sobre vendas" value={-dre.deducoes} />
              <DreRow label="(=) Receita líquida" value={dre.receitaLiquida} strong />
              <DreRow label="(−) Custo (CMV/CSP)" value={-dre.cmv} />
              <DreRow label="(=) Lucro bruto" value={dre.lucroBruto} strong hint={pctTxt(dre.margemBrutaPct)} />
              <DreRow label="(−) Despesas operacionais" value={-dre.despesasOperacionais} />
              {dre.outrasRecOp > 0 && <DreRow label="(+) Outras receitas operacionais" value={dre.outrasRecOp} />}
              <DreRow label="(=) Resultado operacional" value={dre.resultadoOperacional} strong hint={pctTxt(dre.margemOperacionalPct)} />
              <DreRow label="(+/−) Resultado financeiro" value={dre.resultadoFinanceiro} />
              {dre.resultadoNaoOperacional !== 0 && <DreRow label="(+/−) Resultado não operacional" value={dre.resultadoNaoOperacional} />}
              {dre.irpjCsll > 0 && <DreRow label="(−) IRPJ / CSLL" value={-dre.irpjCsll} />}
              <DreRow label="(=) Lucro líquido" value={dre.lucroLiquido} strong hint={pctTxt(dre.margemLiquidaPct)} accent />
            </tbody>
          </table>
        ) : (
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                  <th className="text-left font-semibold px-3 py-2">Mês</th>
                  <th className="text-right font-semibold px-2 py-2">Resultado</th>
                  <th className="text-right font-semibold px-2 py-2">Aportes</th>
                  <th className="text-right font-semibold px-2 py-2">Empréstimo</th>
                  <th className="text-right font-semibold px-2 py-2">Investim.</th>
                  <th className="text-right font-semibold px-2 py-2">Amortiz.</th>
                  <th className="text-right font-semibold px-2 py-2">Distrib.</th>
                  <th className="text-right font-semibold px-2 py-2">Δ NCG</th>
                  <th className="text-right font-semibold px-3 py-2">Caixa fim</th>
                </tr>
              </thead>
              <tbody>
                {fluxoCaixa.serie.map((s: any) => (
                  <tr key={s.mes} className="border-t border-line hover:bg-sunken/30">
                    <td className="px-3 py-1.5 text-ink">{fmtMonthKey(s.mes)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${s.geracaoOperacional >= 0 ? 'text-ink' : 'text-danger'}`}>{brlShort(s.geracaoOperacional)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-faint">{s.aportes ? brlShort(s.aportes) : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-faint">{s.captacaoEmprestimo ? brlShort(s.captacaoEmprestimo) : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-faint">{s.investimentos ? `-${brlShort(s.investimentos)}` : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-faint">{s.amortizacao ? `-${brlShort(s.amortizacao)}` : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-faint">{s.distribuicaoLucros ? `-${brlShort(s.distribuicaoLucros)}` : '—'}</td>
                    <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${s.variacaoNcg > 0 ? 'text-danger' : 'text-faint'}`}>{s.variacaoNcg ? brlShort(-s.variacaoNcg) : '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-semibold tabular-nums ${s.caixaFim >= 0 ? 'text-ink' : 'text-danger'}`}>{brlShort(s.caixaFim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* grupos do DRE */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line"><h3 className="text-ink font-bold text-sm">Projeção por grupo do plano de contas</h3></div>
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-sunken z-10">Grupo</th>
                {(dreGrupos[0]?.meses || []).map((mm: any) => <th key={mm.mes} className="text-right font-semibold px-2 py-2">{fmtMonthKey(mm.mes)}</th>)}
                <th className="text-right font-semibold px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {dreGrupos.map((g: any) => (
                <tr key={g.groupType + g.kind} className="border-t border-line hover:bg-sunken/30">
                  <td className={`px-3 py-1.5 sticky left-0 bg-surface z-10 text-[11px] font-semibold uppercase tracking-wide ${g.kind === 'receita' ? 'text-ok' : 'text-danger'}`}>{g.label}</td>
                  {g.meses.map((mm: any) => <td key={mm.mes} className="px-2 py-1.5 text-right font-mono text-ink tabular-nums">{brlShort(mm.valor)}</td>)}
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-ink">{brlShort(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MethodologyNote items={[
        ['Base do cenário', meta.baseMetodo + '. As premissas ajustam a partir daí.'],
        ['Regime', 'Caixa. A DRE projetada já é de caixa; o fluxo de caixa projetado soma os itens patrimoniais e desconta a variação da necessidade de capital de giro.'],
        ...(meta.notas || []).map((n: string, i: number): [string, string] => [`Nota ${i + 1}`, n]),
      ]} />
    </div>
  );
};

const DreRow: React.FC<{ label: string; value: number; strong?: boolean; accent?: boolean; hint?: string }> = ({ label, value, strong, accent, hint }) => (
  <tr className={`border-t border-line ${accent ? 'bg-sunken' : ''}`}>
    <td className={`px-4 py-2 ${strong ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</td>
    {hint && <td className="px-2 py-2 text-right text-[11px] text-faint tabular-nums">{hint}</td>}
    {!hint && <td />}
    <td className={`px-4 py-2 text-right font-mono tabular-nums ${strong ? 'font-semibold' : ''} ${value < 0 ? 'text-danger' : 'text-ink'}`}>{brl(value)}</td>
  </tr>
);

// ---- comparação lado a lado ----
const CompareView: React.FC<{ cmp: any[] | null; horizon: number }> = ({ cmp, horizon }) => {
  if (!cmp) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand" /></div>;
  if (cmp.length === 0) return <p className="text-faint text-sm text-center py-12">Nenhum cenário para comparar.</p>;

  const rows: [string, (s: any) => string, (s: any) => boolean][] = [
    ['Receita', s => brl(s.receita), () => true],
    ['Despesa total', s => brl(s.despesa), () => true],
    ['Resultado operacional', s => brl(s.resultadoOperacional), s => s.resultadoOperacional >= 0],
    ['Lucro líquido', s => brl(s.lucroLiquido), s => s.lucroLiquido >= 0],
    ['Margem líquida', s => pctTxt(s.margemLiquidaPct), s => s.margemLiquidaPct >= 0],
    ['Ponto de equilíbrio', s => (s.pontoEquilibrio ? brl(s.pontoEquilibrio) : '—'), () => true],
    ['Margem de segurança', s => pctTxt(s.margemSegurancaPct), s => (s.margemSegurancaPct ?? -1) >= 0],
    ['Caixa final', s => brl(s.caixaFinal), s => s.caixaFinal >= 0],
    ['Menor caixa no período', s => brl(s.menorCaixaProjetado), s => s.menorCaixaProjetado >= 0],
    ['NCG projetada', s => (s.ncgFinal === null ? '—' : brl(s.ncgFinal)), () => true],
  ];

  const chartData = (cmp[0]?.serieCaixa || []).map((_: any, i: number) => {
    const row: any = { mes: fmtMonthKey(cmp[0].serieCaixa[i].mes) };
    for (const s of cmp) row[s.name] = s.serieCaixa[i]?.caixaFim ?? null;
    return row;
  });
  const colors = ['var(--color-info)', 'var(--color-ok)', 'var(--color-danger)', 'var(--color-brand)', 'var(--color-warn)'];

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-xl border border-line overflow-x-auto custom-scroll">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
              <th className="text-left font-semibold px-4 py-2.5">Indicador ({horizon}m)</th>
              {cmp.map(s => (
                <th key={s.id} className="text-right font-semibold px-4 py-2.5">
                  {s.name}
                  <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${KIND_BADGE[s.kind] || KIND_BADGE.custom}`}>{KIND_LABEL[s.kind] || 'Pers.'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, fmt, good]) => (
              <tr key={label} className="border-t border-line">
                <td className="px-4 py-2 text-muted">{label}</td>
                {cmp.map(s => (
                  <td key={s.id} className={`px-4 py-2 text-right font-mono tabular-nums ${good(s) ? 'text-ink' : 'text-danger'}`}>{fmt(s)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card>
        <h3 className="text-ink font-bold mb-3">Caixa projetado por cenário</h3>
        <div className="h-64 w-full overflow-x-auto">
          <div className="min-w-[560px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => (v == null ? '—' : brl(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cmp.map((s, i) => (
                  <Line key={s.id} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PlanningScenarios;
