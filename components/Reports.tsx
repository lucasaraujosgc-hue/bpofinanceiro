import React, { useState, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Line } from 'recharts';
import { ChevronLeft, ChevronRight, Filter, Download, CalendarRange, Percent, Activity, TrendingUp, Info, Target, AlertCircle, CheckCircle, Construction } from 'lucide-react';

interface ReportsProps {
  token: string;
  transactions: Transaction[];
  categories: Category[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const Reports: React.FC<ReportsProps> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<'cashflow' | 'dre' | 'analysis' | 'forecasts'>('cashflow');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [cycleData, setCycleData] = useState<any[]>([]);

  // States for Dailoy Flow Chart (Cash Cycle)
  const [cycleStartDate, setCycleStartDate] = useState(() => {
      const date = new Date();
      date.setDate(1); // First day of current month
      return date.toISOString().split('T')[0];
  });
  const [cycleEndDate, setCycleEndDate] = useState(() => {
      const date = new Date();
      return date.toISOString().split('T')[0];
  });

  const getHeaders = () => {
      return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
      };
  };

  // Sync Cycle Dates with Selected Month
  useEffect(() => {
      const start = new Date(year, month, 1);
      // Last day of month: day 0 of next month
      const end = new Date(year, month + 1, 0);
      
      // Fix Timezone Offset for input type=date
      const formatDate = (d: Date) => {
          const offset = d.getTimezoneOffset();
          const correctedDate = new Date(d.getTime() - (offset * 60 * 1000));
          return correctedDate.toISOString().split('T')[0];
      };

      setCycleStartDate(formatDate(start));
      setCycleEndDate(formatDate(end));
  }, [year, month]);

  // Helper to fetch data based on active tab
  const fetchData = async () => {
      setLoading(true);
      setData(null); // Clear data immediately to avoid stale render crash
      
      let endpoint = '';
      if (activeTab === 'cashflow') endpoint = `/api/reports/cash-flow?year=${year}&month=${month}`;
      // DRE and Analysis endpoints skipped since they are "In Development" for the UI part, 
      // but logic remains if needed later. For now, fetch forecast if tab is forecasts.
      if (activeTab === 'forecasts') endpoint = `/api/reports/forecasts?year=${year}&month=${month}`;

      if (!endpoint) {
          setLoading(false);
          return;
      }

      try {
          const res = await fetch(endpoint, {
              headers: getHeaders()
          });
          if (res.ok) {
              setData(await res.json());
          }
      } catch (error) {
          console.error(error);
      } finally {
          setLoading(false);
      }
  };

  const fetchCycleData = async () => {
      try {
          const res = await fetch(`/api/reports/daily-flow?startDate=${cycleStartDate}&endDate=${cycleEndDate}`, {
              headers: getHeaders()
          });
          if (res.ok) {
              setCycleData(await res.json());
          }
      } catch (error) {
          console.error("Failed to fetch daily flow", error);
      }
  };

  // Initial Fetch & On Change
  useEffect(() => {
      fetchData();
  }, [activeTab, year, month]);

  // Fetch Cycle Data when tab is cashflow or dates change
  useEffect(() => {
      if (activeTab === 'cashflow') {
          fetchCycleData();
      }
  }, [activeTab, cycleStartDate, cycleEndDate]);

  // Fixed Navigation Logic
  const handlePrevMonth = () => {
      if (month === 0) {
          setMonth(11);
          setYear(prev => prev - 1);
      } else {
          setMonth(prev => prev - 1);
      }
  };

  const handleNextMonth = () => {
      if (month === 11) {
          setMonth(0);
          setYear(prev => prev + 1);
      } else {
          setMonth(prev => prev + 1);
      }
  };

