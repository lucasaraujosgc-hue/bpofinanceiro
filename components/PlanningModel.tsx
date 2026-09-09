import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from 'recharts';
import { LayoutGrid, Download, AlertTriangle, TrendingDown } from 'lucide-react';
import { brl, brlShort, pctTxt, fmtMonthKey, CHART_AXIS, CHART_TOOLTIP, Card, Stat, MethodologyNote } from './reportUi';
import { toCSV, csvNum, downloadText } from '../lib/csv';

interface Props { token: string; }

const HORIZONS = [12, 24, 36];

// linhas da DRE gerencial (mesma estrutura de computeDre / ACCOUNTING_GROUPS)
const DRE_LINES: { label: string; key: string; strong?: boolean; neg?: boolean; accent?: boolean; pctKey?: string; hideZero?: boolean }[] = [
  { label: 'Receita bruta', key: 'receitaBruta', strong: true },
  { label: '(−) Impostos sobre vendas', key: 'deducoes', neg: true },
  { label: '(=) Receita líquida', key: 'receitaLiquida', strong: true },
  { label: '(−) Custo (CMV / CSP)', key: 'cmv', neg: true },
  { label: '(=) Lucro bruto', key: 'lucroBruto', strong: true, pctKey: 'margemBrutaPct' },
  { label: '(−) Despesas operacionais', key: 'despesasOperacionais', neg: true },
  { label: '(+) Outras receitas operacionais', key: 'outrasRecOp', hideZero: true },
  { label: '(=) Resultado operacional (EBITDA)', key: 'resultadoOperacional', strong: true, pctKey: 'margemOperacionalPct' },
  { label: '(+/−) Resultado financeiro', key: 'resultadoFinanceiro' },
  { label: '(+/−) Resultado não operacional', key: 'resultadoNaoOperacional', hideZero: true },
  { label: '(−) IRPJ / CSLL', key: 'irpjCsll', neg: true, hideZero: true },
  { label: '(=) Lucro líquido', key: 'lucroLiquido', strong: true, accent: true, pctKey: 'margemLiquidaPct' },
];

const FC_LINES: { label: string; get: (f: any) => number; strong?: boolean }[] = [
  { label: 'Geração de caixa operacional', get: f => f.geracaoOperacional },
  { label: '(+) Aportes de sócios', get: f => f.aportes },
  { label: '(+) Captação de empréstimo', get: f => f.captacaoEmprestimo },
  { label: '(−) Investimentos', get: f => -f.investimentos },
  { label: '(−) Amortização de empréstimo', get: f => -f.amortizacao },
  { label: '(−) Distribuição de lucros', get: f => -f.distribuicaoLucros },
  { label: '(±) Variação da NCG', get: f => -f.variacaoNcg },
  { label: '(=) Fluxo de caixa líquido', get: f => f.fluxoLiquido, strong: true },
];

const KIND_LABEL: Record<string, string> = { base: 'Base', otimista: 'Otimista', pessimista: 'Pessimista', custom: 'Personalizado' };

