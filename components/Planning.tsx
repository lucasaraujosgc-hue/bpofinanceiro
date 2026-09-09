import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Target, AlertTriangle, TrendingUp, Wallet,
  Scale, Gauge, Info,
} from 'lucide-react';
import {
  MONTHS, brl, brlShort, pctTxt, fmtMonthKey, CHART_AXIS, CHART_TOOLTIP,
  Card, Stat, ComingSoon,
} from './reportUi';
import { Category } from '../types';
import PlanningBudget from './PlanningBudget';
import PlanningBudgetVsActual from './PlanningBudgetVsActual';
import PlanningForecast from './PlanningForecast';
import PlanningScenarios from './PlanningScenarios';

interface PlanningProps {
  token: string;
  categories: Category[];
}

type SubTab = 'dashboard' | 'orcamento' | 'orcado-realizado' | 'forecast' | 'cenarios' | 'simulador' | 'modelagem';

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'orcado-realizado', label: 'Orçado × Realizado' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'cenarios', label: 'Cenários' },
  { id: 'simulador', label: 'Simulador' },
  { id: 'modelagem', label: 'Modelagem' },
];

const sev = (s: string) =>
  s === 'alta' ? 'border-danger/30 bg-danger/10 text-danger'
    : s === 'media' ? 'border-warn/30 bg-warn/10 text-warn'
      : 'border-info/30 bg-info/10 text-info';

