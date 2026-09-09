import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';
import { brl, brlShort, pctTxt, fmtMonthKey, CHART_AXIS, CHART_TOOLTIP, Card, Stat } from './reportUi';

interface Props { token: string; }

const HORIZONS = [3, 6, 12, 24, 36];
const HISTORY = [3, 6, 12, 24];
const METHODS = [
  { id: 'media_historica', label: 'Média histórica' },
  { id: 'media_movel', label: 'Média móvel (3 meses)' },
  { id: 'crescimento_historico', label: 'Crescimento histórico' },
  { id: 'orcamento', label: 'Orçamento do ano' },
  { id: 'sazonalidade', label: 'Sazonalidade' },
];

const PlanningForecast: React.FC<Props> = ({ token }) => {
  const [method, setMethod] = useState('media_historica');
  const [horizon, setHorizon] = useState(12);
  const [historyMonths, setHistoryMonths] = useState(12);
  const [growth, setGrowth] = useState('0');
  const [metric, setMetric] = useState<'receita' | 'despesa' | 'resultado'>('receita');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const usesHistory = method === 'media_historica' || method === 'sazonalidade';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `method=${method}&horizon=${horizon}&historyMonths=${historyMonths}&growthPct=${Number(growth) || 0}`;
    fetch(`/api/planning/forecast?${qs}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [method, horizon, historyMonths, growth, headers]);

  const chart = useMemo(() => {
    if (!data?.series) return { rows: [], anchor: '' };
    const anchor = data.series.find((s: any) => s.tipo === 'parcial')?.mes || '';
    const rows = data.series.map((s: any) => ({
      mes: fmtMonthKey(s.mes),
      Realizado: s.tipo === 'projetado' ? null : s[metric],
      Projetado: s.tipo === 'realizado' ? null : s[metric],
      _tipo: s.tipo,
    }));
    return { rows, anchor: anchor ? fmtMonthKey(anchor) : '' };
  }, [data, metric]);

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  if (!data) return <p className="text-faint text-sm text-center py-16">Erro ao carregar.</p>;

  const r = data.resumo || {};

  return (
    <div className="space-y-5">
      {/* Config */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">
            Método
            <select value={method} onChange={e => setMethod(e.target.value)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink">
              {METHODS.map(m => (
                <option key={m.id} value={m.id} disabled={m.id === 'sazonalidade' && !data.sazonalidadeDisponivel}>
                  {m.label}{m.id === 'sazonalidade' && !data.sazonalidadeDisponivel ? ' (precisa 24m)' : ''}
                </option>
              ))}
            </select>
          </label>
          {usesHistory && (
            <label className="text-xs text-muted flex flex-col gap-1">
              Base (meses)
              <select value={historyMonths} onChange={e => setHistoryMonths(Number(e.target.value))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink">
                {HISTORY.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-muted flex flex-col gap-1">
            Crescimento % ao ano
            <input value={growth} onChange={e => setGrowth(e.target.value)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink w-24" placeholder="ex: 5 ou -3" />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Horizonte</span>
            <div className="flex gap-1">
              {HORIZONS.map(h => (
                <button key={h} onClick={() => setHorizon(h)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${horizon === h ? 'bg-brand text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}>{h}m</button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-2 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0 text-brand" /> {data.descricao}</p>
      </Card>

      {data.aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 text-warn px-3 py-2 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{data.aviso}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Receita projetada (${data.params.horizon}m)`} value={brl(r.receita)} tone="ok"
          hint={`média ${brlShort(r.mediaMensalReceita)}/mês`} />
        <Stat label="Despesa projetada" value={brl(r.despesa)} tone="danger" />
        <Stat label="Resultado projetado" value={brl(r.resultado)} tone={r.resultado >= 0 ? 'ok' : 'danger'}
          hint={`média ${brlShort(r.mediaMensalResultado)}/mês`} />
        {r.vsAnoAnterior
          ? <Stat label="Crescimento vs. ano anterior" value={pctTxt(r.vsAnoAnterior.crescimentoReceitaPct)}
              tone={(r.vsAnoAnterior.crescimentoReceitaPct ?? 0) >= 0 ? 'ok' : 'danger'}
              hint={`receita: ${brlShort(r.vsAnoAnterior.receita)} no mesmo período`} />
          : <Stat label="Histórico" value={`${data.dataMonths} meses`} tone="muted" hint="de dados para projetar" />}
      </div>

      {/* Timeline */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-ink font-bold">Realizado + Forecast</h3>
          <div className="flex gap-1 bg-sunken p-1 rounded-lg text-xs">
            {(['receita', 'despesa', 'resultado'] as const).map(mm => (
              <button key={mm} onClick={() => setMetric(mm)}
                className={`px-3 py-1 rounded-md font-medium capitalize ${metric === mm ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>{mm}</button>
            ))}
          </div>
        </div>
        <div className="h-72 w-full overflow-x-auto">
          <div className="min-w-[560px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={chart.rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => (v == null ? '—' : brl(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chart.anchor && <ReferenceLine x={chart.anchor} stroke="var(--color-faint)" strokeDasharray="4 4" label={{ value: 'hoje', position: 'top', fill: 'var(--color-faint)', fontSize: 10 }} />}
                <Line type="monotone" dataKey="Realizado" stroke="var(--color-brand)" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="Projetado" stroke="var(--color-info)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Tabela por grupo */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line"><h3 className="text-ink font-bold text-sm">Projeção por grupo do DRE</h3></div>
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-sunken z-10">Grupo</th>
                {(data.byGroup[0]?.meses || []).map((mm: any) => <th key={mm.mes} className="text-right font-semibold px-2 py-2">{fmtMonthKey(mm.mes)}</th>)}
                <th className="text-right font-semibold px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.byGroup.map((g: any) => (
                <tr key={g.groupType + g.kind} className="border-t border-line hover:bg-sunken/30">
                  <td className={`px-3 py-1.5 sticky left-0 bg-surface z-10 text-[11px] font-semibold uppercase tracking-wide ${g.kind === 'receita' ? 'text-ok' : 'text-danger'}`}>{g.label}</td>
                  {g.meses.map((mm: any) => <td key={mm.mes} className="px-2 py-1.5 text-right font-mono text-ink tabular-nums">{brlShort(mm.valor)}</td>)}
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-ink">{brlShort(g.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line bg-sunken font-bold">
                <td className="px-3 py-2 sticky left-0 bg-sunken z-10 text-ink">Resultado</td>
                {(data.byGroup[0]?.meses || []).map((_: any, i: number) => {
                  const v = data.byGroup.reduce((s: number, g: any) => s + (g.kind === 'receita' ? 1 : -1) * (g.meses[i]?.valor || 0), 0);
                  return <td key={i} className={`px-2 py-2 text-right font-mono tabular-nums ${v >= 0 ? 'text-ink' : 'text-danger'}`}>{brlShort(v)}</td>;
                })}
                <td className={`px-3 py-2 text-right font-mono ${r.resultado >= 0 ? 'text-ink' : 'text-danger'}`}>{brlShort(r.resultado)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-faint text-[11px]">
        Onde há previsão cadastrada (aba Previsões) para o mês, o forecast usa o maior entre a previsão e a projeção estatística — as previsões que você já lançou não são substituídas por uma média.
      </p>
    </div>
  );
};

export default PlanningForecast;
