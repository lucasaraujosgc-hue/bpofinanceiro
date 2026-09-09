import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Info, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { Category } from '../types';
import { brl, brlShort, pctTxt, CHART_AXIS, CHART_TOOLTIP, Card, Stat, MONTHS } from './reportUi';

interface Props { token: string; categories: Category[]; }

const STATUS: Record<string, { label: string; cls: string }> = {
  acima: { label: 'Acima', cls: 'bg-ok/15 text-ok' },
  ok: { label: 'No orçado', cls: 'bg-ok/15 text-ok' },
  atencao: { label: 'Atenção', cls: 'bg-warn/15 text-warn' },
  abaixo: { label: 'Abaixo', cls: 'bg-danger/15 text-danger' },
  estouro: { label: 'Estourou', cls: 'bg-danger/15 text-danger' },
  sem_orcamento: { label: 'Sem orçado', cls: 'bg-sunken text-faint' },
  zerado: { label: '—', cls: 'bg-sunken text-faint' },
};
const insTone = (t: string) =>
  t === 'alerta' || t === 'estouro' || t === 'abaixo' ? 'border-danger/30 bg-danger/10 text-danger'
    : t === 'economia' || t === 'insight' ? 'border-ok/30 bg-ok/10 text-ok'
      : 'border-info/30 bg-info/10 text-info';