const Planning: React.FC<PlanningProps> = ({ token, categories }) => {
  const [sub, setSub] = useState<SubTab>('dashboard');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1));

  useEffect(() => {
    if (sub !== 'dashboard') return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/planning/overview?year=${year}&month=${month}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sub, year, month, headers]);

  const renderDashboard = () => {
    if (loading) {
      return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
    }
    if (!data) return <p className="text-faint text-sm text-center py-16">Sem dados para o período.</p>;

    const { receita, despesa, resultado, caixa, series, alertas } = data;
    const hasBudget = !!data.hasBudget;
    const chartData = (key: 'receita' | 'despesa' | 'resultado') =>
      (series[key] || []).map((d: any) => ({
        mes: fmtMonthKey(d.mes), Realizado: d.realizado, Previsto: d.previsto,
        ...(hasBudget ? { Orçado: d.orcado } : {}),
      }));
    const caixaData = (series.caixa || []).map((d: any) => ({ mes: fmtMonthKey(d.mes), Saldo: d.saldo }));
    const margemData = (series.margem || []).map((d: any) => ({ mes: fmtMonthKey(d.mes), Margem: d.pct }));

    return (
      <div className="space-y-6">
        {alertas?.length > 0 && (
          <div className="space-y-2">
            {alertas.map((a: any, i: number) => (
              <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${sev(a.severidade)}`}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{a.mensagem}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Receita realizada" value={brl(receita.realizada)} tone="ok"
            hint={`Prevista: +${brlShort(receita.prevista)}${receita.orcada != null ? ` · Orçada: ${brlShort(receita.orcada)}` : ''}`} />
          <Stat label="Despesa realizada" value={brl(despesa.realizada)} tone="danger"
            hint={`Prevista: +${brlShort(despesa.prevista)}${despesa.orcada != null ? ` · Orçada: ${brlShort(despesa.orcada)}` : ''}`} />
          <Stat label="Resultado realizado" value={brl(resultado.realizado)} tone={resultado.realizado >= 0 ? 'ok' : 'danger'}
            hint={`Projetado: ${brlShort(resultado.projetado)}`} />
          <Stat label="Caixa atual" value={brl(caixa.atual)} tone={caixa.atual >= 0 ? 'ink' : 'danger'}
            hint={`Projetado (${data.horizonte}m): ${brlShort(caixa.projetado)}`} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Ponto de equilíbrio" value={data.pontoEquilibrio ? brl(data.pontoEquilibrio) : '—'} tone="muted"
            hint="Receita líquida p/ empatar" />
          <Stat label="Margem de segurança" value={pctTxt(data.margemSegurancaPct)} tone={((data.margemSegurancaPct ?? -1) >= 0) ? 'ok' : 'danger'} />
          <Stat label="Margem líquida" value={pctTxt(data.margemAtualPct)} tone={((data.margemAtualPct ?? 0) >= 0) ? 'ink' : 'danger'} />
          <Stat label="Crescimento projetado" value={pctTxt(data.crescimentoProjetadoPct)} tone={((data.crescimentoProjetadoPct ?? 0) >= 0) ? 'ok' : 'danger'}
            hint="vs. mesmo mês do ano anterior" />
        </div>

        {data.ncg && (
          <Card className="!p-4">
            <div className="flex items-start gap-2 text-sm">
              <Info size={15} className="text-info shrink-0 mt-0.5" />
              <span className="text-muted">
                Necessidade de capital de giro: <span className="font-mono font-bold text-ink">{brl(data.ncg.valor)}</span>
                {' '}
                {data.ncg.metodo === 'ciclo'
                  ? '— pelo ciclo (PMR × receita diária − PMP × despesa diária). Detalhe na aba Ciclo Financeiro (Relatórios).'
                  : '— estimada pela carteira de previsões em aberto (a receber − a pagar).'}
              </span>
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          {(['receita', 'despesa', 'resultado'] as const).map((k) => (
            <Card key={k}>
              <h3 className="text-ink font-bold capitalize mb-1">{k}: Realizado × Previsto{hasBudget ? ' × Orçado' : ''}</h3>
              <p className="text-muted text-xs mb-4">Últimos 12 meses.{hasBudget ? '' : ' A coluna "Orçado" aparece quando você criar um orçamento.'}</p>
              <div className="h-64 w-full overflow-x-auto">
                <div className="min-w-[520px] h-full">
                  <ResponsiveContainer>
                    <ComposedChart data={chartData(k)} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                      <XAxis dataKey="mes" tick={CHART_AXIS} axisLine={false} tickLine={false} />
                      <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Realizado" fill="var(--color-brand)" radius={[3, 3, 0, 0]} maxBarSize={hasBudget ? 18 : 26} />
                      <Bar dataKey="Previsto" fill="var(--color-info)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={hasBudget ? 18 : 26} />
                      {hasBudget && <Bar dataKey="Orçado" fill="var(--color-warn)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={18} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          ))}

          <Card>
            <h3 className="text-ink font-bold mb-1 flex items-center gap-2"><Wallet size={16} className="text-brand" /> Evolução do caixa</h3>
            <p className="text-muted text-xs mb-4">Saldo ao fim de cada mês (reconstruído do histórico).</p>
            <div className="h-64 w-full overflow-x-auto">
              <div className="min-w-[520px] h-full">
                <ResponsiveContainer>
                  <AreaChart data={caixaData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pg-caixa" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="mes" tick={CHART_AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                    <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                    <Area type="monotone" dataKey="Saldo" stroke="var(--color-brand)" fill="url(#pg-caixa)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <h3 className="text-ink font-bold mb-1 flex items-center gap-2"><Gauge size={16} className="text-brand" /> Evolução da margem líquida</h3>
          <div className="h-56 w-full overflow-x-auto">
            <div className="min-w-[520px] h-full">
              <ResponsiveContainer>
                <ComposedChart data={margemData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="mes" tick={CHART_AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} width={44} />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => pctTxt(v)} />
                  <Line type="monotone" dataKey="Margem" stroke="var(--color-brand)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <p className="text-faint text-[11px] flex items-center gap-1.5">
          <Info size={13} /> {data.meta?.nota}
        </p>
      </div>
    );
  };

  const soon: Record<Exclude<SubTab, 'dashboard' | 'orcamento' | 'orcado-realizado' | 'forecast' | 'cenarios'>, [string, string]> = {
    'simulador': ['Simulador', '"E se a receita subir 20%?", "E se eu reduzir despesas administrativas em 15%?". Altere premissas e veja o impacto imediato — sem tocar nos dados reais.'],
    'modelagem': ['Modelagem Financeira', 'Projeção completa de 12/24/36 meses: DRE projetada (na estrutura gerencial atual), fluxo de caixa, capital de giro, ponto de equilíbrio, margem de segurança e necessidade de caixa.'],
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2"><Target size={22} className="text-brand" /> Planejamento</h1>
          <p className="text-muted">O que pode acontecer — e o que queremos que aconteça</p>
        </div>
        {sub === 'dashboard' && (
          <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-line">
            <button onClick={prevMonth} className="p-2 hover:bg-sunken rounded text-muted"><ChevronLeft size={16} /></button>
            <div className="px-4 text-center min-w-[150px]">
              <span className="block text-[10px] text-faint font-bold uppercase tracking-wide">Referência</span>
              <span className="block text-sm font-bold text-ink">{MONTHS[month]} / {year}</span>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-sunken rounded text-muted"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-surface p-1 rounded-xl border border-line w-full overflow-x-auto custom-scroll">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              sub === t.id ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink hover:bg-sunken'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {sub === 'dashboard' && renderDashboard()}
        {sub === 'orcamento' && <PlanningBudget token={token} categories={categories} />}
        {sub === 'orcado-realizado' && <PlanningBudgetVsActual token={token} categories={categories} />}
        {sub === 'forecast' && <PlanningForecast token={token} />}
        {sub === 'cenarios' && <PlanningScenarios token={token} />}
        {sub !== 'dashboard' && sub !== 'orcamento' && sub !== 'orcado-realizado' && sub !== 'forecast' && sub !== 'cenarios' && (
          <ComingSoon title={soon[sub][0]}>{soon[sub][1]}</ComingSoon>
        )}
      </div>
    </div>
  );
};

export default Planning;
