import React, { useState, useEffect } from 'react';
import { Transaction, TransactionType, Bank, Category, CategoryType, CreditCard } from '../types';
import { Search, Plus, Trash2, Check, X, ChevronLeft, ChevronRight, Edit2, CheckSquare, Square, ListChecks, Save, CalendarSearch, CreditCard as CreditCardIcon } from 'lucide-react';

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
  onBatchUpdate?: (ids: number[], categoryId: number) => void;
}

const Transactions: React.FC<TransactionsProps> = ({ 
  userId, transactions, banks, creditCards, categories, onAddTransaction, onEditTransaction, onDeleteTransaction, onReconcile, onBatchUpdate 
}) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedBankId, setSelectedBankId] = useState<number | 'all'>('all');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [batchCategoryId, setBatchCategoryId] = useState<number>(0);

  const activeBanks = banks.filter(b => b.active);
  const activeBankIds = activeBanks.map(b => b.id);

  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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
        description: '',
        value: '',
        type: TransactionType.DEBIT,
        bankId: activeBanks[0]?.id || 0,
        creditCardId: null,
        categoryId: 0, 
       });
    }
  }, [isModalOpen, editingId, banks]);

  const handleEditClick = (t: Transaction) => {
      setEditingId(t.id);
      setFormData({
          date: t.date,
          description: t.description,
          value: String(t.value),
          type: t.type,
          bankId: t.bankId,
          creditCardId: t.creditCardId || null,
          categoryId: t.categoryId || 0
      });
      setIsModalOpen(true);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(selectedYear - 1);
    } else {
        setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(selectedYear + 1);
    } else {
        setSelectedMonth(selectedMonth + 1);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (!t.date) return false;
    // Oculta transações de bancos arquivados, mas permite as sem banco (importadas da contabilidade)
    if (t.bankId && !activeBankIds.includes(t.bankId)) return false; 
    
    const parts = t.date.split('-');
    if (parts.length < 2) return false;

    const y = parts[0];
    const m = parts[1];

    const yearMatch = parseInt(y) === selectedYear;
    const monthMatch = (parseInt(m) - 1) === selectedMonth;
    const bankMatch = selectedBankId === 'all' || t.bankId === selectedBankId || (!t.bankId && selectedBankId === 'all');
    
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const matchesCategory = categoryFilter === 'all' || t.categoryId === categoryFilter;
    
    const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'reconciled' ? t.reconciled : !t.reconciled);

    return yearMatch && monthMatch && bankMatch && matchesSearch && matchesType && matchesCategory && matchesStatus;
  });

  const totalIncome = filteredTransactions.filter(t => t.type === TransactionType.CREDIT).reduce((a, b) => a + b.value, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === TransactionType.DEBIT).reduce((a, b) => a + b.value, 0);
  const periodBalance = totalIncome - totalExpense;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      date: formData.date,
      description: formData.description,
      value: Math.abs(Number(formData.value)), 
      type: formData.type,
      bankId: formData.bankId ? Number(formData.bankId) : null,
      creditCardId: formData.creditCardId,
      categoryId: Number(formData.categoryId),
      reconciled: editingId ? true : false 
    };

    if (editingId) {
        onEditTransaction(editingId, payload);
    } else {
        onAddTransaction({ ...payload, summary: '' });
    }

    setIsModalOpen(false);
    setEditingId(null);
  };

  const availableCategories = categories.filter(c => 
    formData.type === TransactionType.CREDIT 
      ? c.type === CategoryType.INCOME 
      : c.type === CategoryType.EXPENSE
  );

  const toggleBatchMode = () => {
      setIsBatchMode(!isBatchMode);
      setSelectedBatchIds([]);
      setBatchCategoryId(0);
  };

  const toggleSelectAll = () => {
      if (selectedBatchIds.length === filteredTransactions.length) {
          setSelectedBatchIds([]);
      } else {
          setSelectedBatchIds(filteredTransactions.map(t => t.id));
      }
  };

  const toggleSelectId = (id: number) => {
      if (selectedBatchIds.includes(id)) {
          setSelectedBatchIds(prev => prev.filter(pid => pid !== id));
      } else {
          setSelectedBatchIds(prev => [...prev, id]);
      }
  };

  const handleBatchApply = () => {
      if (selectedBatchIds.length === 0) return alert("Selecione pelo menos um lançamento.");
      if (batchCategoryId === 0) return alert("Selecione uma categoria para aplicar.");
      
      if (onBatchUpdate) {
          onBatchUpdate(selectedBatchIds, batchCategoryId);
          setIsBatchMode(false);
          setSelectedBatchIds([]);
          alert(`${selectedBatchIds.length} lançamentos atualizados e conciliados.`);
      }
  };

  return (
    <div className="space-y-6">
       <div>
        <h1 className="text-2xl font-bold text-ink">
            Lançamentos - {MONTHS[selectedMonth]}/{selectedYear}
        </h1>
       </div>

      <div className="bg-surface p-4 rounded-xl border border-line shadow-sm flex flex-col md:flex-row items-end md:items-center justify-between gap-4">
           {!isBatchMode ? (
               <>
                <div className="flex gap-4 w-full md:w-auto">
                    <div>
                        <label className="text-xs font-semibold text-faint block mb-1">Selecionar Ano</label>
                        <div className="flex bg-surface rounded-lg p-1 border border-line">
                            <button onClick={() => setSelectedYear(selectedYear - 1)} className="px-3 py-1 hover:bg-sunken rounded-md text-sm text-muted"><ChevronLeft size={16}/></button>
                            <span className="px-4 py-1 font-semibold text-ink">{selectedYear}</span>
                            <button onClick={() => setSelectedYear(selectedYear + 1)} className="px-3 py-1 hover:bg-sunken rounded-md text-sm text-muted"><ChevronRight size={16}/></button>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-faint block mb-1">Filtrar por Banco</label>
                        <select 
                            className="w-full px-3 py-1.5 bg-surface border border-line rounded-lg text-sm text-ink outline-none focus:border-brand"
                            value={selectedBankId}
                            onChange={e => setSelectedBankId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        >
                            <option value="all">Todos os Bancos</option>
                            {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={toggleBatchMode}
                        className="px-4 py-2 bg-sunken text-muted border border-line rounded-lg hover:bg-sunken font-medium flex items-center gap-2"
                    >
                        <ListChecks size={18}/> Editar em Lote
                    </button>
                    <button 
                        onClick={() => { setEditingId(null); setIsModalOpen(true); }}
                        className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={18}/> Novo Lançamento
                    </button>
                </div>
               </>
           ) : (
               <div className="w-full flex items-center justify-between bg-info/10 p-2 rounded-lg border border-info/40/30 animate-in fade-in slide-in-from-top-2">
                   <div className="flex items-center gap-4">
                       <span className="text-info font-bold px-2">{selectedBatchIds.length} selecionados</span>
                       <div className="h-6 w-px bg-info/30"></div>
                       <select 
                           className="bg-surface border border-info/40/30 text-ink text-sm rounded-lg px-3 py-1.5 outline-none focus:border-info/40"
                           value={batchCategoryId}
                           onChange={(e) => setBatchCategoryId(Number(e.target.value))}
                       >
                           <option value={0}>Selecione a nova categoria...</option>
                           <optgroup label="Receitas">
                               {categories.filter(c => c.type === CategoryType.INCOME).map(c => (
                                   <option key={c.id} value={c.id}>{c.name}</option>
                               ))}
                           </optgroup>
                           <optgroup label="Despesas">
                               {categories.filter(c => c.type === CategoryType.EXPENSE).map(c => (
                                   <option key={c.id} value={c.id}>{c.name}</option>
                               ))}
                           </optgroup>
                       </select>
                   </div>
                   <div className="flex gap-2">
                       <button onClick={toggleBatchMode} className="px-4 py-1.5 text-muted hover:text-ink text-sm">Cancelar</button>
                       <button 
                           onClick={handleBatchApply}
                           className="px-4 py-1.5 bg-info hover:bg-info/90 text-white rounded-lg text-sm font-bold flex items-center gap-2"
                       >
                           <Save size={16} /> Aplicar e Conciliar
                       </button>
                   </div>
               </div>
           )}
      </div>

       {!isBatchMode && (
        <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
            <div className="flex flex-col lg:flex-row">
                <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-line p-4 flex items-center justify-between">
                        <button onClick={handlePrevMonth} className="p-2 hover:bg-sunken rounded-full text-brand"><ChevronLeft/></button>
                        <div className="font-bold text-xl text-brand">{MONTHS[selectedMonth]}</div>
                        <button onClick={handleNextMonth} className="p-2 hover:bg-sunken rounded-full text-brand"><ChevronRight/></button>
                </div>
                
                <div className="flex-1 grid grid-cols-3 divide-x divide-line">
                        <div className="p-4 text-center">
                            <div className="text-xs text-faint uppercase font-semibold mb-1">Receitas</div>
                            <div className="text-xl font-bold text-ok">{(totalIncome).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                        </div>
                        <div className="p-4 text-center">
                            <div className="text-xs text-faint uppercase font-semibold mb-1">Despesas</div>
                            <div className="text-xl font-bold text-danger">{(totalExpense).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                        </div>
                        <div className="p-4 text-center bg-surface/50">
                            <div className="text-xs text-faint uppercase font-semibold mb-1">Saldo do Mês</div>
                            <div className={`text-xl font-bold ${periodBalance >= 0 ? 'text-ok' : 'text-danger'}`}>
                                {(periodBalance).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                            </div>
                        </div>
                </div>
            </div>
        </div>
       )}

      <div className="bg-surface px-4 py-2 border border-line rounded-lg shadow-sm flex items-center gap-4 overflow-x-auto custom-scroll">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            className="w-full pl-10 pr-4 py-2 bg-transparent border-none outline-none text-sm text-ink placeholder-faint"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="h-6 w-px bg-sunken"></div>

        <select 
            className="bg-transparent text-sm text-muted outline-none"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos os tipos</option>
            <option value={TransactionType.CREDIT}>Receitas</option>
            <option value={TransactionType.DEBIT}>Despesas</option>
        </select>

        <div className="h-6 w-px bg-sunken"></div>

        <select 
            className="bg-transparent text-sm text-muted outline-none max-w-[200px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
            <option value="all">Todas as categorias</option>
            <optgroup label="Receitas">
                {categories.filter(c => c.type === CategoryType.INCOME).sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </optgroup>
            <optgroup label="Despesas">
                {categories.filter(c => c.type === CategoryType.EXPENSE).sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </optgroup>
        </select>

        <div className="h-6 w-px bg-sunken"></div>
        
        <select 
            className="bg-transparent text-sm text-muted outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
        >
            <option value="all">Todos os status</option>
            <option value="reconciled">Conciliado</option>
            <option value="pending">Pendente</option>
        </select>
      </div>

      <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-ground/30 flex justify-between items-center">
            <h3 className="font-semibold text-ink">Lançamentos Detalhados</h3>
            <span className="text-xs bg-sunken border border-line px-2 py-1 rounded text-muted">
                {filteredTransactions.length} registros
            </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-ground text-muted font-medium border-b border-line">
              <tr>
                {isBatchMode && (
                    <th className="px-4 py-4 w-10">
                        <button onClick={toggleSelectAll} className="text-muted hover:text-ink">
                            {selectedBatchIds.length === filteredTransactions.length && filteredTransactions.length > 0 ? <CheckSquare size={18}/> : <Square size={18}/>}
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
              {filteredTransactions.length === 0 ? (
                  <tr>
                      <td colSpan={isBatchMode ? 8 : 7} className="px-6 py-12 text-center text-faint">
                          <div className="flex flex-col items-center justify-center gap-2">
                              <CalendarSearch size={32} className="opacity-50"/>
                              <p>Nenhum lançamento encontrado neste período.</p>
                              <p className="text-xs text-faint">Verifique se você importou o OFX para o mês/ano selecionado no topo.</p>
                          </div>
                      </td>
                  </tr>
              ) : (
                  filteredTransactions.map((t) => {
                    const category = categories.find(c => c.id === t.categoryId);
                    const bank = banks.find(b => b.id === t.bankId);
                    const creditCard = creditCards.find(c => c.id === t.creditCardId);
                    const isSelected = selectedBatchIds.includes(t.id);
                    
                    return (
                      <tr 
                        key={t.id} 
                        className={`hover:bg-sunken/60 transition-colors ${isSelected && isBatchMode ? 'bg-info/10' : ''}`}
                        onClick={() => isBatchMode && toggleSelectId(t.id)}
                      >
                        {isBatchMode && (
                            <td className="px-4 py-4 text-center">
                                <button className="text-muted">
                                    {isSelected ? <CheckSquare size={18} className="text-info"/> : <Square size={18}/>}
                                </button>
                            </td>
                        )}
                        <td className="px-6 py-4 text-muted font-mono">
                            {new Date(t.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 font-medium text-ink">{t.description}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${!category ? 'bg-danger/10 text-danger border border-danger/30' : 'bg-sunken text-muted border border-line'}`}>
                            {category?.name || 'Sem Categoria'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted flex items-center gap-2">
                            {bank && <img src={bank.logo} className="w-5 h-5 rounded-full object-contain bg-white p-0.5"/>}
                            {creditCard ? (
                                <span className="flex items-center gap-1 text-info">
                                    <CreditCardIcon size={12}/> {creditCard.name}
                                </span>
                            ) : (
                                bank?.name || <span className="text-xs text-faint font-medium border border-line bg-sunken/60 px-2 py-0.5 rounded">N/A</span>
                            )}
                        </td>
                        <td className={`px-6 py-4 text-right font-medium ${t.type === TransactionType.CREDIT ? 'text-ok' : 'text-danger'}`}>
                          {t.type === TransactionType.DEBIT ? '- ' : '+ '}
                          {(t.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {t.reconciled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand/10 text-brand-fg border border-ok/20 text-xs font-medium">
                              <Check size={12} /> Conciliado
                            </span>
                          ) : (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onReconcile(t.id); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-warn/10 text-warn border border-warn/20 text-xs font-medium hover:bg-warn/15 transition-colors"
                            >
                              Pendente
                            </button>
                          )}
                        </td>
                        {!isBatchMode && (
                            <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                                className="p-1.5 text-faint hover:text-brand hover:bg-brand/10 rounded transition-colors"
                                title="Editar"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteTransaction(t.id); }}
                                className="p-1.5 text-faint hover:text-brand-fg hover:bg-danger/10 rounded transition-colors"
                                title="Excluir"
                            >
                                <Trash2 size={16} />
                            </button>
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
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted">Tipo</label>
                    <select 
                        className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink"
                        value={formData.type}
                        onChange={e => setFormData({...formData, type: e.target.value as TransactionType})}
                    >
                        <option value={TransactionType.DEBIT}>Despesa (-)</option>
                        <option value={TransactionType.CREDIT}>Receita (+)</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted">Data</label>
                    <input 
                        type="date" 
                        required
                        className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink"
                        value={formData.date}
                        onChange={e => setFormData({...formData, date: e.target.value})}
                    />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Descrição</label>
                <input 
                    type="text" 
                    required
                    placeholder="Ex: Supermercado"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink placeholder-faint"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Valor (R$)</label>
                <input 
                    type="number" 
                    required
                    step="0.01"
                    placeholder="0,00"
                    className={`w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all font-mono font-bold ${
                        formData.type === TransactionType.DEBIT ? 'text-danger' : 'text-ok'
                    }`}
                    value={formData.value}
                    onChange={e => {
                        const val = e.target.value;
                        const numVal = parseFloat(val);
                        let newType = formData.type;
                        if (!isNaN(numVal)) {
                            if (numVal < 0) newType = TransactionType.DEBIT;
                            if (numVal > 0) newType = TransactionType.CREDIT;
                        }
                        setFormData(prev => ({ ...prev, value: val, type: newType }));
                    }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted">Conta / Cartão</label>
                    <select 
                        className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink"
                        value={formData.creditCardId ? `card_${formData.creditCardId}` : `bank_${formData.bankId || 'null'}`}
                        onChange={e => {
                            const val = e.target.value;
                            if (val.startsWith('card_')) {
                                const cardId = Number(val.replace('card_', ''));
                                const card = creditCards.find(c => c.id === cardId);
                                if (card) {
                                    setFormData({...formData, bankId: card.bankId, creditCardId: cardId});
                                }
                            } else if (val.startsWith('bank_')) {
                                const bankId = val === 'bank_null' ? 0 : Number(val.replace('bank_', ''));
                                setFormData({...formData, bankId: bankId, creditCardId: null});
                            }
                        }}
                    >
                        <option value="bank_null" disabled>Selecione uma conta...</option>
                        <optgroup label="Contas Bancárias">
                            {activeBanks.map(b => (
                                <option key={`bank_${b.id}`} value={`bank_${b.id}`}>{b.name}</option>
                            ))}
                        </optgroup>
                        {creditCards.length > 0 && (
                            <optgroup label="Cartões de Crédito">
                                {creditCards.map(c => (
                                    <option key={`card_${c.id}`} value={`card_${c.id}`}>{c.name}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted">Categoria</label>
                    <select 
                        className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none transition-all text-ink"
                        value={formData.categoryId || 0}
                        onChange={e => setFormData({...formData, categoryId: Number(e.target.value)})}
                    >
                        <option value={0}>Selecione...</option>
                        {availableCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-line text-muted rounded-lg hover:bg-sunken font-medium transition-colors"
                >
                    Cancelar
                </button>
                <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium transition-colors shadow-sm"
                >
                    {editingId ? 'Salvar e Conciliar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;