const PlanningBudgetVsActual: React.FC<Props> = ({ token }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState<'month' | 'ytd' | 'year'>('ytd');
  const [month, setMonth] = useState(new Date().getMonth());
  const [tipo, setTipo] = useState<'tudo' | 'receita' | 'despesa'>('tudo');
  const [q, setQ] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `year=${year}&period=${period}${period === 'month' ? `&month=${month}` : ''}`;
    fetch(`/api/planning/budget-vs-actual?${qs}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, period, month, headers]);

  const grupos = useMemo(() => {
    if (!data?.grupos) return [];
    return data.grupos
      .filter((g: any) => tipo === 'tudo' || g.kind === tipo)
      .map((g: any) => ({
        ...g,
        categorias: g.categorias.filter((c: any) => !q || c.name.toLowerCase().includes(q.toLowerCase())),
      }))
      .filter((g: any) => g.categorias.length > 0 || !q);
  }, [data, tipo, q]);

  const chartData = useMemo(() =>
    (data?.grupos || [])
      .filter((g: any) => tipo === 'tudo' || g.kind === tipo)
      .map((g: any) => ({ grupo: g.label.length > 18 ? g.label.slice(0, 17) + '…' : g.label, Orçado: g.orcado, Realizado: g.realizado })),
    [data, tipo]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  if (!data) return <p className="text-faint text-sm text-center py-16">Erro ao carregar.</p>;

  if (!data.hasBudget) {
    return (
      <div className="space-y-4">
        <PeriodBar {...{ year, setYear, period, setPeriod, month, setMonth }} />
        <div className="bg-surface rounded-xl border border-dashed border-line p-10 text-center max-w-lg mx-auto">
          <h3 className="text-ink font-bold text-lg mb-2">Sem orçamento para {year}</h3>
          <p className="text-muted text-sm">Crie e preencha o orçamento na aba <strong>Orçamento</strong> para comparar com o realizado.</p>
        </div>
      </div>
    );
  }

  const ind = data.indicadores;

  return (
    <div className="space-y-5">
      <PeriodBar {...{ year, setYear, period, setPeriod, month, setMonth }} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Atingimento da receita" value={pctTxt(ind.atingimentoReceitaPct)}
          tone={(ind.atingimentoReceitaPct ?? 0) >= 100 ? 'ok' : (ind.atingimentoReceitaPct ?? 0) >= 90 ? 'warn' : 'danger'}
          hint={`${brlShort(ind.receita.realizado)} de ${brlShort(ind.receita.orcado)}`} />
        <Stat label="Controle de despesas" value={pctTxt(ind.controleDespesaPct)}
          tone={(ind.controleDespesaPct ?? 0) <= 100 ? 'ok' : (ind.controleDespesaPct ?? 0) <= 110 ? 'warn' : 'danger'}
          hint={`${brlShort(ind.despesa.realizado)} de ${brlShort(ind.despesa.orcado)}`} />
        <Stat label="Resultado" value={brl(ind.resultado.realizado)}
          tone={ind.resultado.realizado >= ind.resultado.orcado ? 'ok' : 'danger'}
          hint={`orçado: ${brlShort(ind.resultado.orcado)} · Δ ${brlShort(ind.resultado.difAbs)}`} />
        <Stat label="Margem realizada" value={pctTxt(ind.margemRealizadaPct)}
          tone={(ind.margemRealizadaPct ?? 0) >= (ind.margemOrcadaPct ?? 0) ? 'ok' : 'danger'}
          hint={`orçada: ${pctTxt(ind.margemOrcadaPct)}`} />
      </div>

      {data.analise?.length > 0 && (
        <Card>
          <h3 className="text-ink font-bold mb-3 flex items-center gap-2"><Info size={16} className="text-brand" /> Principais variações</h3>
          <ul className="space-y-2">
            {data.analise.map((a: any, i: number) => (
              <li key={i} className={`text-sm rounded-lg border px-3 py-2 flex items-start gap-2 ${insTone(a.tipo)}`}>
                {a.tipo === 'economia' || a.tipo === 'insight' ? <TrendingUp size={15} className="mt-0.5 shrink-0" /> : <TrendingDown size={15} className="mt-0.5 shrink-0" />}
                <span>{a.mensagem}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h3 className="text-ink font-bold mb-3">Orçado × Realizado por grupo</h3>
        <div className="h-72 w-full overflow-x-auto">
          <div className="min-w-[560px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="grupo" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} height={60} />
                <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
                <Bar dataKey="Orçado" fill="var(--color-warn)" fillOpacity={0.6} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Realizado" fill="var(--color-brand)" radius={[3, 3, 0, 0]} maxBarSize={26} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-surface p-1 rounded-lg border border-line text-xs">
          {(['tudo', 'receita', 'despesa'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-3 py-1 rounded-md font-medium capitalize ${tipo === t ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>{t}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar categoria…"
            className="bg-surface border border-line rounded-lg pl-8 pr-3 py-1.5 text-sm text-ink outline-none focus:border-brand w-52" />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 py-2">Categoria</th>
                <th className="text-right font-semibold px-3 py-2">Orçado</th>
                <th className="text-right font-semibold px-3 py-2">Realizado</th>
                <th className="text-right font-semibold px-3 py-2">Δ R$</th>
                <th className="text-right font-semibold px-3 py-2">Δ %</th>
                <th className="text-center font-semibold px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g: any) => (
                <React.Fragment key={g.groupType + g.kind}>
                  <tr className="bg-sunken/50 font-semibold border-t border-line">
                    <td className={`px-3 py-1.5 text-[11px] uppercase tracking-wide ${g.kind === 'receita' ? 'text-ok' : 'text-danger'}`}>{g.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">{brlShort(g.orcado)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-ink">{brlShort(g.realizado)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${g.difAbs > 0 === (g.kind === 'receita') ? 'text-ok' : 'text-danger'}`}>{brlShort(g.difAbs)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">{pctTxt(g.difPct)}</td>
                    <td className="px-3 py-1.5 text-center"><Badge s={g.status} /></td>
                  </tr>
                  {g.categorias.map((c: any) => (
                    <tr key={c.categoryId} className="border-t border-line/60 hover:bg-sunken/30">
                      <td className="px-3 py-1.5 pl-6 text-muted truncate max-w-[240px]" title={c.name}>{c.name}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-faint tabular-nums">{c.orcado ? brl(c.orcado) : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-ink tabular-nums">{c.realizado ? brl(c.realizado) : '—'}</td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${c.difAbs > 0 === (c.kind === 'receita') ? 'text-ok' : 'text-danger'}`}>{brl(c.difAbs)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted tabular-nums">{pctTxt(c.difPct)}</td>
                      <td className="px-3 py-1.5 text-center"><Badge s={c.status} /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {grupos.length === 0 && <tr><td colSpan={6} className="text-center text-faint py-6">Nada no filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-faint text-[11px]">Realizado = soma dos lançamentos da categoria no período. Resultado = receitas − despesas (nível gerencial, não é o lucro líquido da DRE).</p>
    </div>
  );
};

const Badge: React.FC<{ s: string }> = ({ s }) => {
  const x = STATUS[s] || STATUS.zerado;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${x.cls}`}>{x.label}</span>;
};

const PeriodBar: React.FC<any> = ({ year, setYear, period, setPeriod, month, setMonth }) => (
  <div className="flex flex-wrap items-center gap-2">
    <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-surface border border-line rounded-lg px-3 py-1.5 text-ink text-sm">
      {[year - 2, year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
    </select>
    <div className="flex gap-1 bg-surface p-1 rounded-lg border border-line text-xs">
      {([['month', 'Mês'], ['ytd', 'Acumulado'], ['year', 'Ano todo']] as const).map(([id, lbl]) => (
        <button key={id} onClick={() => setPeriod(id)}
          className={`px-3 py-1 rounded-md font-medium ${period === id ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>{lbl}</button>
      ))}
    </div>
    {period === 'month' && (
      <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-surface border border-line rounded-lg px-3 py-1.5 text-ink text-sm">
        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
      </select>
    )}
  </div>
);

export default PlanningBudgetVsActual;