  const renderCashFlow = () => {
      if (!data || typeof data.totalReceitas === 'undefined') return null;
      
      return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Cards Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-surface p-4 rounded-xl border border-slate-800">
                      <p className="text-slate-400 text-sm">Saldo Inicial</p>
                      <p className="text-xl font-bold text-white">R$ {data.startBalance.toFixed(2)}</p>
                  </div>
                  <div className="bg-surface p-4 rounded-xl border border-slate-800">
                      <p className="text-emerald-400 text-sm">Receitas</p>
                      <p className="text-xl font-bold text-emerald-500">+ R$ {data.totalReceitas.toFixed(2)}</p>
                  </div>
                  <div className="bg-surface p-4 rounded-xl border border-slate-800">
                      <p className="text-rose-400 text-sm">Despesas</p>
                      <p className="text-xl font-bold text-rose-500">- R$ {data.totalDespesas.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                      <p className="text-sky-400 text-sm">Saldo Final</p>
                      <p className={`text-xl font-bold ${data.endBalance >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                          R$ {data.endBalance.toFixed(2)}
                      </p>
                  </div>
              </div>

              {/* Cash Cycle Chart (Evolution) */}
              <div className="bg-surface p-6 rounded-xl border border-slate-800">
                  <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                      <div>
                          <h3 className="text-white font-bold text-lg flex items-center gap-2">
                              <CalendarRange className="text-primary" size={20}/> Evolução Diária do Caixa
                          </h3>
                          <p className="text-slate-400 text-sm">Entradas e saídas de dinheiro por data específica</p>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-700">
                          <input 
                            type="date" 
                            className="bg-transparent text-white text-sm outline-none border-b border-slate-600 focus:border-primary pb-1"
                            value={cycleStartDate}
                            onChange={(e) => setCycleStartDate(e.target.value)}
                          />
                          <span className="text-slate-500 text-xs">até</span>
                          <input 
                            type="date" 
                            className="bg-transparent text-white text-sm outline-none border-b border-slate-600 focus:border-primary pb-1"
                            value={cycleEndDate}
                            onChange={(e) => setCycleEndDate(e.target.value)}
                          />
                      </div>
                  </div>
                  
                  <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={cycleData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                              <XAxis 
                                dataKey="date" 
                                tickFormatter={(str) => str ? str.split('-').slice(1).join('/') : ''}
                                tick={{fill: '#94a3b8', fontSize: 12}}
                              />
                              <YAxis hide />
                              <Tooltip 
                                  contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px'}}
                                  labelFormatter={(label) => new Date(label).toLocaleDateString('pt-BR')}
                              />
                              <Legend />
                              <Bar dataKey="income" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                              <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                              <Line type="monotone" dataKey="net" name="Resultado Líquido" stroke="#3b82f6" strokeWidth={2} dot={{r: 4}} />
                          </ComposedChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* Pies */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Income Chart */}
                  <div className="bg-surface p-6 rounded-xl border border-slate-800">
                      <h3 className="text-white font-semibold mb-4">Receitas por Categoria</h3>
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie data={data.receitasByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#10b981">
                                      {data.receitasByCategory.map((_: any, index: number) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                  </Pie>
                                  <Tooltip contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b'}} />
                                  <Legend />
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* Expense Chart */}
                  <div className="bg-surface p-6 rounded-xl border border-slate-800">
                      <h3 className="text-white font-semibold mb-4">Despesas por Categoria</h3>
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie data={data.despesasByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#ef4444">
                                      {data.despesasByCategory.map((_: any, index: number) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                  </Pie>
                                  <Tooltip contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b'}} />
                                  <Legend />
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const renderUnderConstruction = () => (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 border-dashed animate-in fade-in zoom-in duration-300">
          <div className="p-6 rounded-full bg-slate-800 mb-4 text-amber-500">
              <Construction size={48} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Em Desenvolvimento</h2>
          <p className="text-slate-400 text-center max-w-md">
              Estamos trabalhando para trazer uma visualização gerencial ainda mais detalhada.
              <br/>Esta funcionalidade estará disponível em breve.
          </p>
      </div>
  );

  const renderForecasts = () => {
      if (!data || !data.summary) return null;

      const chartData = [
          {
              name: 'Receitas',
              Previsto: data.summary.predictedIncome,
              Realizado: data.summary.realizedIncome,
              Pendente: data.summary.pendingIncome
          },
          {
              name: 'Despesas',
              Previsto: data.summary.predictedExpense,
              Realizado: data.summary.realizedExpense,
              Pendente: data.summary.pendingExpense
          }
      ];

      return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-surface p-6 rounded-xl border border-slate-800 shadow-sm">
                      <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                          <Target size={20}/> Receitas Previstas
                      </h3>
                      <div className="flex justify-between items-end mb-2">
                          <div>
                              <p className="text-slate-400 text-xs uppercase">Total Previsto</p>
                              <p className="text-2xl font-bold text-white">R$ {data.summary.predictedIncome.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-slate-400 text-xs uppercase">Realizado</p>
                              <p className="text-xl font-bold text-emerald-500">
                                  {data.summary.predictedIncome > 0 ? ((data.summary.realizedIncome / data.summary.predictedIncome) * 100).toFixed(1) : 0}%
                              </p>
                          </div>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${data.summary.predictedIncome > 0 ? (data.summary.realizedIncome / data.summary.predictedIncome) * 100 : 0}%` }}></div>
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-slate-500">
                          <span>Realizado: R$ {data.summary.realizedIncome.toFixed(2)}</span>
                          <span>Pendente: R$ {data.summary.pendingIncome.toFixed(2)}</span>
                      </div>
                  </div>

                  <div className="bg-surface p-6 rounded-xl border border-slate-800 shadow-sm">
                      <h3 className="text-rose-400 font-bold mb-4 flex items-center gap-2">
                          <Target size={20}/> Despesas Previstas
                      </h3>
                      <div className="flex justify-between items-end mb-2">
                          <div>
                              <p className="text-slate-400 text-xs uppercase">Total Previsto</p>
                              <p className="text-2xl font-bold text-white">R$ {data.summary.predictedExpense.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-slate-400 text-xs uppercase">Realizado</p>
                              <p className="text-xl font-bold text-rose-500">
                                  {data.summary.predictedExpense > 0 ? ((data.summary.realizedExpense / data.summary.predictedExpense) * 100).toFixed(1) : 0}%
                              </p>
                          </div>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${data.summary.predictedExpense > 0 ? (data.summary.realizedExpense / data.summary.predictedExpense) * 100 : 0}%` }}></div>
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-slate-500">
                          <span>Realizado: R$ {data.summary.realizedExpense.toFixed(2)}</span>
                          <span>Pendente: R$ {data.summary.pendingExpense.toFixed(2)}</span>
                      </div>
                  </div>
              </div>

              {/* Comparative Chart */}
              <div className="bg-surface p-6 rounded-xl border border-slate-800 shadow-sm">
                  <h3 className="text-white font-semibold mb-6">Comparativo Previsto vs Realizado</h3>
                  <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                              <XAxis dataKey="name" tick={{fill: '#94a3b8'}} />
                              <YAxis hide />
                              <Tooltip 
                                  contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px'}}
                                  cursor={{fill: '#1e293b', opacity: 0.4}}
                              />
                              <Legend />
                              <Bar dataKey="Previsto" fill="#64748b" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="Realizado" fill="#10b981" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="Pendente" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* List of Pending Items */}
              <div className="bg-surface rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800 bg-amber-900/10 flex justify-between items-center">
                      <h3 className="font-bold text-amber-500 flex items-center gap-2">
                          <AlertCircle size={20}/> Itens Pendentes neste Mês
                      </h3>
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded border border-amber-500/30">
                          Ação Necessária
                      </span>
                  </div>
                  <div className="overflow-x-auto max-h-80 custom-scroll">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-950 text-slate-400 font-medium sticky top-0">
                              <tr>
                                  <th className="px-6 py-3">Dia</th>
                                  <th className="px-6 py-3">Descrição</th>
                                  <th className="px-6 py-3">Categoria</th>
                                  <th className="px-6 py-3 text-right">Valor</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                              {data.items.filter((i: any) => !i.realized).length === 0 ? (
                                  <tr><td colSpan={4} className="px-6 py-8 text-center text-emerald-500 font-medium">Tudo realizado! Nenhuma pendência.</td></tr>
                              ) : (
                                  data.items.filter((i: any) => !i.realized).map((item: any) => (
                                      <tr key={item.id} className="hover:bg-slate-800/30">
                                          <td className="px-6 py-3 text-slate-400 font-mono">
                                              {item.date.split('-')[2]}
                                          </td>
                                          <td className="px-6 py-3 text-slate-200">{item.description}</td>
                                          <td className="px-6 py-3 text-slate-500 text-xs">{item.category_name || '-'}</td>
                                          <td className={`px-6 py-3 text-right font-bold ${item.type === 'credito' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                              R$ {item.value.toFixed(2)}
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios Financeiros</h1>
          <p className="text-slate-400">Análise completa da saúde financeira</p>
        </div>
        
        <div className="flex items-center gap-2 bg-surface p-1 rounded-lg border border-slate-800">
            <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-800 rounded text-slate-400"><ChevronLeft size={16}/></button>
            <div className="px-4 text-center min-w-[140px]">
                <span className="block text-xs text-slate-500 font-bold">MÊS DE REFERÊNCIA</span>
                <span className="block text-sm font-bold text-white">{MONTHS[month]} / {year}</span>
            </div>
            <button onClick={handleNextMonth} className="p-2 hover:bg-slate-800 rounded text-slate-400"><ChevronRight size={16}/></button>
        </div>
      </div>

      <div className="flex gap-1 bg-surface p-1 rounded-xl border border-slate-800 w-full md:w-fit overflow-x-auto custom-scroll">
          <button 
            onClick={() => { setActiveTab('cashflow'); setData(null); }}
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'cashflow' ? 'bg-primary text-slate-900 shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              Fluxo de Caixa
          </button>
          <button 
            onClick={() => { setActiveTab('forecasts'); setData(null); }}
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'forecasts' ? 'bg-primary text-slate-900 shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              Previsões
          </button>
          <button 
            onClick={() => { setActiveTab('dre'); setData(null); }}
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'dre' ? 'bg-primary text-slate-900 shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              DRE Gerencial
          </button>
          <button 
            onClick={() => { setActiveTab('analysis'); setData(null); }}
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'analysis' ? 'bg-primary text-slate-900 shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              Análise Detalhada
          </button>
      </div>

      <div className="min-h-[400px]">
          {loading ? (
              <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
          ) : (
              <>
                {activeTab === 'cashflow' && renderCashFlow()}
                {activeTab === 'forecasts' && renderForecasts()}
                {activeTab === 'dre' && renderUnderConstruction()}
                {activeTab === 'analysis' && renderUnderConstruction()}
              </>
          )}
      </div>
    </div>
  );
};

export default Reports;