import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, Category } from '../types';
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';
import {
  ChevronLeft, ChevronRight, CalendarRange, TrendingUp, Info,
  Target, AlertCircle, ArrowDownRight, ArrowUpRight, Scale, Gauge, Wallet, RefreshCw,
} from 'lucide-react';
import { MethodologyNote, fmtMonthKey, daysTxt } from './reportUi';

interface ReportsProps {
  token: string;
  transactions: Transaction[];
  categories: Category[];
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CAT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};
const pctTxt = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? '—' : `${v.toFixed(1)}%`;

const CHART_AXIS = { fill: 'var(--color-faint)', fontSize: 12 };
const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-line)',
    borderRadius: '10px',
    color: 'var(--color-ink)',
    fontSize: '12px',
  },
  labelStyle: { color: 'var(--color-muted)' },
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-surface rounded-xl border border-line p-5 ${className}`}>{children}</div>
);

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: 'ok' | 'danger' | 'ink' | 'muted' }> = ({
  label, value, hint, tone = 'ink',
}) => {
  const toneCls = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : tone === 'muted' ? 'text-muted' : 'text-ink';
  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <p className="text-muted text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${toneCls}`}>{value}</p>
      {hint && <p className="text-faint text-[11px] mt-0.5">{hint}</p>}
    </div>
  );
};

