import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Wand2, Save, Trash2, Plus, RotateCcw } from 'lucide-react';
import { Category } from '../types';
import { brl, brlShort, CHART_AXIS, CHART_TOOLTIP, Card, MONTHS_SHORT } from './reportUi';
import { INCOME_GROUPS, EXPENSE_GROUPS } from './accountingGroups';

interface Props { token: string; categories: Category[]; }

const M = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const numOr0 = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };

type Grid = Record<string, Record<number, string>>;

const PlanningBudget: React.FC<Props> = ({ token, categories }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [budget, setBudget] = useState<any>(null);
  const [realized, setRealized] = useState<Record<string, Record<number, number>>>({});
  const [grid, setGrid] = useState<Grid>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // gerador
  const [gMethod, setGMethod] = useState<'history_avg' | 'prev_year' | 'copy'>('prev_year');
  const [gGrowth, setGGrowth] = useState('8');
  const [gFromYear, setGFromYear] = useState(String(new Date().getFullYear() - 1));
  const [gScope, setGScope] = useState<'all' | 'receitas' | 'despesas'>('all');

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  const gridFromItems = useCallback((items: any[]) => {
    const g: Grid = {};
    for (const it of items) {
      if (!it.categoryId) continue;
      (g[it.categoryId] ||= {})[it.month] = String(it.amount);
    }
    return g;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`/api/planning/budgets?year=${year}`, { headers });
      const j = r.ok ? await r.json() : null;
      setBudget(j?.budget || null);
      setRealized(j?.realized || {});
      setGrid(gridFromItems(j?.items || []));
      setDirty(false);
    } finally { setLoading(false); }
  }, [year, headers, gridFromItems]);

  useEffect(() => { load(); }, [load]);

  const createBudget = async () => {
    const r = await fetch('/api/planning/budgets', { method: 'POST', headers, body: JSON.stringify({ year }) });
    if (r.ok) load();
  };

  const setCell = (catId: number, month: number, val: string) => {
    setGrid(g => ({ ...g, [catId]: { ...(g[catId] || {}), [month]: val } }));
    setDirty(true);
  };

  const clearLine = async (catId: number) => {
    if (!budget) return;
    setGrid(g => { const n = { ...g }; delete n[catId]; return n; });
    await fetch(`/api/planning/budgets/${budget.id}/items`, { method: 'DELETE', headers, body: JSON.stringify({ categoryId: catId }) });
    setDirty(true);
  };

  const save = async () => {
    if (!budget) return;
    setSaving(true); setMsg(null);
    const items: any[] = [];
    for (const [catId, months] of Object.entries(grid)) {
      const cat = catById[catId];
      if (!cat) continue;
      for (const mo of M) {
        const raw = months[mo];
        if (raw === undefined || raw === '') continue;
        items.push({ month: mo, categoryId: Number(catId), kind: cat.type, groupType: cat.groupType || null, amount: numOr0(raw) });
      }
    }
    try {
      const r = await fetch(`/api/planning/budgets/${budget.id}/items`, { method: 'PUT', headers, body: JSON.stringify({ items }) });
      if (!r.ok) { setMsg('Erro ao salvar.'); return; }
      const j = await r.json();
      setGrid(gridFromItems(j.items));
      setDirty(false);
      setMsg('Orçamento salvo.');
      setTimeout(() => setMsg(null), 2500);
    } finally { setSaving(false); }
  };

  const generate = async () => {
    if (!budget) return;
    setSaving(true); setMsg(null);
    try {
      const body: any = { method: gMethod, growthPct: Number(gGrowth) || 0, scope: gScope, months: 12 };
      if (gMethod === 'copy') body.fromYear = Number(gFromYear);
      const r = await fetch(`/api/planning/budgets/${budget.id}/generate`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); setMsg(e.error || 'Erro ao gerar.'); return; }
      const j = await r.json();
      setGrid(gridFromItems(j.items));
      setDirty(false);
      setMsg(`Gerado: ${j.generated} valores. Revise e ajuste antes de usar.`);
    } finally { setSaving(false); }
  };

  // ---- agrupamento das categorias por grupo do DRE ----
  const groups = useMemo(() => {
    const order = [...INCOME_GROUPS, ...EXPENSE_GROUPS];
    const seen = new Set<string>();
    const rows = order
      .filter(g => !(seen.has(g.id) && seen.add(g.id)))
      .map(g => ({
        ...g,
        cats: categories.filter(c => (c.groupType || (c.type === 'receita' ? 'outras_receitas' : 'despesa_operacional')) === g.id && c.type === g.kind),
      }))
      .filter(g => g.cats.length > 0);
    return rows;
  }, [categories]);

  // ---- totais por mês ----
  const totals = useMemo(() => {
    const rec: number[] = Array(13).fill(0), desp: number[] = Array(13).fill(0);
    for (const [catId, months] of Object.entries(grid)) {
      const cat = catById[catId];
      if (!cat) continue;
      const bucket = cat.type === 'receita' ? rec : desp;
      for (const mo of M) bucket[mo] += numOr0(months[mo] || '');
    }
    return { rec, desp };
  }, [grid, catById]);

  const chartData = M.map(mo => ({
    mes: MONTHS_SHORT[mo - 1],
    Receita: totals.rec[mo], Despesa: totals.desp[mo], Resultado: totals.rec[mo] - totals.desp[mo],
  }));
  const anoRec = totals.rec.reduce((a, b) => a + b, 0);
  const anoDesp = totals.desp.reduce((a, b) => a + b, 0);

  const realizedTotal = (catId: number) => M.reduce((s, mo) => s + (realized[catId]?.[mo] || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Ano</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="bg-surface border border-line rounded-lg px-3 py-1.5 text-ink text-sm">
            {[year - 2, year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {budget && (
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-muted">{msg}</span>}
            <button onClick={load} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-line text-muted hover:text-ink">
              <RotateCcw size={14} /> Recarregar
            </button>
            <button onClick={save} disabled={saving || !dirty}
              className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-medium ${dirty ? 'bg-brand text-white hover:bg-brand-strong' : 'bg-sunken text-faint'}`}>
              <Save size={14} /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      {!budget ? (
        <div className="bg-surface rounded-xl border border-dashed border-line p-10 text-center max-w-lg mx-auto">
          <h3 className="text-ink font-bold text-lg mb-2">Sem orçamento para {year}</h3>
          <p className="text-muted text-sm mb-5">Crie o orçamento do ano e preencha por categoria — manualmente, a partir do histórico ou do ano anterior.</p>
          <button onClick={createBudget} className="inline-flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-lg font-medium hover:bg-brand-strong">
            <Plus size={16} /> Criar orçamento {year}
          </button>
        </div>
      ) : (
        <>
          {/* Gerador */}
          <Card className="!p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink mr-2"><Wand2 size={16} className="text-brand" /> Preencher automaticamente</div>
              <label className="text-xs text-muted flex flex-col gap-1">
                Método
                <select value={gMethod} onChange={e => setGMethod(e.target.value as any)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink">
                  <option value="prev_year">Realizado do ano anterior</option>
                  <option value="history_avg">Média dos últimos 12 meses</option>
                  <option value="copy">Copiar de outro ano</option>
                </select>
              </label>
              {gMethod === 'copy' && (
                <label className="text-xs text-muted flex flex-col gap-1">
                  Ano de origem
                  <input value={gFromYear} onChange={e => setGFromYear(e.target.value)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink w-20" />
                </label>
              )}
              <label className="text-xs text-muted flex flex-col gap-1">
                Ajuste %
                <input value={gGrowth} onChange={e => setGGrowth(e.target.value)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink w-20" placeholder="ex: 8 ou -5" />
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">
                Aplicar a
                <select value={gScope} onChange={e => setGScope(e.target.value as any)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink">
                  <option value="all">Tudo</option>
                  <option value="receitas">Só receitas</option>
                  <option value="despesas">Só despesas</option>
                </select>
              </label>
              <button onClick={generate} disabled={saving}
                className="text-sm px-4 py-1.5 rounded-lg font-medium bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20">
                Gerar
              </button>
            </div>
            <p className="text-[11px] text-faint mt-2">Substitui os valores do escopo escolhido. Ex.: "Realizado do ano anterior + 8%" projeta cada mês pelo mesmo mês de {year - 1}.</p>
          </Card>

          {/* Resumo do ano */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl border border-line p-4">
              <p className="text-muted text-xs uppercase tracking-wide">Receita orçada (ano)</p>
              <p className="text-lg font-bold font-mono text-ok mt-1">{brl(anoRec)}</p>
            </div>
            <div className="bg-surface rounded-xl border border-line p-4">
              <p className="text-muted text-xs uppercase tracking-wide">Despesa orçada (ano)</p>
              <p className="text-lg font-bold font-mono text-danger mt-1">{brl(anoDesp)}</p>
            </div>
            <div className="bg-surface rounded-xl border border-line p-4">
              <p className="text-muted text-xs uppercase tracking-wide">Resultado orçado</p>
              <p className={`text-lg font-bold font-mono mt-1 ${anoRec - anoDesp >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(anoRec - anoDesp)}</p>
            </div>
          </div>

          {/* Grade */}
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="overflow-x-auto custom-scroll">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-sunken text-faint text-[11px] uppercase tracking-wide">
                    <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-sunken z-10 min-w-[200px]">Categoria</th>
                    {M.map(mo => <th key={mo} className="text-right font-semibold px-2 py-2">{MONTHS_SHORT[mo - 1]}</th>)}
                    <th className="text-right font-semibold px-3 py-2">Total</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => {
                    const gRec = g.kind === 'receita';
                    return (
                      <React.Fragment key={g.id}>
                        <tr>
                          <td colSpan={15} className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${gRec ? 'text-ok' : 'text-danger'} bg-sunken/40`}>{g.label}</td>
                        </tr>
                        {g.cats.map(cat => {
                          const rowTotal = M.reduce((s, mo) => s + numOr0(grid[cat.id]?.[mo] || ''), 0);
                          const realTot = realizedTotal(cat.id);
                          return (
                            <tr key={cat.id} className="border-t border-line hover:bg-sunken/30">
                              <td className="px-3 py-1.5 sticky left-0 bg-surface z-10">
                                <div className="text-ink truncate max-w-[190px]" title={cat.name}>{cat.name}</div>
                                {realTot > 0 && <div className="text-[10px] text-faint">realizado {year}: {brlShort(realTot)}</div>}
                              </td>
                              {M.map(mo => (
                                <td key={mo} className="px-1 py-1">
                                  <input
                                    inputMode="decimal"
                                    value={grid[cat.id]?.[mo] ?? ''}
                                    onChange={e => setCell(cat.id, mo, e.target.value)}
                                    placeholder={realized[cat.id]?.[mo] ? String(Math.round(realized[cat.id][mo])) : '0'}
                                    className="w-[68px] text-right bg-transparent border border-transparent hover:border-line focus:border-brand focus:bg-ground rounded px-1.5 py-1 text-ink outline-none tabular-nums"
                                  />
                                </td>
                              ))}
                              <td className="px-3 py-1.5 text-right font-mono text-ink tabular-nums">{rowTotal ? brlShort(rowTotal) : '—'}</td>
                              <td className="px-2 py-1.5 text-center">
                                {rowTotal > 0 && (
                                  <button onClick={() => clearLine(cat.id)} title="Zerar linha" className="text-faint hover:text-danger">
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                  <tr className="border-t-2 border-line bg-sunken/50 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-sunken z-10 text-ok">Total Receitas</td>
                    {M.map(mo => <td key={mo} className="px-2 py-2 text-right font-mono text-ok tabular-nums">{totals.rec[mo] ? brlShort(totals.rec[mo]) : '—'}</td>)}
                    <td className="px-3 py-2 text-right font-mono text-ok">{brlShort(anoRec)}</td><td></td>
                  </tr>
                  <tr className="bg-sunken/50 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-sunken z-10 text-danger">Total Despesas</td>
                    {M.map(mo => <td key={mo} className="px-2 py-2 text-right font-mono text-danger tabular-nums">{totals.desp[mo] ? brlShort(totals.desp[mo]) : '—'}</td>)}
                    <td className="px-3 py-2 text-right font-mono text-danger">{brlShort(anoDesp)}</td><td></td>
                  </tr>
                  <tr className="bg-sunken font-bold">
                    <td className="px-3 py-2 sticky left-0 bg-sunken z-10 text-ink">Resultado</td>
                    {M.map(mo => { const v = totals.rec[mo] - totals.desp[mo]; return <td key={mo} className={`px-2 py-2 text-right font-mono tabular-nums ${v >= 0 ? 'text-ink' : 'text-danger'}`}>{brlShort(v)}</td>; })}
                    <td className={`px-3 py-2 text-right font-mono ${anoRec - anoDesp >= 0 ? 'text-ink' : 'text-danger'}`}>{brlShort(anoRec - anoDesp)}</td><td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico do orçamento */}
          <Card>
            <h3 className="text-ink font-bold mb-3">Orçamento por mês</h3>
            <div className="h-64 w-full overflow-x-auto">
              <div className="min-w-[520px] h-full">
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="mes" tick={CHART_AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={CHART_AXIS} axisLine={false} tickLine={false} tickFormatter={brlShort} width={64} />
                    <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => brl(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Receita" fill="var(--color-ok)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Despesa" fill="var(--color-danger)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Resultado" fill="var(--color-brand)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default PlanningBudget;
