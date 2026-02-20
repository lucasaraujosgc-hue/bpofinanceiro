import React, { useState, useEffect } from 'react';
import { Bank, Category, Forecast, TransactionType, CategoryType, CreditCard, Transaction } from '../types';
import { ChevronLeft, ChevronRight, Plus, Check, Trash2, CalendarDays, Edit2, Repeat, Infinity, X, CreditCard as CreditCardIcon } from 'lucide-react';

interface ForecastsProps {
  token: string;
  userId: number;
  banks: Bank[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  categories: Category[];
  onUpdate: () => void;
  onNavigate: (tab: string) => void;
}

const Forecasts: React.FC<ForecastsProps> = ({ token, userId, banks, creditCards, transactions, categories, onUpdate, onNavigate }) => {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedBankId, setSelectedBankId] = useState<number | 'all'>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: number | string | null }>({ isOpen: false, id: null });

  const [formData, setFormData] = useState({
      description: '',
      value: '',
      type: TransactionType.DEBIT,
      date: new Date().toISOString().split('T')[0],
      categoryId: 0,
      bankId: banks[0]?.id || 0,
      creditCardId: null as number | null,
      installments: 1,
      isFixed: false
  });

  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const getHeaders = () => {
      return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
      };
  };

  useEffect(() => {
    fetchForecasts();
  }, [userId]); 

  const fetchForecasts = async () => {
    try {
        const res = await fetch('/api/forecasts', { headers: getHeaders() });
        if (res.ok) setForecasts(await res.json());
    } catch (e) {
        console.error(e);
    }
  };

  const handleEditClick = (f: Forecast) => {
      if (typeof f.id === 'string' && f.id.startsWith('cc-')) {
          alert('Previsões de fatura de cartão são automáticas e não podem ser editadas.');
          return;
      }
      setEditingId(f.id);
      setFormData({
          description: f.description,
          value: String(f.value),
          type: f.type,
          date: f.date,
          categoryId: f.categoryId,
          bankId: f.bankId,
          creditCardId: f.creditCardId || null,
          installments: 1,
          isFixed: false
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Math.abs(Number(formData.value));
    
    try {
        if (editingId) {
             await fetch(`/api/forecasts/${editingId}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({
                    date: formData.date,
                    description: formData.description,
                    value: value,
                    type: formData.type,
                    categoryId: Number(formData.categoryId),
                    bankId: Number(formData.bankId),
                    creditCardId: formData.creditCardId
                })
            });
        } else {
            const groupId = Date.now().toString(); 
            const baseDate = new Date(formData.date);
            
            const installments = formData.isFixed ? 60 : Math.max(1, Math.floor(Number(formData.installments)));

            for (let i = 0; i < installments; i++) {
                const currentDate = new Date(baseDate);
                currentDate.setMonth(baseDate.getMonth() + i);
                
                const payload = {
                    date: currentDate.toISOString().split('T')[0],
                    description: formData.description,
                    value: value,
                    type: formData.type,
                    categoryId: Number(formData.categoryId),
                    bankId: Number(formData.bankId),
                    creditCardId: formData.creditCardId,
                    installmentCurrent: formData.isFixed ? i + 1 : i + 1,
                    installmentTotal: formData.isFixed ? 0 : installments, 
                    groupId: (installments > 1 || formData.isFixed) ? groupId : null
                };

                await fetch('/api/forecasts', {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify(payload)
                });
            }
        }

        setIsModalOpen(false);
        setEditingId(null);
        setFormData({ ...formData, description: '', value: '', installments: 1, isFixed: false, creditCardId: null });
        await fetchForecasts();
        onUpdate(); // Trigger global update
    } catch (e) {
        alert("Erro ao salvar previsão");
    }
  };

  const handleDeleteClick = (id: number | string) => {
      if (typeof id === 'string' && id.startsWith('cc-')) {
          alert('Previsões de fatura de cartão são automáticas e não podem ser excluídas.');
          return;
      }
      setDeleteModal({ isOpen: true, id });
  };

  const confirmDelete = async (mode: 'single' | 'all' | 'future') => {
      if (!deleteModal.id) return;
      
      try {
          await fetch(`/api/forecasts/${deleteModal.id}?mode=${mode}`, { 
              method: 'DELETE',
              headers: getHeaders()
          });
          setDeleteModal({ isOpen: false, id: null });
          await fetchForecasts();
          onUpdate(); // Trigger global update
      } catch (e) {
          alert("Erro ao excluir");
      }
  };

  const handleRealize = async (forecast: Forecast) => {
      if (typeof forecast.id === 'string' && forecast.id.startsWith('cc-')) {
          // Realizing a credit card invoice forecast creates a transaction (payment of the invoice)
          if(confirm(`Confirmar pagamento da fatura "${forecast.description}"? Isso criará um lançamento de despesa na conta bancária.`)) {
              try {
                  await fetch('/api/transactions', {
                      method: 'POST',
                      headers: getHeaders(),
                      body: JSON.stringify({
                          date: forecast.date,
                          description: `Pagamento Fatura - ${forecast.description}`,
                          value: forecast.value,
                          type: TransactionType.DEBIT,
                          categoryId: forecast.categoryId || 0, // Should be a "Credit Card Payment" category ideally
                          bankId: forecast.bankId,
                          reconciled: true
                      })
                  });
                  await fetchForecasts();
                  await onUpdate();
                  onNavigate('transactions');
              } catch (e) {
                  alert("Erro ao efetivar pagamento de fatura");
              }
          }
          return;
      }

      if(confirm('Confirmar realização desta previsão? Ela será movida para Lançamentos.')) {
           try {
               await fetch(`/api/forecasts/${forecast.id}/realize`, { 
                   method: 'PATCH',
                   headers: getHeaders()
                });
               
               const descSuffix = forecast.installmentTotal ? ` (${forecast.installmentCurrent}/${forecast.installmentTotal})` : (forecast.groupId ? ' (Recorrente)' : '');
               
               // Manual Creation of Transaction from Frontend
               await fetch('/api/transactions', {
                   method: 'POST',
                   headers: getHeaders(),
                   body: JSON.stringify({
                       date: forecast.date,
                       description: forecast.description + descSuffix,
                       value: forecast.value,
                       type: forecast.type,
                       categoryId: forecast.categoryId,
                       bankId: forecast.bankId,
                       creditCardId: forecast.creditCardId,
                       reconciled: false
                   })
               });

               await fetchForecasts();
               await onUpdate(); // Wait for global update to complete
               onNavigate('transactions'); // Redirect to transactions tab
           } catch (e) {
               alert("Erro ao efetivar");
           }
      }
  };

  // --- CREDIT CARD INVOICE CALCULATION ---
  const getCreditCardForecasts = () => {
      // Logic: Calculate "Open Invoice" for each card and project it to the Due Date in the selected month/year
      
      // We need to find the due date that falls within the selected month/year
      // If selectedMonth/Year matches the due date of the current open invoice, show it.
      
      return creditCards.map(card => {
          // Determine the due date for the selected month/year
          // If dueDay is 10, and selected is May 2024, due date is 2024-05-10.
          const dueDate = new Date(selectedYear, selectedMonth, card.dueDay);
          const dueDateStr = dueDate.toISOString().split('T')[0];
          
          // Determine the closing date for this invoice
          // Usually closing date is X days before due date, or fixed day.
          // If closingDay is 1, and dueDay is 10.
          // For May 10th due date, closing date was May 1st? Or April 1st?
          // Usually closing is ~10 days before due.
          // If dueDay > closingDay (e.g. Due 10, Closing 1), same month.
          // If dueDay < closingDay (e.g. Due 5, Closing 25), previous month.
          
          let closingDate: Date;
          if (card.dueDay > card.closingDay) {
              // Same month
              closingDate = new Date(selectedYear, selectedMonth, card.closingDay);
          } else {
              // Previous month
              // If selected is Jan, prev is Dec of prev year
              closingDate = new Date(selectedYear, selectedMonth - 1, card.closingDay);
          }
          
          // Start date of the invoice period is the day after the PREVIOUS closing date.
          const prevClosingDate = new Date(closingDate);
          prevClosingDate.setMonth(closingDate.getMonth() - 1);
          
          const startDate = new Date(prevClosingDate);
          startDate.setDate(prevClosingDate.getDate() + 1);
          
          // Calculate sum of transactions in this period [startDate, closingDate]
          // Filter transactions:
          // 1. creditCardId matches
          // 2. date >= startDate
          // 3. date <= closingDate
          // 4. type is DEBIT (usually) - CREDIT refunds reduce the bill
          
          const invoiceAmount = transactions.reduce((acc, t) => {
              if (t.creditCardId !== card.id) return acc;
              const tDate = new Date(t.date);
              // Simple date comparison (ignoring time)
              if (tDate >= startDate && tDate <= closingDate) {
                  if (t.type === TransactionType.DEBIT) return acc + t.value;
                  if (t.type === TransactionType.CREDIT) return acc - t.value;
              }
              return acc;
          }, 0);

          if (invoiceAmount <= 0) return null;

          return {
              id: `cc-${card.id}-${selectedMonth}-${selectedYear}`,
              date: dueDateStr,
              description: `Fatura ${card.name}`,
              value: invoiceAmount,
              type: TransactionType.DEBIT,
              bankId: card.bankId,
              categoryId: 0, // No category
              realized: false, // Virtual forecast is never "realized" in the DB sense, but we can check if paid?
              // For now, always show as pending forecast
              creditCardId: card.id,
              isVirtual: true
          } as Forecast & { isVirtual?: boolean };
      }).filter(Boolean) as (Forecast & { isVirtual?: boolean })[];
  };

  const creditCardForecasts = getCreditCardForecasts();
  
  // Merge and sort
  const allForecasts = [...forecasts, ...creditCardForecasts].filter(f => {
      // Filter DB forecasts by date
      const [y, m] = f.date.split('-'); 
      const yearMatch = parseInt(y) === selectedYear;
      const monthMatch = (parseInt(m) - 1) === selectedMonth;
      const bankMatch = selectedBankId === 'all' || f.bankId === selectedBankId;
      return yearMatch && monthMatch && bankMatch;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalIncome = allForecasts.filter(f => f.type === TransactionType.CREDIT).reduce((a, b) => a + b.value, 0);
  const totalExpense = allForecasts.filter(f => f.type === TransactionType.DEBIT).reduce((a, b) => a + b.value, 0);
  const projectedBalance = totalIncome - totalExpense;

  const availableCategories = categories.filter(c => 
    formData.type === TransactionType.CREDIT 
      ? c.type === CategoryType.INCOME 
      : c.type === CategoryType.EXPENSE
  );

  const activeBanks = banks.filter(b => b.active);

  return (
    <div className="space-y-6">
       <div>
        <h1 className="text-2xl font-bold text-white">
            Previsões Financeiras - {MONTHS[selectedMonth]}/{selectedYear}
        </h1>
       </div>

       {/* Filters Header */}
       <div className="bg-surface p-4 rounded-xl border border-slate-800 shadow-sm flex flex-col md:flex-row items-end md:items-center justify-between gap-4">
           <div className="flex gap-4 w-full md:w-auto">
               <div>
                   <label className="text-xs font-semibold text-slate-500 block mb-1">Selecionar Ano</label>
                   <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                       <button onClick={() => setSelectedYear(selectedYear - 1)} className="px-3 py-1 hover:bg-slate-800 rounded-md text-sm text-slate-300"><ChevronLeft size={16}/></button>
                       <span className="px-4 py-1 font-semibold text-white">{selectedYear}</span>
                       <button onClick={() => setSelectedYear(selectedYear + 1)} className="px-3 py-1 hover:bg-slate-800 rounded-md text-sm text-slate-300"><ChevronRight size={16}/></button>
                   </div>
               </div>
               <div className="flex-1">
                   <label className="text-xs font-semibold text-slate-500 block mb-1">Filtrar por Banco</label>
                   <select 
                     className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-primary"
                     value={selectedBankId}
                     onChange={e => setSelectedBankId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                   >
                       <option value="all">Todos os Bancos</option>
                       {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                   </select>
               </div>
           </div>
           
           <button 
             onClick={() => { setEditingId(null); setIsModalOpen(true); }}
             className="px-4 py-2 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover font-medium flex items-center gap-2 shadow-sm shadow-emerald-900/20"
           >
               <Plus size={18}/> Nova Previsão
           </button>
       </div>

       {/* Month Navigation & Summary */}
       <div className="bg-surface rounded-xl border border-slate-800 shadow-sm overflow-hidden">
           <div className="flex flex-col lg:flex-row">
               {/* Month Carousel */}
               <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex items-center justify-between">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-800 rounded-full text-primary"><ChevronLeft/></button>
                    <div className="font-bold text-xl text-primary">{MONTHS[selectedMonth]}</div>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-slate-800 rounded-full text-primary"><ChevronRight/></button>
               </div>
               
               {/* Summary Cards */}
               <div className="flex-1 grid grid-cols-3 divide-x divide-slate-800">
                    <div className="p-4 text-center">
                        <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Receitas Previstas</div>
                        <div className="text-xl font-bold text-emerald-500">R$ {totalIncome.toFixed(2)}</div>
                    </div>
                    <div className="p-4 text-center">
                        <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Despesas Previstas</div>
                        <div className="text-xl font-bold text-rose-500">R$ {totalExpense.toFixed(2)}</div>
                    </div>
                    <div className="p-4 text-center bg-slate-900/50">
                        <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Saldo Projetado</div>
                        <div className={`text-xl font-bold ${projectedBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            R$ {projectedBalance.toFixed(2)}
                        </div>
                    </div>
               </div>
           </div>
       </div>

       {/* Detailed List */}
       <div className="bg-surface border border-slate-800 rounded-xl shadow-sm overflow-hidden">
           <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
               <h3 className="font-semibold text-slate-200">Previsões Detalhadas</h3>
               <span className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-400">
                   {allForecasts.length} registros
               </span>
           </div>
           <table className="w-full text-sm text-left">
               <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800">
                   <tr>
                       <th className="px-6 py-3">Banco / Cartão</th>
                       <th className="px-6 py-3">Dia</th>
                       <th className="px-6 py-3">Descrição</th>
                       <th className="px-6 py-3 text-right">Valor</th>
                       <th className="px-6 py-3 text-center">Parcela</th>
                       <th className="px-6 py-3 text-center">Status</th>
                       <th className="px-6 py-3 text-center">Ações</th>
                   </tr>
               </thead>
               <tbody className="divide-y divide-slate-800">
                   {allForecasts.length === 0 ? (
                       <tr><td colSpan={7} className="text-center py-8 text-slate-500">Nenhuma previsão para este período.</td></tr>
                   ) : (
                       allForecasts.map(f => {
                           const bank = banks.find(b => b.id === f.bankId);
                           const creditCard = creditCards.find(c => c.id === f.creditCardId);
                           const day = f.date.split('-')[2];
                           const isFixed = f.installmentTotal === 0;
                           const isVirtual = (f as any).isVirtual;
                           
                           return (
                               <tr key={f.id} className={`hover:bg-slate-800/50 ${isVirtual ? 'bg-indigo-900/5' : ''}`}>
                                   <td className="px-6 py-3 flex items-center gap-2">
                                       {bank && <img src={bank.logo} className="w-6 h-6 rounded object-contain bg-white p-0.5" title={bank.name}/>}
                                       {creditCard ? (
                                            <span className="flex items-center gap-1 text-indigo-400 text-xs">
                                                <CreditCardIcon size={12}/> {creditCard.name}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs">{bank?.name}</span>
                                        )}
                                   </td>
                                   <td className="px-6 py-3 text-slate-400">
                                       {day}/{selectedMonth+1}
                                       {isVirtual && <span className="ml-2 text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">Fatura</span>}
                                   </td>
                                   <td className="px-6 py-3 font-medium text-slate-200">{f.description}</td>
                                   <td className={`px-6 py-3 text-right font-bold ${f.type === TransactionType.DEBIT ? 'text-rose-500' : 'text-emerald-500'}`}>
                                       {f.value.toFixed(2)}
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                       {isFixed ? (
                                            <span className="flex items-center justify-center gap-1 text-xs font-semibold text-sky-400 bg-sky-900/20 px-2 py-0.5 rounded border border-sky-900/40">
                                                <Infinity size={12}/> Fixo
                                            </span>
                                       ) : f.installmentTotal ? (
                                           <span className="bg-sky-900/20 text-sky-400 px-2 py-0.5 rounded text-xs font-semibold border border-sky-900/40">
                                               {f.installmentCurrent}/{f.installmentTotal}
                                           </span>
                                       ) : '-'}
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                       {f.realized ? (
                                           <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded text-xs font-bold border border-emerald-500/20">Realizado</span>
                                       ) : (
                                           <span className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded text-xs font-bold border border-amber-500/20">Pendente</span>
                                       )}
                                   </td>
                                   <td className="px-6 py-3 text-center flex justify-center gap-2">
                                       {!f.realized && (
                                           <>
                                            <button onClick={() => handleRealize(f)} className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded hover:bg-emerald-500/20" title="Efetivar">
                                                <Check size={16}/>
                                            </button>
                                            {!isVirtual && (
                                                <button onClick={() => handleEditClick(f)} className="p-1.5 bg-sky-500/10 text-sky-500 rounded hover:bg-sky-500/20" title="Editar">
                                                    <Edit2 size={16}/>
                                                </button>
                                            )}
                                           </>
                                       )}
                                       {!isVirtual && (
                                           <button onClick={() => handleDeleteClick(f.id)} className="p-1.5 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20" title="Excluir">
                                               <Trash2 size={16}/>
                                           </button>
                                       )}
                                   </td>
                               </tr>
                           )
                       })
                   )}
               </tbody>
           </table>
       </div>

       {/* Edit/Create Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-surface border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
              <h3 className="font-semibold text-white">{editingId ? 'Editar Previsão' : 'Nova Previsão'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-slate-400 hover:text-white"/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="text-sm text-slate-400 font-medium">Tipo</label>
                         <select 
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-primary"
                            value={formData.type}
                            onChange={e => setFormData({...formData, type: e.target.value as TransactionType})}
                         >
                             <option value={TransactionType.DEBIT}>Despesa (-)</option>
                             <option value={TransactionType.CREDIT}>Receita (+)</option>
                         </select>
                     </div>
                     <div>
                         <label className="text-sm text-slate-400 font-medium">Data Início</label>
                         <input 
                            type="date"
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-primary"
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                         />
                     </div>
                </div>
                <div>
                     <label className="text-sm text-slate-400 font-medium">Descrição</label>
                     <input 
                        type="text" required
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-primary"
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                     />
                </div>
                <div>
                     <label className="text-sm text-slate-400 font-medium">Valor</label>
                     <input 
                        type="number" step="0.01" required
                        className={`w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 font-bold outline-none focus:border-primary ${formData.type === TransactionType.DEBIT ? 'text-rose-500' : 'text-emerald-500'}`}
                        value={formData.value}
                        onChange={e => setFormData({...formData, value: e.target.value})}
                     />
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="text-sm text-slate-400 font-medium">Conta / Cartão</label>
                         <select 
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-primary"
                            value={formData.creditCardId ? `card_${formData.creditCardId}` : `bank_${formData.bankId}`}
                            onChange={e => {
                                const val = e.target.value;
                                if (val.startsWith('card_')) {
                                    const cardId = Number(val.replace('card_', ''));
                                    const card = creditCards.find(c => c.id === cardId);
                                    if (card) {
                                        setFormData({...formData, bankId: card.bankId, creditCardId: cardId});
                                    }
                                } else {
                                    const bankId = Number(val.replace('bank_', ''));
                                    setFormData({...formData, bankId: bankId, creditCardId: null});
                                }
                            }}
                         >
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
                     <div>
                         <label className="text-sm text-slate-400 font-medium">Categoria</label>
                         <select 
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-primary"
                            value={formData.categoryId}
                            onChange={e => setFormData({...formData, categoryId: Number(e.target.value)})}
                         >
                            <option value={0}>Selecione...</option>
                             {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                     </div>
                </div>
                
                {/* Recurrence Section - Only show on Create */}
                {!editingId && (
                    <div className="bg-sky-950/30 p-3 rounded-lg border border-sky-900/50">
                        <label className="text-sm font-semibold text-sky-400 mb-2 block flex items-center gap-2">
                            <Repeat size={14}/> Recorrência
                        </label>
                        
                        <div className="flex items-center gap-4 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={formData.isFixed}
                                    onChange={e => setFormData({...formData, isFixed: e.target.checked})}
                                    className="w-4 h-4 text-sky-500 rounded bg-slate-800 border-slate-600"
                                />
                                <span className="text-sm text-slate-300">Lançamento Fixo Mensal</span>
                            </label>
                        </div>

                        {!formData.isFixed && (
                             <div className="flex items-center gap-2">
                                <CalendarDays className="text-slate-400" size={20}/>
                                <input 
                                    type="number" min="1" max="360"
                                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-center text-white"
                                    value={formData.installments}
                                    onChange={e => setFormData({...formData, installments: Number(e.target.value)})}
                                />
                                <span className="text-sm text-slate-400">parcelas</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800">Cancelar</button>
                    <button type="submit" className="flex-1 py-2 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover">Salvar</button>
                </div>
            </form>
          </div>
        </div>
       )}

       {/* Delete Logic Modal */}
       {deleteModal.isOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteModal({ isOpen: false, id: null })} />
                <div className="relative bg-surface border border-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in duration-200">
                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                        <Trash2 size={24}/>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Excluir Previsão</h3>
                    <p className="text-slate-400 mb-6 text-sm">Esta previsão parece fazer parte de uma recorrência. Como deseja excluir?</p>
                    
                    <div className="space-y-2">
                        <button onClick={() => confirmDelete('single')} className="w-full py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg font-medium text-sm">
                            Apenas esta previsão
                        </button>
                        <button onClick={() => confirmDelete('future')} className="w-full py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg font-medium text-sm">
                            Esta e as futuras
                        </button>
                        <button onClick={() => confirmDelete('all')} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm shadow-sm">
                            Todas as ocorrências
                        </button>
                    </div>
                    <button onClick={() => setDeleteModal({ isOpen: false, id: null })} className="mt-4 text-xs text-slate-500 hover:text-slate-300">Cancelar</button>
                </div>
           </div>
       )}
    </div>
  );
};

export default Forecasts;
