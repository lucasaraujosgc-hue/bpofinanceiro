import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, TransactionType, Bank, Category, CategoryType, CreditCard } from '../types';
import { Search, Plus, Trash2, Check, X, ChevronLeft, ChevronRight, Edit2, CheckSquare, Square, ListChecks, Save, CalendarSearch, CreditCard as CreditCardIcon, Download, Replace } from 'lucide-react';
import { fmtDateBR } from '../lib/date';
import { toCSV, downloadText, csvNum } from '../lib/csv';
import CategoryTag from './CategoryTag';

interface TransactionsProps {
  userId: number;
  transactions: Transaction[];
  banks: Bank[];
  creditCards: CreditCard[];
  categories: Category[];
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onEditTransaction: (id: number, t: Omit<Transaction, 'id'>) => void;
  onDeleteTransaction: (id: number) => void;
  onReconcile: (id: number) => void;
  onBatch: (ids: number[], set: any) => Promise<{ updated?: number } | any>;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type ValueOp = 'any' | 'eq' | 'gte' | 'lte' | 'between';

const Transactions: React.FC<TransactionsProps> = ({
  userId, transactions, banks, creditCards, categories, onAddTransaction, onEditTransaction, onDeleteTransaction, onReconcile, onBatch
}) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedBankId, setSelectedBankId] = useState<number | 'all'>('all');

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all' | 'none'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ---- edição em lote (cross-mês) ----
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [applying, setApplying] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');
  const [bf, setBf] = useState({
    q: '', type: 'all', cat: 'all' as number | 'all' | 'none', bank: 'all' as number | 'all',
    status: 'all', op: 'any' as ValueOp, va: '', vb: '', from: '', to: '',
  });
  // inputs das ações
  const [actCat, setActCat] = useState(0);
  const [actDescMode, setActDescMode] = useState<'set' | 'replace'>('set');
  const [actDesc, setActDesc] = useState('');
  const [actFrom, setActFrom] = useState('');
  const [actTo, setActTo] = useState('');
  const [actDate, setActDate] = useState('');
  const [actValue, setActValue] = useState('');

  const activeBanks = banks.filter(b => b.active);
  const activeBankIds = activeBanks.map(b => b.id);
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const bankById = useMemo(() => Object.fromEntries(banks.map(b => [b.id, b])), [banks]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    value: '',
    type: TransactionType.DEBIT,
    bankId: activeBanks[0]?.id || 0,
    creditCardId: null as number | null,
    categoryId: 0,
  });

  useEffect(() => {
    if (isModalOpen && !editingId) {
       setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '', value: '', type: TransactionType.DEBIT,
        bankId: activeBanks[0]?.id || 0, creditCardId: null, categoryId: 0,
       });
    }
  }, [isModalOpen, editingId, banks]);

  const handleEditClick = (t: Transaction) => {
      setEditingId(t.id);
      setFormData({
          date: t.date, description: t.description, value: String(t.value), type: t.type,
          bankId: t.bankId, creditCardId: t.creditCardId || null, categoryId: t.categoryId || 0
      });
      setIsModalOpen(true);
  };

  const handlePrevMonth = () => selectedMonth === 0 ? (setSelectedMonth(11), setSelectedYear(y => y - 1)) : setSelectedMonth(m => m - 1);
  const handleNextMonth = () => selectedMonth === 11 ? (setSelectedMonth(0), setSelectedYear(y => y + 1)) : setSelectedMonth(m => m + 1);

  // ---- filtro do modo normal (mês selecionado) ----
  const filteredTransactions = transactions.filter(t => {
    if (!t.date) return false;
    if (t.bankId && !activeBankIds.includes(t.bankId)) return false;
    const [y, m] = t.date.split('-');
    if (!y || !m) return false;
    if (parseInt(y) !== selectedYear || parseInt(m) - 1 !== selectedMonth) return false;
    if (selectedBankId !== 'all' && t.bankId !== selectedBankId) return false;
    if (!t.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (categoryFilter === 'none' ? !!t.categoryId : (categoryFilter !== 'all' && t.categoryId !== categoryFilter)) return false;
    if (statusFilter !== 'all' && (statusFilter === 'reconciled' ? !t.reconciled : t.reconciled)) return false;
    return true;
  });

  const totalIncome = filteredTransactions.filter(t => t.type === TransactionType.CREDIT).reduce((a, b) => a + b.value, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === TransactionType.DEBIT).reduce((a, b) => a + b.value, 0);
  const periodBalance = totalIncome - totalExpense;

  // ---- filtro do modo lote (todo o histórico) ----
  const batchFiltered = useMemo(() => {
    const va = parseFloat(String(bf.va).replace(',', '.'));
    const vb = parseFloat(String(bf.vb).replace(',', '.'));
    return transactions.filter(t => {
      if (!t.date) return false;
      if (t.bankId && !activeBankIds.includes(t.bankId)) return false;
      if (bf.q && !t.description.toLowerCase().includes(bf.q.toLowerCase())) return false;
      if (bf.type !== 'all' && t.type !== bf.type) return false;
      if (bf.cat === 'none') { if (t.categoryId) return false; }
      else if (bf.cat !== 'all' && t.categoryId !== bf.cat) return false;
      if (bf.bank !== 'all' && t.bankId !== bf.bank) return false;
      if (bf.status !== 'all' && (bf.status === 'reconciled' ? !t.reconciled : t.reconciled)) return false;
      const d = t.date.slice(0, 10);
      if (bf.from && d < bf.from) return false;
      if (bf.to && d > bf.to) return false;
      if (bf.op === 'eq' && Number.isFinite(va) && Math.abs(t.value - va) > 0.005) return false;
      if (bf.op === 'gte' && Number.isFinite(va) && t.value < va) return false;
      if (bf.op === 'lte' && Number.isFinite(va) && t.value > va) return false;
      if (bf.op === 'between' && Number.isFinite(va) && Number.isFinite(vb) && (t.value < va || t.value > vb)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, bf, activeBankIds]);

  const displayed = isBatchMode ? batchFiltered : filteredTransactions;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      date: formData.date, description: formData.description,
      value: Math.abs(Number(formData.value)), type: formData.type,
      bankId: formData.bankId ? Number(formData.bankId) : null,
      creditCardId: formData.creditCardId, categoryId: Number(formData.categoryId),
      reconciled: editingId ? true : false
    };
    if (editingId) onEditTransaction(editingId, payload);
    else onAddTransaction({ ...payload, summary: '' });
    setIsModalOpen(false);
    setEditingId(null);
  };

  const availableCategories = categories.filter(c =>
    formData.type === TransactionType.CREDIT ? c.type === CategoryType.INCOME : c.type === CategoryType.EXPENSE
  );

  const enterBatch = () => { setIsBatchMode(true); setSelectedBatchIds([]); setBatchMsg(''); };
  const exitBatch = () => { setIsBatchMode(false); setSelectedBatchIds([]); };

  const toggleSelectAll = () => {
    setSelectedBatchIds(prev => prev.length === displayed.length ? [] : displayed.map(t => t.id));
  };
  const toggleSelectId = (id: number) =>
    setSelectedBatchIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const runBatch = async (set: any) => {
    if (selectedBatchIds.length === 0) return;
    setApplying(true); setBatchMsg('');
    try {
      const r = await onBatch(selectedBatchIds, set);
      const n = (r && typeof r.updated === 'number') ? r.updated : selectedBatchIds.length;
      setBatchMsg(`${n} lançamento(s) atualizado(s).`);
      setSelectedBatchIds([]);
    } catch (e: any) {
      setBatchMsg(e?.message || 'Erro ao aplicar.');
    } finally {
      setApplying(false);
      setTimeout(() => setBatchMsg(''), 4000);
    }
  };

  const exportCSV = () => {
    const rows: any[][] = [['Data', 'Descrição', 'Categoria', 'Banco', 'Tipo', 'Valor', 'Status']];
    for (const t of displayed) {
      rows.push([
        fmtDateBR(t.date), t.description,
        catById[t.categoryId || 0]?.name || 'Sem categoria',
        bankById[t.bankId]?.name || '',
        t.type === 'credito' ? 'Receita' : 'Despesa',
        csvNum(t.value),
        t.reconciled ? 'Conciliado' : 'Pendente',
      ]);
    }
    downloadText(`lancamentos-${isBatchMode ? 'lote' : `${MONTHS[selectedMonth].toLowerCase()}-${selectedYear}`}.csv`, toCSV(rows));
  };

  const quickChips = (
    <div className="flex flex-wrap gap-1.5">
      {isBatchMode ? (
        <>
          <button onClick={() => setBf(f => ({ ...f, cat: 'none' }))} className={`text-[11px] px-2 py-1 rounded-full border ${bf.cat === 'none' ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'}`}>Sem categoria</button>
          <button onClick={() => setBf(f => ({ ...f, status: 'pending' }))} className={`text-[11px] px-2 py-1 rounded-full border ${bf.status === 'pending' ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'}`}>Não conciliados</button>
          <button onClick={() => setBf(f => ({ ...f, op: 'gte', va: '1000' }))} className={`text-[11px] px-2 py-1 rounded-full border ${bf.op === 'gte' && bf.va === '1000' ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'}`}>≥ R$ 1.000</button>
          <button onClick={() => setBf({ q: '', type: 'all', cat: 'all', bank: 'all', status: 'all', op: 'any', va: '', vb: '', from: '', to: '' })} className="text-[11px] px-2 py-1 rounded-full border border-line text-faint hover:text-ink">Limpar</button>
        </>
      ) : (
        <>
          <button onClick={() => setCategoryFilter(categoryFilter === 'none' ? 'all' : 'none')} className={`text-[11px] px-2 py-1 rounded-full border ${categoryFilter === 'none' ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'}`}>Sem categoria</button>
          <button onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')} className={`text-[11px] px-2 py-1 rounded-full border ${statusFilter === 'pending' ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'}`}>Não conciliados</button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {isBatchMode ? 'Editar em lote — todo o histórico' : `Lançamentos — ${MONTHS[selectedMonth]}/${selectedYear}`}
        </h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="px-3 py-2 bg-sunken text-muted border border-line rounded-lg hover:text-ink font-medium flex items-center gap-2 text-sm">
            <Download size={16} /> CSV
          </button>
          {!isBatchMode ? (
            <>
              <button onClick={enterBatch} className="px-4 py-2 bg-sunken text-muted border border-line rounded-lg hover:text-ink font-medium flex items-center gap-2">
                <ListChecks size={18} /> Editar em Lote
              </button>
              <button onClick={() => { setEditingId(null); setIsModalOpen(true); }} className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium flex items-center gap-2 shadow-sm">
                <Plus size={18} /> Novo Lançamento
              </button>
            </>
          ) : (
            <button onClick={exitBatch} className="px-4 py-2 bg-sunken text-muted border border-line rounded-lg hover:text-ink font-medium flex items-center gap-2">
              <X size={18} /> Sair do lote
            </button>
          )}
        </div>
      </div>

      {/* ---------- MODO NORMAL: navegador de mês + resumo ---------- */}
      {!isBatchMode && (
        <>
          <div className="bg-surface p-4 rounded-xl border border-line shadow-sm flex flex-col md:flex-row items-end md:items-center gap-4">
            <div>
              <label className="text-xs font-semibold text-faint block mb-1">Ano</label>
              <div className="flex bg-surface rounded-lg p-1 border border-line">
                <button onClick={() => setSelectedYear(selectedYear - 1)} className="px-3 py-1 hover:bg-sunken rounded-md text-sm text-muted"><ChevronLeft size={16} /></button>
                <span className="px-4 py-1 font-semibold text-ink">{selectedYear}</span>
                <button onClick={() => setSelectedYear(selectedYear + 1)} className="px-3 py-1 hover:bg-sunken rounded-md text-sm text-muted"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-faint block mb-1">Filtrar por Banco</label>
              <select className="w-full px-3 py-1.5 bg-surface border border-line rounded-lg text-sm text-ink outline-none focus:border-brand" value={selectedBankId}
                onChange={e => setSelectedBankId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Todos os Bancos</option>
                {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
            <div className="flex flex-col lg:flex-row">
              <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-line p-4 flex items-center justify-between">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-sunken rounded-full text-brand"><ChevronLeft /></button>
                <div className="font-bold text-xl text-brand">{MONTHS[selectedMonth]}</div>
                <button onClick={handleNextMonth} className="p-2 hover:bg-sunken rounded-full text-brand"><ChevronRight /></button>
              </div>
              <div className="flex-1 grid grid-cols-3 divide-x divide-line">
                <div className="p-4 text-center"><div className="text-xs text-faint uppercase font-semibold mb-1">Receitas</div><div className="text-xl font-bold text-ok">{brl(totalIncome)}</div></div>
                <div className="p-4 text-center"><div className="text-xs text-faint uppercase font-semibold mb-1">Despesas</div><div className="text-xl font-bold text-danger">{brl(totalExpense)}</div></div>
                <div className="p-4 text-center bg-surface/50"><div className="text-xs text-faint uppercase font-semibold mb-1">Saldo do Mês</div><div className={`text-xl font-bold ${periodBalance >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(periodBalance)}</div></div>
              </div>
            </div>
          </div>

          <div className="bg-surface px-4 py-2 border border-line rounded-lg shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex-1 relative min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
              <input type="text" placeholder="Buscar por descrição..." className="w-full pl-10 pr-4 py-2 bg-transparent border-none outline-none text-sm text-ink placeholder-faint" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <select className="bg-transparent text-sm text-muted outline-none" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">Todos os tipos</option><option value={TransactionType.CREDIT}>Receitas</option><option value={TransactionType.DEBIT}>Despesas</option>
            </select>
            <select className="bg-transparent text-sm text-muted outline-none max-w-[200px]" value={String(categoryFilter)} onChange={e => setCategoryFilter(e.target.value === 'all' || e.target.value === 'none' ? e.target.value as any : Number(e.target.value))}>
              <option value="all">Todas as categorias</option>
              <option value="none">— Sem categoria —</option>
              <optgroup label="Receitas">{categories.filter(c => c.type === CategoryType.INCOME).slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <optgroup label="Despesas">{categories.filter(c => c.type === CategoryType.EXPENSE).slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            </select>
            <select className="bg-transparent text-sm text-muted outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Todos os status</option><option value="reconciled">Conciliado</option><option value="pending">Pendente</option>
            </select>
            {quickChips}
          </div>
        </>
      )}

      {/* ---------- MODO LOTE: filtros + painel de ações ---------- */}
      {isBatchMode && (
        <>
          <div className="bg-surface p-4 rounded-xl border border-line shadow-sm space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs text-muted flex flex-col gap-1">Descrição contém
                <input value={bf.q} onChange={e => setBf(f => ({ ...f, q: e.target.value }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" placeholder="ex: pix, tarifa…" />
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">Tipo
                <select value={bf.type} onChange={e => setBf(f => ({ ...f, type: e.target.value }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm">
                  <option value="all">Todos</option><option value={TransactionType.CREDIT}>Receitas</option><option value={TransactionType.DEBIT}>Despesas</option>
                </select>
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">Categoria
                <select value={String(bf.cat)} onChange={e => setBf(f => ({ ...f, cat: (e.target.value === 'all' || e.target.value === 'none') ? e.target.value as any : Number(e.target.value) }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm">
                  <option value="all">Todas</option><option value="none">— Sem categoria —</option>
                  {categories.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">Banco
                <select value={String(bf.bank)} onChange={e => setBf(f => ({ ...f, bank: e.target.value === 'all' ? 'all' : Number(e.target.value) }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm">
                  <option value="all">Todos</option>{activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">Status
                <select value={bf.status} onChange={e => setBf(f => ({ ...f, status: e.target.value }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm">
                  <option value="all">Todos</option><option value="reconciled">Conciliado</option><option value="pending">Pendente</option>
                </select>
              </label>
              <div className="text-xs text-muted flex flex-col gap-1">Valor
                <div className="flex gap-1">
                  <select value={bf.op} onChange={e => setBf(f => ({ ...f, op: e.target.value as ValueOp }))} className="bg-surface border border-line rounded-lg px-1.5 py-1.5 text-ink text-sm">
                    <option value="any">qualquer</option><option value="eq">=</option><option value="gte">≥</option><option value="lte">≤</option><option value="between">entre</option>
                  </select>
                  {bf.op !== 'any' && <input inputMode="decimal" value={bf.va} onChange={e => setBf(f => ({ ...f, va: e.target.value }))} className="w-20 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm tabular-nums" placeholder="0" />}
                  {bf.op === 'between' && <input inputMode="decimal" value={bf.vb} onChange={e => setBf(f => ({ ...f, vb: e.target.value }))} className="w-20 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm tabular-nums" placeholder="0" />}
                </div>
              </div>
              <label className="text-xs text-muted flex flex-col gap-1">De
                <input type="date" value={bf.from} onChange={e => setBf(f => ({ ...f, from: e.target.value }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" />
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">Até
                <input type="date" value={bf.to} onChange={e => setBf(f => ({ ...f, to: e.target.value }))} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" />
              </label>
            </div>
            {quickChips}
          </div>

          {selectedBatchIds.length > 0 && (
            <div className="bg-info/10 border border-info/30 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <span className="text-info font-bold">{selectedBatchIds.length} selecionado(s) — aplicar mudança:</span>
                {batchMsg && <span className="text-xs text-ink bg-surface px-2 py-1 rounded">{batchMsg}</span>}
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {/* Categoria */}
                <div className="flex items-center gap-2">
                  <select value={actCat} onChange={e => setActCat(Number(e.target.value))} className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm">
                    <option value={0}>Categoria…</option>
                    <option value={-1}>— Remover categoria —</option>
                    <optgroup label="Receitas">{categories.filter(c => c.type === CategoryType.INCOME).slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                    <optgroup label="Despesas">{categories.filter(c => c.type === CategoryType.EXPENSE).slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  </select>
                  <button disabled={applying || actCat === 0} onClick={() => runBatch({ categoryId: actCat === -1 ? null : actCat })} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40">Aplicar</button>
                </div>

                {/* Data */}
                <div className="flex items-center gap-2">
                  <input type="date" value={actDate} onChange={e => setActDate(e.target.value)} className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" />
                  <button disabled={applying || !actDate} onClick={() => runBatch({ date: actDate })} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40">Aplicar data</button>
                </div>

                {/* Descrição */}
                <div className="flex items-center gap-2 md:col-span-2">
                  <select value={actDescMode} onChange={e => setActDescMode(e.target.value as any)} className="bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm">
                    <option value="set">Definir descrição</option>
                    <option value="replace">Localizar e substituir</option>
                  </select>
                  {actDescMode === 'set' ? (
                    <input value={actDesc} onChange={e => setActDesc(e.target.value)} className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" placeholder="nova descrição" />
                  ) : (
                    <>
                      <input value={actFrom} onChange={e => setActFrom(e.target.value)} className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" placeholder="localizar" />
                      <Replace size={16} className="text-faint shrink-0" />
                      <input value={actTo} onChange={e => setActTo(e.target.value)} className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm" placeholder="substituir por" />
                    </>
                  )}
                  <button disabled={applying || (actDescMode === 'set' ? !actDesc : !actFrom)} onClick={() => runBatch(actDescMode === 'set' ? { description: actDesc } : { descriptionReplace: { from: actFrom, to: actTo } })} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40">Aplicar</button>
                </div>

                {/* Valor */}
                <div className="flex items-center gap-2">
                  <input inputMode="decimal" value={actValue} onChange={e => setActValue(e.target.value)} className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-ink text-sm tabular-nums" placeholder="novo valor (R$)" />
                  <button disabled={applying || !actValue} onClick={() => runBatch({ value: Math.abs(Number(String(actValue).replace(',', '.'))) })} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40">Aplicar valor</button>
                </div>

                {/* Conciliação */}
                <div className="flex items-center gap-2">
                  <button disabled={applying} onClick={() => runBatch({ reconciled: true })} className="flex-1 px-3 py-1.5 rounded-lg border border-line text-muted hover:text-ink text-sm font-medium disabled:opacity-40">Marcar conciliado</button>
                  <button disabled={applying} onClick={() => runBatch({ reconciled: false })} className="flex-1 px-3 py-1.5 rounded-lg border border-line text-muted hover:text-ink text-sm font-medium disabled:opacity-40">Marcar pendente</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- TABELA ---------- */}
      <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-ground/30 flex justify-between items-center">
          <h3 className="font-semibold text-ink">Lançamentos Detalhados</h3>
          <span className="text-xs bg-sunken border border-line px-2 py-1 rounded text-muted">{displayed.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-ground text-muted font-medium border-b border-line">
              <tr>
                {isBatchMode && (
                  <th className="px-4 py-4 w-10">
                    <button onClick={toggleSelectAll} className="text-muted hover:text-ink">
                      {selectedBatchIds.length === displayed.length && displayed.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </th>
                )}
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Banco / Cartão</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Status</th>
                {!isBatchMode && <th className="px-6 py-4 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={isBatchMode ? 7 : 7} className="px-6 py-12 text-center text-faint">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CalendarSearch size={32} className="opacity-50" />
                      <p>Nenhum lançamento encontrado{isBatchMode ? ' com esses filtros.' : ' neste período.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayed.map(t => {
                  const category = categories.find(c => c.id === t.categoryId);
                  const bank = banks.find(b => b.id === t.bankId);
                  const creditCard = creditCards.find(c => c.id === t.creditCardId);
                  const isSelected = selectedBatchIds.includes(t.id);
                  return (
                    <tr key={t.id}
                      className={`hover:bg-sunken/60 transition-colors ${isSelected && isBatchMode ? 'bg-info/10' : ''}`}
                      style={{ borderLeft: `3px solid ${category?.color || 'transparent'}` }}
                      onClick={() => isBatchMode && toggleSelectId(t.id)}
                    >
                      {isBatchMode && (
                        <td className="px-4 py-4 text-center">
                          {isSelected ? <CheckSquare size={18} className="text-info" /> : <Square size={18} className="text-muted" />}
                        </td>
                      )}
                      <td className="px-6 py-4 text-muted font-mono">{fmtDateBR(t.date)}</td>
                      <td className="px-6 py-4 font-medium text-ink">{t.description}</td>
                      <td className="px-6 py-4"><CategoryTag category={category} /></td>
                      <td className="px-6 py-4 text-muted">
                        <div className="flex items-center gap-2">
                          {bank && <img src={bank.logo} className="w-5 h-5 rounded-full object-contain bg-white p-0.5" />}
                          {creditCard ? (
                            <span className="flex items-center gap-1 text-info"><CreditCardIcon size={12} /> {creditCard.name}</span>
                          ) : (bank?.name || <span className="text-xs text-faint font-medium border border-line bg-sunken/60 px-2 py-0.5 rounded">N/A</span>)}
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-right font-medium ${t.type === TransactionType.CREDIT ? 'text-ok' : 'text-danger'}`}>
                        {t.type === TransactionType.DEBIT ? '- ' : '+ '}{brl(t.value)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {t.reconciled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand/10 text-brand-fg border border-ok/20 text-xs font-medium"><Check size={12} /> Conciliado</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); onReconcile(t.id); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-warn/10 text-warn border border-warn/20 text-xs font-medium hover:bg-warn/15 transition-colors">Pendente</button>
                        )}
                      </td>
                      {!isBatchMode && (
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleEditClick(t); }} className="p-1.5 text-faint hover:text-brand hover:bg-brand/10 rounded transition-colors" title="Editar"><Edit2 size={16} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteTransaction(t.id); }} className="p-1.5 text-faint hover:text-brand-fg hover:bg-danger/10 rounded transition-colors" title="Excluir"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-surface border border-line rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-ground">
              <h3 className="font-semibold text-ink">{editingId ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Tipo</label>
                  <select className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as TransactionType })}>
                    <option value={TransactionType.DEBIT}>Despesa (-)</option>
                    <option value={TransactionType.CREDIT}>Receita (+)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Data</label>
                  <input type="date" required className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Descrição</label>
                <input type="text" required placeholder="Ex: Supermercado" className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink placeholder-faint" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Valor (R$)</label>
                <input type="number" required step="0.01" placeholder="0,00"
                  className={`w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all font-mono font-bold ${formData.type === TransactionType.DEBIT ? 'text-danger' : 'text-ok'}`}
                  value={formData.value}
                  onChange={e => {
                    const val = e.target.value;
                    const numVal = parseFloat(val);
                    let newType = formData.type;
                    if (!isNaN(numVal)) { if (numVal < 0) newType = TransactionType.DEBIT; if (numVal > 0) newType = TransactionType.CREDIT; }
                    setFormData(prev => ({ ...prev, value: val, type: newType }));
                  }} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Conta / Cartão</label>
                  <select className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink"
                    value={formData.creditCardId ? `card_${formData.creditCardId}` : `bank_${formData.bankId || 'null'}`}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.startsWith('card_')) {
                        const cardId = Number(val.replace('card_', ''));
                        const card = creditCards.find(c => c.id === cardId);
                        if (card) setFormData({ ...formData, bankId: card.bankId, creditCardId: cardId });
                      } else if (val.startsWith('bank_')) {
                        const bankId = val === 'bank_null' ? 0 : Number(val.replace('bank_', ''));
                        setFormData({ ...formData, bankId, creditCardId: null });
                      }
                    }}>
                    <option value="bank_null" disabled>Selecione uma conta...</option>
                    <optgroup label="Contas Bancárias">{activeBanks.map(b => <option key={`bank_${b.id}`} value={`bank_${b.id}`}>{b.name}</option>)}</optgroup>
                    {creditCards.length > 0 && <optgroup label="Cartões de Crédito">{creditCards.map(c => <option key={`card_${c.id}`} value={`card_${c.id}`}>{c.name}</option>)}</optgroup>}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Categoria</label>
                  <select className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink" value={formData.categoryId || 0} onChange={e => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                    <option value={0}>Selecione...</option>
                    {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-line text-muted rounded-lg hover:bg-sunken font-medium transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium transition-colors shadow-sm">{editingId ? 'Salvar e Conciliar' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