const Reports: React.FC<ReportsProps> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<'cashflow' | 'dre' | 'analysis' | 'forecasts' | 'cycle'>('cashflow');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [flow, setFlow] = useState<any>(null);
  const [cycleMonths, setCycleMonths] = useState(12);

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  const range = useMemo(() => {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }, [year, month]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setData(null);
      const ep = activeTab === 'cashflow' ? `/api/reports/cash-flow?year=${year}&month=${month}`
        : activeTab === 'forecasts' ? `/api/reports/forecasts?year=${year}&month=${month}`
        : activeTab === 'dre' ? `/api/reports/dre-hierarchical?year=${year}&month=${month}`
        : activeTab === 'cycle' ? `/api/reports/financial-cycle?year=${year}&month=${month}&months=${cycleMonths}`
        : `/api/reports/analysis?year=${year}&month=${month}`;
      try {
        const res = await fetch(ep, { headers });
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setData(json);
      } catch (e) { console.error(e); }
      if (!cancelled) setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [activeTab, year, month, headers, cycleMonths]);

  useEffect(() => {
    if (activeTab !== 'cashflow') return;
    let cancelled = false;
    fetch(`/api/reports/daily-flow?startDate=${range.start}&endDate=${range.end}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setFlow(j); })
      .catch(e => console.error(e));
    return () => { cancelled = true; };
  }, [activeTab, range.start, range.end, headers]);

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1));

  /* ------------------------------------------------------------- CASH FLOW */
  const renderCashFlow = () => {
    if (!data || typeof data.totalReceitas === 'undefined') return null;
    const series = (flow?.series || []).map((d: any) => ({ ...d, label: d.date.slice(8) + '/' + d.date.slice(5, 7) }));

    const catBars = (arr: { name: string; value: number }[], color: string) => {
      const top = arr.slice(0, 7);
      const rest = arr.slice(7).reduce((s, i) => s + i.value, 0);
      const rows = rest > 0 ? [...top, { name: 'Outros', value: rest }] : top;
      const total = arr.reduce((s, i) => s + i.value, 0) || 1;
      return (
        <div className="space-y-2.5">
          {rows.length === 0 && <p className="text-faint text-sm text-center py-6">Sem lançamentos.</p>}
          {rows.map((r, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted truncate pr-2">{r.name}</span>
                <span className="font-mono text-ink shrink-0">{brl(r.value)} · {((r.value / total) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-sunken rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.value / total) * 100}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Saldo inicial" value={brl(data.startBalance)} tone="muted" />
          <Stat label="Entradas" value={brl(data.totalReceitas)} tone="ok" hint={`${MONTHS[month]}/${year}`} />
          <Stat label="Saídas" value={brl(data.totalDespesas)} tone="danger" />
          <Stat label="Saldo final" value={brl(data.endBalance)} tone={data.endBalance >= 0 ? 'ok' : 'danger'} />
        </div>

        {flow && series.length > 0 && (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-ink font-bold flex items-center gap-2">
                  <CalendarRange className="text-brand" size={18} /> Evolução do Caixa
                </h3>
                <p className="text-muted text-sm">Saldo acumulado dia a dia — as barras são entradas e saídas do dia</p>
              </div>
              <div className={`text-right text-sm ${flow.minSaldo < 0 ? 'text-danger' : 'text-muted'}`}>
                <span className="block text-xs text-faint uppercase tracking-wide">Menor saldo do período</span>
                <span className="font-mono font-bold">{brl(flow.minSaldo)}</span>
                <span className="block text-[11px] text-faint">
                  {new Date(flow.minDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer>
                <ComposedChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="label" tick={CHART_AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={brlShort} />
                  <Tooltip
                    {...CHART_TOOLTIP}
                    formatter={(v: any, n: any) => [brl(Number(v)), n]}
                    labelFormatter={(l: any) => {
                      const row = series.find((s: any) => s.label === l);
                      return row ? new Date(row.date + 'T00:00:00').toLocaleDateString('pt-BR') : l;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="var(--color-danger)" strokeDasharray="4 4" />
                  <Bar dataKey="income" name="Entradas" fill="var(--color-ok)" radius={[3, 3, 0, 0]} barSize={9} />
                  <Bar dataKey="expense" name="Saídas" fill="var(--color-danger)" radius={[3, 3, 0, 0]} barSize={9} />
                  <Area type="monotone" dataKey="saldo" name="Saldo acumulado" stroke="var(--color-brand)" strokeWidth={2} fill="url(#saldoFill)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-ink font-semibold mb-4 flex items-center gap-2">
              <ArrowUpRight className="text-ok" size={16} /> Entradas por categoria
            </h3>
            {catBars(data.receitasByCategory || [], 'var(--color-ok)')}
          </Card>
          <Card>
            <h3 className="text-ink font-semibold mb-4 flex items-center gap-2">
              <ArrowDownRight className="text-danger" size={16} /> Saídas por categoria
            </h3>
            {catBars(data.despesasByCategory || [], 'var(--color-danger)')}
          </Card>
        </div>
      </div>
    );
  };

  /* ------------------------------------------------------------- DRE */
  const renderDre = () => {
    if (!data || !Array.isArray(data.lines)) return null;
    const ind = data.indicadores || {};
    const marginCard = (label: string, val: number, pct: number) => (
      <div className="bg-surface rounded-xl border border-line p-4">
        <p className="text-muted text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-bold font-mono mt-1 ${val >= 0 ? 'text-ink' : 'text-danger'}`}>{brl(val)}</p>
        <p className={`text-xs font-semibold ${pct >= 0 ? 'text-ok' : 'text-danger'}`}>{pctTxt(pct)} da Rec. Líquida</p>
      </div>
    );

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {marginCard('Lucro Bruto', ind.lucroBruto || 0, ind.margemBrutaPct || 0)}
          {marginCard('Result. Operacional', ind.resultadoOperacional || 0, ind.margemOperacionalPct || 0)}
          {marginCard('Result. Financeiro', ind.resultadoFinanceiro || 0, ind.receitaLiquida ? (ind.resultadoFinanceiro / ind.receitaLiquida) * 100 : 0)}
          {marginCard('Lucro Líquido', ind.lucroLiquido || 0, ind.margemLiquidaPct || 0)}
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-ink">Demonstração do Resultado (DRE Gerencial)</h3>
            <span className="text-[11px] text-faint uppercase tracking-wide">Regime de caixa · AV = % da Rec. Líquida</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint text-[11px] uppercase tracking-wide">
                  <th className="text-left font-semibold px-5 py-2">Conta</th>
                  <th className="text-right font-semibold px-4 py-2">Valor</th>
                  <th className="text-right font-semibold px-5 py-2 w-20">AV %</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((ln: any) => {
                  const strong = ln.kind === 'subtotal' || ln.kind === 'total';
                  const isTot = ln.kind === 'total';
                  return (
                    <React.Fragment key={ln.key}>
                      <tr className={strong ? 'bg-sunken/50' : 'hover:bg-sunken/30'}>
                        <td className={`px-5 py-2.5 ${strong ? 'font-bold text-ink' : 'font-medium text-muted'} ${isTot ? 'text-base' : ''}`}>
                          {ln.label}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${strong ? 'font-bold' : ''} ${
                          ln.value < 0 ? 'text-danger' : strong ? 'text-ok' : 'text-ink'
                        } ${isTot ? 'text-base' : ''}`}>
                          {brl(ln.value)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-xs text-faint">{pctTxt(ln.pct)}</td>
                      </tr>
                      {(ln.children || []).map((c: any, i: number) => (
                        <tr key={ln.key + '-' + i} className="text-xs">
                          <td className="pl-10 pr-5 py-1.5 text-faint">{c.label}</td>
                          <td className="px-4 py-1.5 text-right font-mono text-muted">{brl(c.value)}</td>
                          <td className="px-5 py-1.5" />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-faint flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          Aportes de sócios, empréstimos, distribuição de lucros e transferências entre contas não entram no DRE
          (são movimentações patrimoniais). Classifique cada categoria pelo grupo contábil na aba <b>Categorias</b>.
        </p>
      </div>
    );
  };

  /* ------------------------------------------------------------- ANÁLISE */
  const scoreTone = (s: number) =>
    s >= 60 ? { t: 'text-ok', b: 'border-ok/40', bg: 'bg-ok/10', label: s >= 80 ? 'Excelente' : 'Saudável' }
    : s >= 40 ? { t: 'text-warn', b: 'border-warn/40', bg: 'bg-warn/10', label: 'Atenção' }
    : { t: 'text-danger', b: 'border-danger/40', bg: 'bg-danger/10', label: 'Crítico' };

  const renderAnalysis = () => {
    if (!data || !data.kpis || !data.advanced) return null;
    const { kpis, advanced, dre } = data;
    const st = scoreTone(kpis.financialHealthScore);

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {advanced.resumoExecutivo && (
          <Card className="border-brand/30">
            <h3 className="text-ink font-bold mb-1.5">Resumo executivo</h3>
            <p className="text-muted leading-relaxed">{advanced.resumoExecutivo}</p>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className={`lg:col-span-3 rounded-xl border p-5 flex flex-col items-center justify-center text-center ${st.bg} ${st.b}`}>
            <p className="text-xs uppercase tracking-wide font-bold text-muted">Score financeiro</p>
            <p className={`text-6xl font-bold font-mono my-1 ${st.t}`}>{kpis.financialHealthScore}</p>
            <p className={`font-bold ${st.t}`}>{st.label}</p>
            <p className="text-faint text-[11px] mt-2">Margens, ponto de equilíbrio e estrutura de custos.</p>
          </div>
          <div className="lg:col-span-9 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Margem bruta" value={pctTxt(kpis.margemBrutaPct)} tone={kpis.margemBrutaPct >= 0 ? 'ok' : 'danger'} />
            <Stat label="Margem operacional" value={pctTxt(kpis.margemOperacionalPct)} tone={kpis.margemOperacionalPct >= 0 ? 'ok' : 'danger'} />
            <Stat label="Margem líquida" value={pctTxt(kpis.margemLiquidaPct)} tone={kpis.margemLiquidaPct >= 0 ? 'ok' : 'danger'} />
            <Stat label="Margem de contribuição" value={pctTxt(kpis.margemContribuicaoPct)} hint={brl(dre.margemContribuicao)} />
            <Stat label="Ponto de equilíbrio" value={kpis.pontoEquilibrio ? brl(kpis.pontoEquilibrio) : '—'} hint="rec. líquida p/ empatar" />
            <Stat label="Margem de segurança" value={pctTxt(kpis.margemSegurancaPct)} tone={(kpis.margemSegurancaPct ?? -1) >= 0 ? 'ok' : 'danger'} />
            <Stat label="Ticket médio" value={brl(kpis.ticketMedio)} hint="por lançamento de receita" />
            <Stat label="Alavancagem oper. (GAO)" value={kpis.grauAlavancagem ? kpis.grauAlavancagem.toFixed(2) + 'x' : '—'} hint="sensibilidade do lucro" />
            <Stat label="Custo fixo / total" value={pctTxt(kpis.pctCustoFixo)} hint={`Fixo ${brl(advanced.fixoVariavel.fixo)}`} />
          </div>
        </div>

        {advanced.projecao && (
          <Card className="border-info/30 bg-info/5">
            <h3 className="font-bold text-info mb-1 flex items-center gap-2"><TrendingUp size={16} /> Projeção do mês</h3>
            <p className="text-sm text-muted mb-3">
              No ritmo dos primeiros {advanced.projecao.diaAtual} de {advanced.projecao.diasNoMes} dias:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Receita líquida" value={brl(advanced.projecao.receitaLiquida)} tone="ok" />
              <Stat label="Custos + despesas" value={brl(advanced.projecao.despesas)} tone="danger" />
              <Stat label="Result. operacional" value={brl(advanced.projecao.resultadoOperacional)} tone={advanced.projecao.resultadoOperacional >= 0 ? 'ok' : 'danger'} />
              <Stat label="Lucro líquido" value={brl(advanced.projecao.lucroLiquido)} tone={advanced.projecao.lucroLiquido >= 0 ? 'ok' : 'danger'} />
            </div>
          </Card>
        )}

        {advanced.insights?.length > 0 && (
          <Card>
            <h3 className="font-bold text-ink mb-3">Leitura automática</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {advanced.insights.map((ins: any, i: number) => {
                const tone = ins.type === 'alerta' ? { i: 'text-danger', b: 'border-danger/30 bg-danger/5' }
                  : ins.type === 'recomendacao' ? { i: 'text-info', b: 'border-info/30 bg-info/5' }
                  : { i: 'text-ok', b: 'border-ok/30 bg-ok/5' };
                const Icon = ins.type === 'alerta' ? AlertCircle : ins.type === 'recomendacao' ? Info : TrendingUp;
                return (
                  <div key={i} className={`p-3.5 rounded-lg border flex gap-3 ${tone.b}`}>
                    <Icon size={16} className={`shrink-0 mt-0.5 ${tone.i}`} />
                    <div className="text-sm text-ink">
                      <span className="block text-[10px] uppercase tracking-wide text-faint font-bold mb-0.5">{ins.type}</span>
                      {ins.message}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-bold text-ink mb-3 flex items-center gap-2"><Scale size={16} className="text-brand" /> Análise vertical (AV)</h3>
            <table className="w-full text-sm">
              <tbody>
                {advanced.verticalAnalysis.map((r: any, i: number) => {
                  const strong = r.label.startsWith('=');
                  return (
                    <tr key={i} className={strong ? 'bg-sunken/40' : ''}>
                      <td className={`py-1.5 px-2 ${strong ? 'font-bold text-ink' : 'text-muted'}`}>{r.label}</td>
                      <td className={`py-1.5 px-2 text-right font-mono ${r.valor < 0 ? 'text-danger' : 'text-ink'}`}>{brl(r.valor)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-xs text-faint w-16">{pctTxt(r.pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card>
            <h3 className="font-bold text-ink mb-3 flex items-center gap-2"><Gauge size={16} className="text-brand" /> Análise horizontal (vs. período anterior)</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint text-[11px] uppercase">
                  <th className="text-left font-semibold py-1.5 px-2">Conta</th>
                  <th className="text-right font-semibold py-1.5 px-2">Atual</th>
                  <th className="text-right font-semibold py-1.5 px-2">Var.</th>
                </tr>
              </thead>
              <tbody>
                {advanced.horizontalAnalysis.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-sunken/30">
                    <td className="py-1.5 px-2 text-muted">{r.label}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-ink">{brl(r.atual)}</td>
                    <td className={`py-1.5 px-2 text-right font-mono text-xs ${
                      r.varPct === null ? 'text-faint' : r.varPct >= 0 ? 'text-ok' : 'text-danger'
                    }`}>
                      {r.varPct === null ? '—' : `${r.varPct >= 0 ? '+' : ''}${r.varPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {advanced.composicaoDespesas?.length > 0 && (
          <Card>
            <h3 className="font-bold text-ink mb-3">Composição de custos e despesas</h3>
            <div className="space-y-2.5">
              {advanced.composicaoDespesas.map((c: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">{c.label}</span>
                    <span className="font-mono text-ink">{brl(c.value)} · {c.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 w-full bg-sunken rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h3 className="font-bold text-ink mb-4 flex items-center gap-2"><Wallet size={16} className="text-brand" /> Geração de caixa x Resultado contábil</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-muted text-sm mb-1">Caixa do período</p>
              <p className={`text-2xl font-bold font-mono ${advanced.geracaoCaixa >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(advanced.geracaoCaixa)}</p>
            </div>
            <div>
              <p className="text-muted text-sm mb-1">Result. operacional</p>
              <p className={`text-2xl font-bold font-mono ${advanced.resultadoOperacional >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(advanced.resultadoOperacional)}</p>
            </div>
            <div>
              <p className="text-muted text-sm mb-1">Lucro líquido (DRE)</p>
              <p className={`text-2xl font-bold font-mono ${advanced.lucroLiquidoVal >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(advanced.lucroLiquidoVal)}</p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {([['Curva ABC — Despesas', advanced.paretoDespesas, 'var(--color-danger)'], ['Curva ABC — Receitas', advanced.paretoReceitas, 'var(--color-ok)']] as const).map(
            ([title, list, color]) => (
              <Card key={title}>
                <h3 className="font-bold text-ink text-sm uppercase mb-3">{title}</h3>
                <div className="space-y-3">
                  {list.length === 0 && <p className="text-faint text-sm text-center py-4">Sem dados.</p>}
                  {list.map((it: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted truncate pr-2">{it.nome}</span>
                        <span className="font-mono text-ink shrink-0">{brl(it.valor)} · {it.impacto.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-sunken rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(it.impacto, 100)}%`, background: color }} />
                      </div>
                      <p className="text-[10px] text-faint text-right mt-0.5">acum. {it.acumulado.toFixed(0)}%</p>
                    </div>
                  ))}
                </div>
              </Card>
            ),
          )}
        </div>
      </div>
    );
  };

  /* -------------------------------------------------------- CICLO FINANCEIRO */
  const renderCycle = () => {
    if (!data || !data.atual) return null;
    const a = data.atual;
    const sm = data.serieMensal || [];
    const carteira = data.carteiraFutura || [];

    const dtxt = (v: number | null) => (v === null || v === undefined ? '—' : daysTxt(v));
    const caixaRows = sm.map((s: any) => ({ mes: fmtMonthKey(s.mes), Caixa: s.caixa }));
    const carteiraRows = carteira.map((c: any) => ({
      mes: fmtMonthKey(c.mes), 'A receber': c.aReceber, 'A pagar': c.aPagar, Saldo: c.aReceber - c.aPagar,
    }));

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-faint">Janela:</span>
          {[6, 12, 24, 36].map(n => (
            <button key={n} onClick={() => setCycleMonths(n)}
              className={`px-2.5 py-1 rounded-md font-medium ${cycleMonths === n ? 'bg-brand text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}>
              {n}m
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-xs text-muted flex items-start gap-2">
          <Info size={14} className="text-info shrink-0 mt-0.5" />
          <span>O sistema é regime de caixa (sem contas a receber/pagar). PMR, PMP, CCC e a NCG são estimados pela <strong>carteira de previsões em aberto</strong> — um retrato do momento, não uma série histórica. Cadastre previsões de recebimento e de pagamento na aba Previsões para alimentá-los.</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="PMR — prazo de recebimento" value={dtxt(a.pmr)}
            hint={a.pmrMetodo === 'indisponivel' ? 'cadastre previsões de recebimento' : 'média da carteira em aberto'}
            tone={a.pmr === null ? 'muted' : 'ink'} />
          <Stat label="PMP — prazo de pagamento" value={dtxt(a.pmp)}
            hint={a.pmpMetodo === 'indisponivel' ? 'cadastre previsões de pagamento' : 'média da carteira em aberto'}
            tone={a.pmp === null ? 'muted' : 'ink'} />
          <Stat label="PME — prazo de estoque" value="indisponível" tone="muted"
            hint="depende de controle de estoque" />
          <Stat label="Ciclo operacional" value={dtxt(a.cicloOperacional)} tone={a.cicloOperacional === null ? 'muted' : 'ink'}
            hint="PMR + PME (sem PME)" />
          <Stat label="CCC — ciclo financeiro" value={dtxt(a.ccc)} tone={a.ccc === null ? 'muted' : (a.ccc > 45 ? 'danger' : 'ink')}
            hint="PMR + PME − PMP (sem PME)" />
          <Stat label="Capital de giro líquido" value={a.cgl != null ? brl(a.cgl) : '—'} tone={a.cgl == null ? 'muted' : (a.cgl >= 0 ? 'ok' : 'danger')}
            hint="Caixa + NCG" />
          <Stat label="NCG" value={a.ncg != null ? brl(a.ncg) : '—'} tone={a.ncg == null ? 'muted' : 'ink'}
            hint={a.ncgSobreReceita != null ? `${a.ncgSobreReceita.toFixed(1)}% da receita líquida` : 'a receber − a pagar (carteira)'} />
          <Stat label="Saldo em tesouraria" value={a.tesouraria != null ? brl(a.tesouraria) : '—'} tone={a.tesouraria == null ? 'muted' : (a.tesouraria >= 0 ? 'ok' : 'danger')}
            hint="disponível líquido (= caixa)" />
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <h3 className="text-ink font-bold mb-1">Evolução do caixa</h3>
            <p className="text-muted text-xs mb-4">Saldo ao fim de cada mês (reconstruído do histórico de lançamentos).</p>
            <div className="h-64 w-full overflow-x-auto">
              <div className="min-w-[520px] h-full">
                <ResponsiveContainer>
                  <ComposedChart data={caixaRows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cy-caixa" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="mes" tick={CHART_AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                    <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                    <Area type="monotone" dataKey="Caixa" stroke="var(--color-brand)" fill="url(#cy-caixa)" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-ink font-bold mb-1">Previsões em aberto por mês</h3>
            <p className="text-muted text-xs mb-4">A receber × a pagar da carteira de previsões ainda não realizadas.</p>
            <div className="h-64 w-full overflow-x-auto">
              <div className="min-w-[520px] h-full">
                {carteiraRows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-faint text-sm">Sem previsões em aberto.</div>
                ) : (
                  <ResponsiveContainer>
                    <ComposedChart data={carteiraRows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                      <XAxis dataKey="mes" tick={CHART_AXIS} axisLine={false} tickLine={false} />
                      <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="A receber" fill="var(--color-ok)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="A pagar" fill="var(--color-danger)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Line type="monotone" dataKey="Saldo" stroke="var(--color-brand)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </Card>
        </div>

        {data.interpretacao?.length > 0 && (
          <Card>
            <h3 className="text-ink font-bold mb-3 flex items-center gap-2"><Info size={16} className="text-brand" /> Interpretação</h3>
            <ul className="space-y-2 text-sm text-muted">
              {data.interpretacao.map((line: string, i: number) => (
                <li key={i} className="flex gap-2"><span className="text-brand">•</span><span>{line}</span></li>
              ))}
            </ul>
          </Card>
        )}

        {data.meta?.metodologia && (
          <MethodologyNote items={[
            ['PMR — Prazo Médio de Recebimento', data.meta.metodologia.pmr],
            ['PMP — Prazo Médio de Pagamento', data.meta.metodologia.pmp],
            ['PME — Prazo Médio de Estoque', data.meta.metodologia.pme],
            ['Caixa', data.meta.metodologia.caixa],
            ['NCG — Necessidade de Capital de Giro', data.meta.metodologia.ncg],
            ['Capital de Giro Líquido', data.meta.metodologia.cgl],
            ['Saldo em Tesouraria', data.meta.metodologia.tesouraria],
          ]} />
        )}
      </div>
    );
  };

  /* ------------------------------------------------------------- PREVISÕES */
  const renderForecasts = () => {
    if (!data || !data.summary) return null;
    const s = data.summary;
    const bar = (label: string, prev: number, done: number, pend: number, tone: 'text-ok' | 'text-danger') => {
      const p = prev > 0 ? (done / prev) * 100 : 0;
      return (
        <Card>
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className={`font-bold flex items-center gap-2 ${tone}`}><Target size={16} /> {label}</p>
              <p className="text-2xl font-bold text-ink font-mono mt-1">{brl(prev)}</p>
            </div>
            <p className={`text-xl font-bold font-mono ${tone}`}>{p.toFixed(0)}%</p>
          </div>
          <div className="h-2 w-full bg-sunken rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${tone === 'text-ok' ? 'bg-ok' : 'bg-danger'}`} style={{ width: `${Math.min(p, 100)}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-faint font-mono">
            <span>Realizado {brl(done)}</span><span>Pendente {brl(pend)}</span>
          </div>
        </Card>
      );
    };
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bar('Receitas previstas', s.predictedIncome, s.realizedIncome, s.pendingIncome, 'text-ok')}
          {bar('Despesas previstas', s.predictedExpense, s.realizedExpense, s.pendingExpense, 'text-danger')}
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-line bg-warn/10 flex items-center gap-2">
            <AlertCircle size={16} className="text-warn" />
            <h3 className="font-bold text-warn">Pendentes neste mês</h3>
          </div>
          <div className="overflow-x-auto max-h-96 custom-scroll">
            <table className="w-full text-sm">
              <thead className="bg-ground text-muted sticky top-0">
                <tr>
                  <th className="px-5 py-2.5 text-left">Dia</th>
                  <th className="px-5 py-2.5 text-left">Descrição</th>
                  <th className="px-5 py-2.5 text-left">Categoria</th>
                  <th className="px-5 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.filter((i: any) => !i.realized).length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-ok font-medium">Tudo realizado.</td></tr>
                ) : data.items.filter((i: any) => !i.realized).map((it: any) => (
                  <tr key={it.id} className="hover:bg-sunken/30">
                    <td className="px-5 py-2.5 font-mono text-muted">{it.date.split('-')[2]}</td>
                    <td className="px-5 py-2.5 text-ink">{it.description}</td>
                    <td className="px-5 py-2.5 text-faint text-xs">{it.category_name || '—'}</td>
                    <td className={`px-5 py-2.5 text-right font-mono font-bold ${it.type === 'credito' ? 'text-ok' : 'text-danger'}`}>{brl(it.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'cashflow', label: 'Fluxo de Caixa' },
    { id: 'forecasts', label: 'Previsões' },
    { id: 'dre', label: 'DRE Gerencial' },
    { id: 'analysis', label: 'Análise Detalhada' },
    { id: 'cycle', label: 'Ciclo Financeiro' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Relatórios Financeiros</h1>
          <p className="text-muted">Fluxo de caixa, DRE e análise gerencial</p>
        </div>
        <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-line">
          <button onClick={prevMonth} className="p-2 hover:bg-sunken rounded text-muted"><ChevronLeft size={16} /></button>
          <div className="px-4 text-center min-w-[150px]">
            <span className="block text-[10px] text-faint font-bold uppercase tracking-wide">Competência</span>
            <span className="block text-sm font-bold text-ink">{MONTHS[month]} / {year}</span>
          </div>
          <button onClick={nextMonth} className="p-2 hover:bg-sunken rounded text-muted"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="flex gap-1 bg-surface p-1 rounded-xl border border-line w-full md:w-fit overflow-x-auto custom-scroll">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 md:flex-none px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.id ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink hover:bg-sunken'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        ) : (
          <>
            {activeTab === 'cashflow' && renderCashFlow()}
            {activeTab === 'forecasts' && renderForecasts()}
            {activeTab === 'dre' && renderDre()}
            {activeTab === 'analysis' && renderAnalysis()}
            {activeTab === 'cycle' && renderCycle()}
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;