const PlanningModel: React.FC<Props> = ({ token }) => {
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  const [scenarios, setScenarios] = useState<any[]>([]);
  const [source, setSource] = useState<'atual' | number>('atual');
  const [horizon, setHorizon] = useState(24);
  const [gran, setGran] = useState<'auto' | 'mensal' | 'anual'>('auto');
  const [data, setData] = useState<any>(null);
  const [cmp, setCmp] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/planning/scenarios', { headers })
      .then(r => (r.ok ? r.json() : { scenarios: [] }))
      .then(j => setScenarios(j.scenarios || []))
      .catch(() => setScenarios([]));
  }, [headers]);

  const assumptionsForSource = useCallback(() => {
    if (source === 'atual') return {};
    return scenarios.find(s => s.id === source)?.assumptions || {};
  }, [source, scenarios]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/planning/scenarios/preview', {
      method: 'POST', headers,
      body: JSON.stringify({ assumptions: assumptionsForSource(), horizonMonths: horizon }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [headers, assumptionsForSource, horizon]);

  useEffect(() => {
    fetch(`/api/planning/scenarios/compare?horizon=${horizon}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(j => setCmp(j?.scenarios || []))
      .catch(() => setCmp([]));
  }, [headers, horizon]);

  // agrupamento das colunas (mensal ≤12m, anual >12m — ou forçado)
  const cols = useMemo(() => {
    if (!data?.serieMensal) return [];
    const g = gran === 'auto' ? (horizon > 12 ? 'anual' : 'mensal') : gran;
    if (g === 'mensal') return data.serieMensal.map((s: any, i: number) => ({ label: fmtMonthKey(s.mes), idx: [i] }));
    const out: { label: string; idx: number[] }[] = [];
    for (let i = 0; i < data.serieMensal.length; i += 12) {
      const idx = [];
      for (let k = i; k < Math.min(i + 12, data.serieMensal.length); k++) idx.push(k);
      out.push({ label: `Ano ${i / 12 + 1}`, idx });
    }
    return out;
  }, [data, gran, horizon]);

  const sumDre = (idx: number[], key: string) => idx.reduce((a, i) => a + (data.serieMensal[i].dre[key] || 0), 0);
  const dreCell = (idx: number[], line: any): number => {
    const v = sumDre(idx, line.key);
    return line.neg ? -v : v;
  };
  const drePct = (idx: number[], pctKey?: string): number | null => {
    if (!pctKey) return null;
    const rl = sumDre(idx, 'receitaLiquida');
    if (rl <= 0) return null;
    const map: Record<string, string> = { margemBrutaPct: 'lucroBruto', margemOperacionalPct: 'resultadoOperacional', margemLiquidaPct: 'lucroLiquido' };
    return (sumDre(idx, map[pctKey]) / rl) * 100;
  };
  const fcSum = (idx: number[], get: (f: any) => number) => idx.reduce((a, i) => a + get(data.fluxoCaixa.serie[i]), 0);

  const exportCSV = () => {
    const s = data.serieMensal;
    const months = s.map((x: any) => fmtMonthKey(x.mes));
    const rows: any[][] = [];
    rows.push(['MODELO FINANCEIRO — ' + (source === 'atual' ? 'Situação atual' : scenarios.find(sc => sc.id === source)?.name || '')]);
    rows.push([`Horizonte: ${horizon} meses`, `Base: ${data.meta?.baseMetodo || ''}`, 'Regime: caixa']);
    rows.push([]);
    rows.push(['DRE PROJETADA', ...months, 'Total']);
    for (const line of DRE_LINES) {
      if (line.hideZero && s.every((x: any) => Math.abs(x.dre[line.key] || 0) < 0.01)) continue;
      const vals = s.map((x: any) => (line.neg ? -(x.dre[line.key] || 0) : (x.dre[line.key] || 0)));
      rows.push([line.label, ...vals.map(csvNum), csvNum(vals.reduce((a: number, b: number) => a + b, 0))]);
    }
    rows.push([]);
    rows.push(['FLUXO DE CAIXA PROJETADO', ...months, 'Total']);
    for (const line of FC_LINES) {
      const vals = data.fluxoCaixa.serie.map(line.get);
      rows.push([line.label, ...vals.map(csvNum), csvNum(vals.reduce((a: number, b: number) => a + b, 0))]);
    }
    rows.push(['Caixa acumulado', ...data.fluxoCaixa.serie.map((f: any) => csvNum(f.caixaFim)), csvNum(data.indicadores.caixaFinal)]);
    rows.push([]);
    rows.push(['CAPITAL DE GIRO', ...months, '']);
    rows.push(['Caixa', ...data.capitalGiroSerie.map((c: any) => csvNum(c.caixa))]);
    rows.push(['NCG', ...data.capitalGiroSerie.map((c: any) => csvNum(c.ncg))]);
    rows.push(['Capital de giro líquido', ...data.capitalGiroSerie.map((c: any) => csvNum(c.cgl))]);
    rows.push([]);
    rows.push(['INDICADORES (horizonte)']);
    const ind = data.indicadores;
    rows.push(['Ponto de equilíbrio (período)', csvNum(ind.pontoEquilibrio)]);
    rows.push(['Ponto de equilíbrio (mês)', csvNum(ind.pontoEquilibrioMensal)]);
    rows.push(['Margem de segurança %', csvNum(ind.margemSegurancaPct)]);
    rows.push(['Margem de contribuição', csvNum(ind.margemContribuicao)]);
    rows.push(['Margem de contribuição %', csvNum(ind.margemContribuicaoPct)]);
    rows.push(['Grau de alavancagem operacional', csvNum(ind.grauAlavancagem)]);
    rows.push(['Custos e despesas fixas', csvNum(ind.custosDespFixas)]);
    rows.push(['Custos e despesas variáveis', csvNum(ind.custosDespVariaveis)]);
    rows.push(['Caixa inicial', csvNum(ind.caixaInicial)]);
    rows.push(['Caixa final', csvNum(ind.caixaFinal)]);
    rows.push(['Menor caixa no período', csvNum(ind.menorCaixaProjetado)]);
    rows.push(['Necessidade máxima de caixa', csvNum(ind.necessidadeMaximaCaixa)]);
    downloadText(`modelo-financeiro-${horizon}m.csv`, toCSV(rows));
  };

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  if (!data) return <p className="text-faint text-sm text-center py-16">Sem histórico suficiente para modelar.</p>;

  const ind = data.indicadores;
  const r = data.resumo;
  const caixaChart = data.fluxoCaixa.serie.map((f: any) => ({ mes: fmtMonthKey(f.mes), Caixa: f.caixaFim }));
  const temNecessidade = ind.necessidadeMaximaCaixa > 0;

  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted flex items-center gap-1.5">
          Premissas:
          <select value={String(source)} onChange={e => setSource(e.target.value === 'atual' ? 'atual' : Number(e.target.value))}
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm outline-none focus:border-brand">
            <option value="atual">Situação atual (média histórica)</option>
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
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">Colunas</span>
          {(['auto', 'mensal', 'anual'] as const).map(g => (
            <button key={g} onClick={() => setGran(g)}
              className={`px-2 py-1 rounded-md text-xs font-medium capitalize ${gran === g ? 'bg-brand text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}>{g}</button>
          ))}
        </div>
        <button onClick={exportCSV} className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-strong">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {data.aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 text-warn px-3 py-2 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{data.aviso}</span>
        </div>
      )}

      {/* resumo executivo */}
      <div>
        <h2 className="text-sm font-bold text-ink flex items-center gap-2 mb-3"><LayoutGrid size={15} className="text-brand" /> Resumo executivo — {horizon} meses</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Receita projetada" value={brl(r.receita)} tone="ok" hint={`média ${brlShort(r.mediaMensalReceita)}/mês`} />
          <Stat label="Lucro líquido projetado" value={brl(r.lucroLiquido)} tone={r.lucroLiquido >= 0 ? 'ok' : 'danger'} hint={`margem ${pctTxt(r.margemLiquidaPct)}`} />
          <Stat label="Resultado operacional (EBITDA)" value={brl(r.resultadoOperacional)} tone={r.resultadoOperacional >= 0 ? 'ok' : 'danger'} />
          <Stat label="Caixa final projetado" value={brl(ind.caixaFinal)} tone={ind.caixaFinal >= 0 ? 'ink' : 'danger'} hint={`inicial ${brlShort(ind.caixaInicial)}`} />
          <Stat label="Ponto de equilíbrio" value={ind.pontoEquilibrio ? brl(ind.pontoEquilibrio) : '—'} tone="muted" hint={ind.pontoEquilibrioMensal ? `${brlShort(ind.pontoEquilibrioMensal)}/mês` : ''} />
          <Stat label="Margem de segurança" value={pctTxt(ind.margemSegurancaPct)} tone={(ind.margemSegurancaPct ?? -1) >= 0 ? 'ok' : 'danger'} />
          <Stat label="Necessidade máx. de caixa" value={temNecessidade ? brl(ind.necessidadeMaximaCaixa) : 'R$ 0'}
            tone={temNecessidade ? 'danger' : 'ok'} hint={temNecessidade ? `caixa negativo em ${fmtMonthKey(ind.mesMenorCaixa)}` : 'caixa positivo no horizonte'} />
          <Stat label="NCG projetada" value={ind.ncgFinal === null ? '—' : brl(ind.ncgFinal)} tone="muted"
            hint={ind.ncgMetodo === 'premissas' ? 'PMR/PMP das premissas' : 'informe PMR e PMP'} />
        </div>
      </div>

      {temNecessidade && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 text-danger px-3 py-2.5 text-sm">
          <TrendingDown size={16} className="shrink-0 mt-0.5" />
          <span>O caixa projetado fica <strong>negativo</strong> — chega a <strong>{brl(ind.menorCaixaProjetado)}</strong> em {fmtMonthKey(ind.mesMenorCaixa)}.
            É preciso cobrir <strong>{brl(ind.necessidadeMaximaCaixa)}</strong> com capital de giro (aporte, empréstimo ou antecipação de recebíveis).</span>
        </div>
      )}

      {/* DRE projetada */}
      <ModelTable title="DRE projetada" subtitle="Estrutura gerencial (regime de caixa).">
        <thead>
          <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
            <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-sunken z-10">Linha</th>
            {cols.map(c => <th key={c.label} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{c.label}</th>)}
            <th className="text-right font-semibold px-3 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {DRE_LINES.map(line => {
            if (line.hideZero && data.serieMensal.every((x: any) => Math.abs(x.dre[line.key] || 0) < 0.01)) return null;
            const totalIdx = data.serieMensal.map((_: any, i: number) => i);
            const total = dreCell(totalIdx, line);
            return (
              <tr key={line.key} className={`border-t border-line ${line.accent ? 'bg-sunken' : line.strong ? 'bg-sunken/40' : ''}`}>
                <td className={`px-3 py-1.5 sticky left-0 z-10 ${line.accent ? 'bg-sunken' : line.strong ? 'bg-sunken/40' : 'bg-surface'} ${line.strong ? 'font-semibold text-ink' : 'text-muted'} text-xs`}>{line.label}</td>
                {cols.map(c => {
                  const v = dreCell(c.idx, line);
                  const p = drePct(c.idx, line.pctKey);
                  return (
                    <td key={c.label} className={`px-2 py-1.5 text-right font-mono tabular-nums text-xs ${v < 0 ? 'text-danger' : 'text-ink'} ${line.strong ? 'font-semibold' : ''}`}>
                      {brlShort(v)}{p != null && <span className="block text-[10px] text-faint font-normal">{p.toFixed(1)}%</span>}
                    </td>
                  );
                })}
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-xs ${total < 0 ? 'text-danger' : 'text-ink'} font-semibold`}>{brlShort(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </ModelTable>

      {/* Fluxo de caixa projetado */}
      <ModelTable title="Fluxo de caixa projetado" subtitle="Método direto: resultado do período + itens patrimoniais − variação da NCG.">
        <thead>
          <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
            <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-sunken z-10">Linha</th>
            {cols.map(c => <th key={c.label} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{c.label}</th>)}
            <th className="text-right font-semibold px-3 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {FC_LINES.map(line => {
            const totalIdx = data.fluxoCaixa.serie.map((_: any, i: number) => i);
            return (
              <tr key={line.label} className={`border-t border-line ${line.strong ? 'bg-sunken/40' : ''}`}>
                <td className={`px-3 py-1.5 sticky left-0 z-10 ${line.strong ? 'bg-sunken/40 font-semibold text-ink' : 'bg-surface text-muted'} text-xs`}>{line.label}</td>
                {cols.map(c => {
                  const v = fcSum(c.idx, line.get);
                  return <td key={c.label} className={`px-2 py-1.5 text-right font-mono tabular-nums text-xs ${v < 0 ? 'text-danger' : 'text-ink'} ${line.strong ? 'font-semibold' : ''}`}>{brlShort(v)}</td>;
                })}
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-xs font-semibold ${fcSum(totalIdx, line.get) < 0 ? 'text-danger' : 'text-ink'}`}>{brlShort(fcSum(totalIdx, line.get))}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-line bg-sunken font-bold">
            <td className="px-3 py-2 sticky left-0 bg-sunken z-10 text-ink text-xs">Caixa acumulado</td>
            {cols.map(c => {
              const last = c.idx[c.idx.length - 1];
              const v = data.fluxoCaixa.serie[last].caixaFim;
              return <td key={c.label} className={`px-2 py-2 text-right font-mono tabular-nums text-xs ${v < 0 ? 'text-danger' : 'text-ink'}`}>{brlShort(v)}</td>;
            })}
            <td className={`px-3 py-2 text-right font-mono tabular-nums text-xs ${ind.caixaFinal < 0 ? 'text-danger' : 'text-ink'}`}>{brlShort(ind.caixaFinal)}</td>
          </tr>
        </tbody>
      </ModelTable>

      {/* Capital de giro + necessidade de caixa */}
      <Card>
        <h3 className="text-ink font-bold mb-1">Capital de giro e necessidade de caixa</h3>
        <p className="text-muted text-xs mb-4">Caixa projetado mês a mês; a linha em zero marca o limite. Necessidade de capital de giro (NCG) só quando PMR e PMP estão nas premissas.</p>
        <div className="h-56 w-full overflow-x-auto">
          <div className="min-w-[560px] h-full">
            <ResponsiveContainer>
              <ComposedChart data={caixaChart} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="mdl-caixa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                <ReferenceLine y={0} stroke="var(--color-danger)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="Caixa" stroke="var(--color-brand)" fill="url(#mdl-caixa)" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        {ind.ncgFinal !== null && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted text-xs">NCG ao fim do horizonte</p><p className="font-mono font-bold text-ink">{brl(ind.ncgFinal)}</p></div>
            <div><p className="text-muted text-xs">Capital de giro líquido</p><p className="font-mono font-bold text-ink">{brl(ind.cglFinal)}</p></div>
            <div><p className="text-muted text-xs">Saldo em tesouraria (= caixa)</p><p className="font-mono font-bold text-ink">{brl(ind.caixaFinal)}</p></div>
          </div>
        )}
      </Card>

      {/* Indicadores */}
      <div>
        <h2 className="text-sm font-bold text-ink mb-3">Indicadores do modelo</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Ponto de equilíbrio (período)" value={ind.pontoEquilibrio ? brl(ind.pontoEquilibrio) : '—'} tone="muted" />
          <Stat label="Ponto de equilíbrio (mês)" value={ind.pontoEquilibrioMensal ? brl(ind.pontoEquilibrioMensal) : '—'} tone="muted" />
          <Stat label="Margem de contribuição" value={brl(ind.margemContribuicao)} tone="ink" hint={pctTxt(ind.margemContribuicaoPct)} />
          <Stat label="Grau de alavancagem operacional" value={ind.grauAlavancagem === null ? '—' : `${ind.grauAlavancagem.toFixed(2)}×`} tone="muted" hint="variação % do lucro / variação % da receita" />
          <Stat label="Custos e despesas fixas" value={brl(ind.custosDespFixas)} tone="danger" />
          <Stat label="Custos e despesas variáveis" value={brl(ind.custosDespVariaveis)} tone="danger" />
          <Stat label="Menor caixa no período" value={brl(ind.menorCaixaProjetado)} tone={ind.menorCaixaProjetado >= 0 ? 'ink' : 'danger'} />
          <Stat label="Margem operacional" value={pctTxt(data.dre.margemOperacionalPct)} tone={data.dre.margemOperacionalPct >= 0 ? 'ok' : 'danger'} />
        </div>
      </div>

      {/* Cenários */}
      {cmp && cmp.length > 0 && (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><h3 className="text-ink font-bold text-sm">Este modelo × cenários salvos ({horizon}m)</h3></div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                  <th className="text-left font-semibold px-4 py-2">Indicador</th>
                  <th className="text-right font-semibold px-3 py-2">Este modelo</th>
                  {cmp.map(s => <th key={s.id} className="text-right font-semibold px-3 py-2 whitespace-nowrap">{s.name}<span className="ml-1 text-[9px] text-faint">({KIND_LABEL[s.kind] || 'Pers.'})</span></th>)}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Receita', (x: any) => x.receita ?? x.resumo?.receita, true],
                  ['Lucro líquido', (x: any) => x.lucroLiquido ?? x.resumo?.lucroLiquido, true],
                  ['Margem líquida', (x: any) => x.margemLiquidaPct ?? x.resumo?.margemLiquidaPct, false],
                  ['Ponto de equilíbrio', (x: any) => x.pontoEquilibrio ?? x.indicadores?.pontoEquilibrio, true],
                  ['Caixa final', (x: any) => x.caixaFinal ?? x.indicadores?.caixaFinal, true],
                ] as [string, (x: any) => number, boolean][]).map(([label, get, money]) => (
                  <tr key={label} className="border-t border-line">
                    <td className="px-4 py-2 text-muted">{label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink font-semibold">{money ? brl(get(data)) : pctTxt(get(data))}</td>
                    {cmp.map(s => <td key={s.id} className="px-3 py-2 text-right font-mono tabular-nums text-faint">{money ? brl(get(s)) : pctTxt(get(s))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MethodologyNote items={[
        ['Base', (data.meta?.baseMetodo || 'média histórica') + '. As premissas do cenário escolhido ajustam a partir daí.'],
        ['Ponto de equilíbrio', 'Custos e despesas fixas ÷ (margem de contribuição %). Margem de contribuição = receita líquida − custos e despesas variáveis. Mesma fórmula da DRE gerencial (Relatórios).'],
        ['Regime', 'Caixa. A DRE projetada já é de caixa; o fluxo de caixa projetado soma os itens patrimoniais (aportes, empréstimo, investimentos, amortização, distribuição) e desconta a variação da necessidade de capital de giro.'],
        ...(data.meta?.notas || []).slice(2).map((n: string, i: number): [string, string] => [`Premissa ${i + 1}`, n]),
      ]} />
    </div>
  );
};

const ModelTable: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-surface rounded-xl border border-line overflow-hidden">
    <div className="px-4 py-3 border-b border-line">
      <h3 className="text-ink font-bold text-sm">{title}</h3>
      <p className="text-muted text-xs mt-0.5">{subtitle}</p>
    </div>
    <div className="overflow-x-auto custom-scroll">
      <table className="w-full text-sm min-w-[640px]">{children}</table>
    </div>
  </div>
);

export default PlanningModel;
