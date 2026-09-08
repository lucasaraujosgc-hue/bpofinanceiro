import React, { useState } from 'react';
import { Transaction, TransactionType, Bank, Forecast, Category, CategoryType } from '../types';
import { Wallet, CheckCircle2, TrendingUp, TrendingDown, Plus, Minus, X, ThumbsUp, ThumbsDown, Repeat, CalendarDays, AlertTriangle, CalendarClock, Check, Trash2, ChevronLeft, ChevronRight, Calculator, Calendar, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardProps {
  token: string;

  userId: number;
  transactions: Transaction[];
  banks: Bank[];
  forecasts: Forecast[];
  categories: Category[];
  onRefresh: () => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ token, userId, transactions, banks, forecasts, categories, onRefresh }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  
  const [selectedBankForForecasts, setSelectedBankForForecasts] = useState<number | null>(null);
  const [realizeModal, setRealizeModal] = useState<{ isOpen: boolean; forecast: Forecast | null; date: string }>({
      isOpen: false,
      forecast: null,
      date: ''
  });

  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [integrationStats, setIntegrationStats] = useState<{ total_imported: number } | null>(null);

  React.useEffect(() => {
     fetch('/api/integration/settings', { headers: { 'Authorization': `Bearer ${token}` }})
     .then(res => res.json())
     .then(data => { if(data && data.total_imported !== undefined) setIntegrationStats(data); })
     .catch(e => console.error(e));
  }, [token, onRefresh]);

  const activeBanks = banks.filter(b => b.active);
  const activeBankIds = activeBanks.map(b => b.id);

  const [formData, setFormData] = useState({
      description: '',
      value: '',
      type: TransactionType.DEBIT,
      date: new Date().toISOString().split('T')[0],
      categoryId: 0,
      bankId: activeBanks[0]?.id || 0,
      installments: 1,
      isFixed: false
  });

  const startOfSelectedMonth = new Date(currentYear, currentMonth, 1);
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const getHeaders = () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
  });

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
    } else {
        setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
    } else {
        setCurrentMonth(currentMonth + 1);
    }
  };

  // --- Logic for Data Calculation ---

  const overdueForecasts = forecasts.filter(f => {
      const fDate = new Date(f.date);
      const fDateMidnight = new Date(fDate.getFullYear(), fDate.getMonth(), fDate.getDate());
      return fDateMidnight < startOfSelectedMonth && !f.realized && (!f.bankId || activeBankIds.includes(f.bankId));
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const allPendingForecasts = forecasts.filter(f => !f.realized && (!f.bankId || activeBankIds.includes(f.bankId)));

  const currentMonthTransactions = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && (!t.bankId || activeBankIds.includes(t.bankId));
  });

  const recentTransactions = [...currentMonthTransactions]
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

  const getTopCategories = (type: TransactionType) => {
      const filtered = currentMonthTransactions.filter(t => t.type === type);
      const total = filtered.reduce((acc, t) => acc + t.value, 0);
      
      const grouped = filtered.reduce((acc, t) => {
          const cat = categories.find(c => c.id === t.categoryId);
          const name = cat ? cat.name : 'Sem Categoria';
          acc[name] = (acc[name] || 0) + t.value;
          return acc;
      }, {} as Record<string, number>);

      return Object.entries(grouped)
          .map(([name, value]) => ({ 
              name, 
              value: Number(value), 
              percent: total > 0 ? (Number(value) / total) * 100 : 0 
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 4);
  };

  const topIncomeCategories = getTopCategories(TransactionType.CREDIT);
  const topExpenseCategories = getTopCategories(TransactionType.DEBIT);

  // GLOBAL BALANCE LOGIC (Only active banks or null banks)
  const allTimeIncome = transactions.filter(t => t.type === TransactionType.CREDIT && (!t.bankId || activeBankIds.includes(t.bankId))).reduce((acc, curr) => acc + curr.value, 0);
  const allTimeExpense = transactions.filter(t => t.type === TransactionType.DEBIT && (!t.bankId || activeBankIds.includes(t.bankId))).reduce((acc, curr) => acc + curr.value, 0);
  const totalBalance = allTimeIncome - allTimeExpense;

  const monthRealizedIncome = currentMonthTransactions.filter(t => t.type === TransactionType.CREDIT).reduce((acc, curr) => acc + curr.value, 0);
  const monthRealizedExpense = currentMonthTransactions.filter(t => t.type === TransactionType.DEBIT).reduce((acc, curr) => acc + curr.value, 0);

  const currentMonthForecasts = forecasts.filter(f => {
      const d = new Date(f.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && !f.realized && (!f.bankId || activeBankIds.includes(f.bankId));
  });

  const monthForecastIncome = currentMonthForecasts.filter(f => f.type === TransactionType.CREDIT).reduce((acc, curr) => acc + curr.value, 0);
  const monthForecastExpense = currentMonthForecasts.filter(f => f.type === TransactionType.DEBIT).reduce((acc, curr) => acc + curr.value, 0);

  const chartData = [
      { name: 'Receita', value: monthRealizedIncome },
      { name: 'Despesa', value: monthRealizedExpense },
  ];

  const openModal = (type: TransactionType) => {
      setFormData({
          description: '',
          value: '',
          type: type,
          date: new Date().toISOString().split('T')[0],
          categoryId: 0,
          bankId: activeBanks[0]?.id || 0,
          installments: 1,
          isFixed: false
      });
      setIsModalOpen(true);
  };

  const openRealizeModal = (forecast: Forecast) => {
      setRealizeModal({
          isOpen: true,
          forecast,
          date: forecast.date
      });
  };

  const confirmRealization = async () => {
      if (!realizeModal.forecast || !realizeModal.date) return;
      const forecast = realizeModal.forecast;
      const finalDate = realizeModal.date;

      try {
        await fetch(`/api/forecasts/${forecast.id}/realize`, { method: 'PATCH', headers: getHeaders() });
        const descSuffix = forecast.installmentTotal ? ` (${forecast.installmentCurrent}/${forecast.installmentTotal})` : (forecast.groupId ? ' (Recorrente)' : '');
        await fetch('/api/transactions', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                date: finalDate,
                description: forecast.description + descSuffix,
                value: forecast.value,
                type: forecast.type,
                categoryId: forecast.categoryId,
                bankId: forecast.bankId,
                reconciled: false
            })
        });
        await onRefresh();
        setRealizeModal({ isOpen: false, forecast: null, date: '' });
        if (overdueForecasts.length <= 1) setIsOverdueModalOpen(false);
      } catch (error) { alert("Erro ao efetivar previsão."); }
  };

  const handleDeleteForecast = async (id: number) => {
      if(!confirm('Excluir esta previsão pendente?')) return;
      try {
          await fetch(`/api/forecasts/${id}`, { method: 'DELETE', headers: getHeaders() });
          await onRefresh();
          if (overdueForecasts.length <= 1) setIsOverdueModalOpen(false);
      } catch (e) { alert("Erro ao excluir."); }
  };

  const handleDeleteTransaction = async (id: number) => {
      if(!confirm('Excluir este lançamento?')) return;
      try {
          await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers: getHeaders() });
          await onRefresh();
      } catch (e) { alert("Erro ao excluir."); }
  };

  const handleQuickSave = async (target: 'forecast' | 'transaction') => {
      if (!formData.description || !formData.value || !formData.bankId) return alert("Preencha todos os campos obrigatórios");
      const value = Math.abs(Number(formData.value));
      const groupId = Date.now().toString();
      const baseDate = new Date(formData.date);
      const installments = formData.isFixed ? 60 : Math.max(1, Math.floor(Number(formData.installments)));

      try {
          if (target === 'forecast') {
              for (let i = 0; i < installments; i++) {
                  const currentDate = new Date(baseDate);
                  currentDate.setMonth(baseDate.getMonth() + i);
                  const dateStr = currentDate.toISOString().split('T')[0];
                  const isRecurrent = installments > 1 || formData.isFixed;
                  
                  await fetch('/api/forecasts', {
                      method: 'POST', headers: getHeaders(),
                      body: JSON.stringify({
                          date: dateStr, description: formData.description, value: value, type: formData.type,
                          categoryId: Number(formData.categoryId), bankId: Number(formData.bankId),
                          installmentCurrent: i + 1, installmentTotal: formData.isFixed ? 0 : installments,
                          groupId: isRecurrent ? groupId : null, realized: false
                      })
                  });
              }
          } else {
              for (let i = 0; i < installments; i++) {
                  const currentDate = new Date(baseDate);
                  currentDate.setMonth(baseDate.getMonth() + i);
                  const dateStr = currentDate.toISOString().split('T')[0];
                  const isRecurrent = installments > 1 || formData.isFixed;
                  const currentInstallment = i + 1;
                  
                  if (i === 0) {
                      const descSuffix = isRecurrent ? (formData.isFixed ? ' (Fixo)' : ` (${currentInstallment}/${installments})`) : '';
                      await fetch('/api/transactions', {
                           method: 'POST', headers: getHeaders(),
                           body: JSON.stringify({
                               date: dateStr, description: formData.description + descSuffix, value: value, type: formData.type,
                               categoryId: Number(formData.categoryId), bankId: Number(formData.bankId), reconciled: false
                           })
                       });
                  } else {
                      await fetch('/api/forecasts', {
                          method: 'POST', headers: getHeaders(),
                          body: JSON.stringify({
                              date: dateStr, description: formData.description, value: value, type: formData.type,
                              categoryId: Number(formData.categoryId), bankId: Number(formData.bankId),
                              installmentCurrent: currentInstallment, installmentTotal: formData.isFixed ? 0 : installments,
                              groupId: isRecurrent ? groupId : null, realized: false
                          })
                      });
                  }
              }
          }
          
          setIsModalOpen(false);
          await onRefresh();
      } catch (error) { alert("Erro ao salvar"); }
  };

  const availableCategories = categories.filter(c => formData.type === TransactionType.CREDIT ? c.type === CategoryType.INCOME : c.type === CategoryType.EXPENSE);

  return (
    <div className="space-y-4 pb-4">
      {integrationStats && integrationStats.total_imported > 0 && (
          <div className="bg-info/10 border border-info/30 p-3 rounded-xl">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-info/20 text-white flex items-center justify-center border border-info/30">
                      <ShieldCheck size={16} />
                  </div>
                  <div>
                      <h3 className="font-bold text-info text-sm">Integração Contábil Ativa</h3>
                      <p className="text-xs text-info">Foram importadas {integrationStats.total_imported} notas fiscais até o momento.</p>
                  </div>
              </div>
          </div>
      )}

      {overdueForecasts.length > 0 && (
          <div onClick={() => setIsOverdueModalOpen(true)} className="bg-warn/10 border border-warn/30 p-3 rounded-xl cursor-pointer hover:bg-warn/10 transition-all group">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-warn/15 text-white flex items-center justify-center border border-warn/30">
                          <AlertTriangle size={16} />
                      </div>
                      <div>
                          <h3 className="font-bold text-warn text-sm">Pendências</h3>
                          <p className="text-xs text-warn">{overdueForecasts.length} previsões atrasadas.</p>
                      </div>
                  </div>
                  <div className="bg-warn text-white px-3 py-1 rounded-lg text-xs font-bold">Resolver</div>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-end gap-3">
        <div>
            <div className="flex items-center gap-2 mb-0.5">
                 <button onClick={handlePrevMonth} className="p-1 hover:bg-sunken rounded text-muted"><ChevronLeft size={16}/></button>
                 <span className="text-ink font-bold text-base capitalize">{MONTHS[currentMonth]} / {currentYear}</span>
                 <button onClick={handleNextMonth} className="p-1 hover:bg-sunken rounded text-muted"><ChevronRight size={16}/></button>
            </div>
            <p className="text-muted text-xs">Visão geral do fluxo de caixa</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => openModal(TransactionType.CREDIT)} className="w-9 h-9 rounded-lg bg-brand hover:bg-brand-strong text-white flex items-center justify-center shadow-lg transition-all" title="Nova Receita"><Plus size={20} /></button>
            <button onClick={() => openModal(TransactionType.DEBIT)} className="w-9 h-9 rounded-lg bg-danger hover:bg-danger text-white flex items-center justify-center shadow-lg transition-all" title="Nova Despesa"><Minus size={20} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl p-4 border border-line relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Wallet size={48} className="text-muted"/>
            </div>
            <div className="relative z-10">
                <p className="text-muted text-xs font-medium mb-1">Saldo Atual</p>
                <h2 className="text-2xl font-bold text-ink mb-1">R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                <p className="text-[10px] text-faint">Saldo consolidado (Inclui pendentes)</p>
            </div>
        </div>

        <div className="bg-surface rounded-xl p-4 border border-line relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <CheckCircle2 size={48} className="text-ok"/>
            </div>
            <div className="relative z-10">
                <p className="text-ok text-xs font-medium mb-1 flex items-center gap-1"><TrendingUp size={14}/> Receitas</p>
                <h2 className="text-2xl font-bold text-ok mb-1">R$ {monthRealizedIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                <p className="text-[10px] text-faint">Previsto: <span className="text-ok/70">+ R$ {monthForecastIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
            </div>
        </div>

        <div className="bg-surface rounded-xl p-4 border border-line relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ShieldCheck size={48} className="text-danger"/>
            </div>
            <div className="relative z-10">
                <p className="text-danger text-xs font-medium mb-1 flex items-center gap-1"><TrendingDown size={14}/> Despesas</p>
                <h2 className="text-2xl font-bold text-danger mb-1">R$ {monthRealizedExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                <p className="text-[10px] text-faint">Previsto: <span className="text-danger/70">+ R$ {monthForecastExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        <div className="bg-surface p-4 rounded-xl border border-line flex flex-col">
             <h3 className="font-bold text-ink mb-4 text-xs uppercase tracking-wider text-muted">Saldos por Banco</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto max-h-[300px] custom-scroll pr-1">
                {activeBanks.length === 0 ? (
                    <div className="col-span-2 text-center py-4 text-faint text-sm">Nenhum banco ativo. Cadastre uma conta.</div>
                ) : activeBanks.map(bank => {
                    const bankTransactions = transactions.filter(t => t.bankId === bank.id);
                    const bankBalance = bankTransactions.reduce((acc, t) => {
                        const val = Number(t.value);
                        const type = String(t.type).toLowerCase();
                        if (type.includes('credit') || type.includes('receita') || type === 'credito') return acc + val;
                        return acc - val;
                    }, 0);

                    const bankPendingForecasts = allPendingForecasts.filter(f => f.bankId === bank.id);
                    const forecastsTotal = bankPendingForecasts.reduce((acc, f) => {
                        const val = Number(f.value);
                        const type = String(f.type).toLowerCase();
                        if (type.includes('credit') || type.includes('receita') || type === 'credito') return acc + val;
                        return acc - val;
                    }, 0);

                    const projectedBalance = bankBalance + forecastsTotal;

                    return (
                        <div 
                            key={bank.id} 
                            onClick={() => setSelectedBankForForecasts(bank.id)}
                            className="p-3 rounded-lg border border-line bg-black/20 hover:bg-sunken/60 transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-md bg-white p-1 flex items-center justify-center overflow-hidden">
                                    <img src={bank.logo} alt={bank.name} className="max-w-full max-h-full object-contain" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-ink text-xs">{bank.name}</h4>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-faint">Atual</span>
                                    <span className={bankBalance >= 0 ? 'text-ok font-bold' : 'text-danger font-bold'}>
                                        R$ {bankBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-faint">Projetado</span>
                                    <span className={projectedBalance >= 0 ? 'text-muted' : 'text-muted'}>
                                        R$ {projectedBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
             </div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line flex flex-col">
            <h3 className="font-bold text-ink mb-4 text-xs uppercase tracking-wider text-muted">Receita x Despesa (Mensal)</h3>
            <div className="flex-1 w-full h-40">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="horizontal" barSize={40}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
                        <XAxis dataKey="name" tick={{fill: 'var(--color-faint)', fontSize: 10}} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip 
                            cursor={{fill: 'var(--color-sunken)', opacity: 0.3}}
                            contentStyle={{backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: '8px', color: 'var(--color-ink)', fontSize: '12px'}}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#ef4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* Analysis Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface p-4 rounded-xl border border-line">
              <h3 className="font-bold text-ink mb-4 text-xs uppercase tracking-wider text-muted">Análise de Receitas</h3>
              <div className="space-y-3">
                  {topIncomeCategories.map((cat, idx) => (
                      <div key={idx}>
                          <div className="flex justify-between items-center text-xs mb-1">
                              <span className="text-muted font-medium truncate max-w-[70%]">{cat.name}</span>
                              <span className="text-ok font-bold">R$ {cat.value.toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-sunken rounded-full h-1.5">
                              <div className="bg-brand h-1.5 rounded-full" style={{ width: `${cat.percent}%` }}></div>
                          </div>
                      </div>
                  ))}
                  {topIncomeCategories.length === 0 && <p className="text-faint text-xs italic">Sem receitas no mês.</p>}
              </div>
          </div>

          <div className="bg-surface p-4 rounded-xl border border-line">
              <h3 className="font-bold text-ink mb-4 text-xs uppercase tracking-wider text-muted">Análise de Despesas</h3>
              <div className="space-y-3">
                  {topExpenseCategories.map((cat, idx) => (
                      <div key={idx}>
                          <div className="flex justify-between items-center text-xs mb-1">
                              <span className="text-muted font-medium truncate max-w-[70%]">{cat.name}</span>
                              <span className="text-danger font-bold">R$ {cat.value.toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-sunken rounded-full h-1.5">
                              <div className="bg-danger h-1.5 rounded-full" style={{ width: `${cat.percent}%` }}></div>
                          </div>
                      </div>
                  ))}
                  {topExpenseCategories.length === 0 && <p className="text-faint text-xs italic">Sem despesas no mês.</p>}
              </div>
          </div>
      </div>

      <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex justify-between items-center bg-ground/50">
              <h3 className="font-bold text-ink text-xs uppercase tracking-wider text-muted">Últimos 5 Lançamentos - {MONTHS[currentMonth]} / {currentYear}</h3>
              <div className="flex gap-1">
                  <button onClick={handlePrevMonth} className="p-1 hover:bg-sunken rounded text-muted"><ChevronLeft size={14}/></button>
                  <button onClick={handleNextMonth} className="p-1 hover:bg-sunken rounded text-muted"><ChevronRight size={14}/></button>
              </div>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-ground text-muted font-medium border-b border-line">
                      <tr>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">Categoria</th>
                          <th className="px-4 py-3">Banco</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-center">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                      {recentTransactions.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-6 text-center text-faint">Nenhum lançamento neste mês.</td></tr>
                      ) : (
                          recentTransactions.map(t => {
                              const bank = banks.find(b => b.id === t.bankId);
                              const category = categories.find(c => c.id === t.categoryId);
                              return (
                                  <tr key={t.id} className="hover:bg-sunken/30">
                                      <td className="px-4 py-2 text-muted font-mono">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                                      <td className="px-4 py-2 text-ink font-medium">{t.description}</td>
                                      <td className="px-4 py-2 text-muted">{category?.name || '-'}</td>
                                      <td className="px-4 py-2 text-muted flex items-center gap-2">
                                          {bank && <img src={bank.logo} className="w-4 h-4 rounded-full bg-white p-0.5" />}
                                          {bank?.name || 'Desconhecido'}
                                      </td>
                                      <td className={`px-4 py-2 text-right font-bold ${t.type === TransactionType.CREDIT ? 'text-ok' : 'text-danger'}`}>
                                          {t.type === TransactionType.CREDIT ? '+' : '-'} R$ {t.value.toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2">
                                          {t.reconciled ? (
                                              <span className="flex items-center gap-1 text-ok text-[10px] font-bold"><CheckCircle2 size={12}/> Conciliado</span>
                                          ) : (
                                              <span className="flex items-center gap-1 text-faint text-[10px] font-bold"><CheckCircle2 size={12}/> Pendente</span>
                                          )}
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                          <button onClick={() => handleDeleteTransaction(t.id)} className="p-1 text-faint hover:text-danger transition-colors">
                                              <Trash2 size={14}/>
                                          </button>
                                      </td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          </div>
      </div>

       {isOverdueModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsOverdueModalOpen(false)} />
            <div className="relative bg-surface border border-warn/30 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-warn/20 bg-warn/10 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-warn/10 rounded-lg text-white">
                            <CalendarClock size={20}/>
                        </div>
                        <div>
                            <h3 className="font-bold text-ink">Pendências Anteriores</h3>
                            <p className="text-xs text-warn">Itens previstos até o mês passado não realizados</p>
                        </div>
                    </div>
                    <button onClick={() => setIsOverdueModalOpen(false)}><X size={20} className="text-muted hover:text-ink"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto max-h-[60vh] custom-scroll">
                    <table className="w-full text-sm text-left">
                        <thead className="text-muted font-medium border-b border-line">
                            <tr>
                                <th className="pb-3 pl-2">Data</th>
                                <th className="pb-3">Descrição</th>
                                <th className="pb-3 text-right">Valor</th>
                                <th className="pb-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {overdueForecasts.map(f => (
                                <tr key={f.id} className="hover:bg-sunken/30 transition-colors">
                                    <td className="py-3 pl-2 text-warn font-mono text-xs">
                                        {new Date(f.date).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="py-3 font-medium text-ink">
                                        {f.description}
                                        {f.installmentTotal ? (
                                            <span className="ml-2 text-xs bg-sunken px-1.5 py-0.5 rounded text-muted">
                                                {f.installmentCurrent}/{f.installmentTotal}
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className={`py-3 text-right font-bold ${f.type === TransactionType.DEBIT ? 'text-danger' : 'text-ok'}`}>
                                        R$ {f.value.toFixed(2)}
                                    </td>
                                    <td className="py-3 flex justify-center gap-2">
                                        <button 
                                            onClick={() => openRealizeModal(f)}
                                            className="p-1.5 bg-brand/10 text-white rounded hover:bg-brand/20 border border-ok/20"
                                            title="Efetivar Lançamento"
                                        >
                                            <Check size={16}/>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteForecast(f.id)}
                                            className="p-1.5 bg-danger/10 text-white rounded hover:bg-danger/20 border border-danger/20"
                                            title="Excluir Previsão"
                                        >
                                            <Trash2 size={16}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
         </div>
       )}

       {/* Quick Add Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-surface border border-line rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 text-ink">
            <div className={`px-6 py-4 border-b border-line flex justify-between items-center ${formData.type === TransactionType.CREDIT ? 'bg-ok/10' : 'bg-danger/10'}`}>
              <h3 className={`font-bold ${formData.type === TransactionType.CREDIT ? 'text-ok' : 'text-danger'}`}>
                  {formData.type === TransactionType.CREDIT ? 'Nova Receita' : 'Nova Despesa'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-muted hover:text-ink"/></button>
            </div>
            
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="text-sm text-muted font-medium">Data</label>
                         <input 
                            type="date"
                            className="w-full mt-1 bg-surface border border-line rounded-lg p-2 text-ink outline-none focus:border-brand"
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                         />
                     </div>
                     <div>
                         <label className="text-sm text-muted font-medium">Valor</label>
                         <input 
                            type="number" step="0.01" required
                            className={`w-full mt-1 bg-surface border border-line rounded-lg p-2 font-bold outline-none focus:border-brand ${formData.type === TransactionType.CREDIT ? 'text-ok' : 'text-danger'}`}
                            value={formData.value}
                            onChange={e => setFormData({...formData, value: e.target.value})}
                         />
                     </div>
                </div>
                <div>
                     <label className="text-sm text-muted font-medium">Descrição</label>
                     <input 
                        type="text" required
                        placeholder="Ex: Supermercado"
                        className="w-full mt-1 bg-surface border border-line rounded-lg p-2 text-ink outline-none focus:border-brand"
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                     />
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="text-sm text-muted font-medium">Banco</label>
                         <select 
                            className="w-full mt-1 bg-surface border border-line rounded-lg p-2 text-ink outline-none focus:border-brand"
                            value={formData.bankId}
                            onChange={e => setFormData({...formData, bankId: Number(e.target.value)})}
                         >
                             {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                         </select>
                     </div>
                     <div>
                         <label className="text-sm text-muted font-medium">Categoria</label>
                         <select 
                            className="w-full mt-1 bg-surface border border-line rounded-lg p-2 text-ink outline-none focus:border-brand"
                            value={formData.categoryId}
                            onChange={e => setFormData({...formData, categoryId: Number(e.target.value)})}
                         >
                            <option value={0}>Selecione...</option>
                             {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                     </div>
                </div>

                <div className="bg-surface p-3 rounded-lg border border-line">
                    <label className="text-xs font-semibold text-faint mb-2 block flex items-center gap-2">
                        <Repeat size={12}/> RECORRÊNCIA (OPCIONAL)
                    </label>
                    <div className="flex items-center gap-4 mb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={formData.isFixed}
                                onChange={e => setFormData({...formData, isFixed: e.target.checked})}
                                className="w-4 h-4 text-brand rounded border-line bg-sunken"
                            />
                            <span className="text-sm text-muted">Fixo Mensal</span>
                        </label>
                    </div>
                    {!formData.isFixed && (
                            <div className="flex items-center gap-2">
                            <CalendarDays className="text-faint" size={16}/>
                            <input 
                                type="number" min="1" max="360"
                                className="w-16 bg-ground border border-line rounded p-1 text-center text-sm text-ink"
                                value={formData.installments}
                                onChange={e => setFormData({...formData, installments: Number(e.target.value)})}
                            />
                            <span className="text-sm text-muted">parcelas</span>
                        </div>
                    )}
                </div>

                <div className="pt-2 flex gap-3">
                    <button type="button" onClick={() => handleQuickSave('forecast')} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 border border-line rounded-lg hover:bg-sunken text-muted transition-colors">
                        <ThumbsDown size={20} className="text-faint" />
                        <span className="text-xs font-semibold">Previsão (Futuro)</span>
                    </button>
                    <button type="button" onClick={() => handleQuickSave('transaction')} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-white rounded-lg shadow-sm transition-colors ${formData.type === TransactionType.CREDIT ? 'bg-brand hover:bg-brand-strong' : 'bg-danger hover:bg-danger'}`}>
                        <ThumbsUp size={20} />
                        <span className="text-xs font-semibold">{formData.installments > 1 || formData.isFixed ? 'Lançar 1ª + Previsões' : 'Lançamento (Hoje)'}</span>
                    </button>
                </div>
            </div>
          </div>
        </div>
       )}
    </div>
  );
};

export default Dashboard;