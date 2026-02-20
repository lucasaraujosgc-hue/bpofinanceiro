import React, { useState } from 'react';
import { Category, TransactionType, KeywordRule, CategoryType, Bank } from '../types';
import { Plus, Trash2, Search, ArrowRight, Globe } from 'lucide-react';

interface KeywordRulesProps {
  categories: Category[];
  rules: KeywordRule[];
  banks: Bank[];
  onAddRule: (rule: Omit<KeywordRule, 'id'>) => void;
  onDeleteRule: (id: number) => void;
}

const KeywordRules: React.FC<KeywordRulesProps> = ({ categories, rules, banks, onAddRule, onDeleteRule }) => {
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<TransactionType>(TransactionType.DEBIT);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [bankId, setBankId] = useState<number | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || categoryId === 0) return alert("Preencha todos os campos.");

    onAddRule({
        keyword: keyword.trim(),
        type,
        categoryId,
        bankId: bankId === 'all' ? null : Number(bankId)
    });
    setKeyword('');
    setCategoryId(0);
    setBankId('all');
  };

  const filteredCategories = categories.filter(c => 
    type === TransactionType.CREDIT ? c.type === CategoryType.INCOME : c.type === CategoryType.EXPENSE
  );

  const filteredRules = rules.filter(r => r.keyword.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Regras de Importação</h1>
        <p className="text-slate-400">Categorize automaticamente seus lançamentos importados com base em palavras-chave</p>
      </div>

      {/* Add Rule Form */}
      <div className="bg-surface p-6 rounded-xl border border-slate-800 shadow-sm">
         <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Plus className="text-primary" size={20}/> Nova Regra
         </h2>
         <form onSubmit={handleSubmit} className="flex flex-col gap-4">
             <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium text-slate-400">Palavra-Chave no Extrato</label>
                    <input 
                        type="text" 
                        placeholder="Ex: PIX ENVIADO, iFood, Uber..."
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white placeholder-slate-600"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48 space-y-1">
                    <label className="text-sm font-medium text-slate-400">Vincular a Banco</label>
                    <select 
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white"
                        value={bankId}
                        onChange={e => setBankId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    >
                        <option value="all">Todos os Bancos</option>
                        {banks.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>
             </div>
             
             <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-32 space-y-1">
                    <label className="text-sm font-medium text-slate-400">Tipo</label>
                    <select 
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white"
                        value={type}
                        onChange={e => { setType(e.target.value as TransactionType); setCategoryId(0); }}
                    >
                        <option value={TransactionType.DEBIT}>Despesa</option>
                        <option value={TransactionType.CREDIT}>Receita</option>
                    </select>
                </div>
                <div className="flex-1 w-full space-y-1">
                    <label className="text-sm font-medium text-slate-400">Vincular Categoria</label>
                    <select 
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white"
                        value={categoryId}
                        onChange={e => setCategoryId(Number(e.target.value))}
                    >
                        <option value={0}>Selecione...</option>
                        {filteredCategories.sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <button 
                    type="submit"
                    className="w-full md:w-auto px-6 py-2 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover font-medium transition-colors shadow-sm"
                >
                    Adicionar
                </button>
             </div>
         </form>
      </div>

      {/* Rules List */}
      <div className="bg-surface rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
             <h3 className="font-semibold text-slate-200">Regras Ativas</h3>
             <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14}/>
                 <input 
                    type="text" 
                    placeholder="Buscar regra..."
                    className="pl-9 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white outline-none focus:border-slate-500"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                 />
             </div>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800">
                      <tr>
                          <th className="px-6 py-4">Banco</th>
                          <th className="px-6 py-4">Palavra-Chave</th>
                          <th className="px-6 py-4">Tipo</th>
                          <th className="px-6 py-4">Categoria</th>
                          <th className="px-6 py-4 text-center">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                      {filteredRules.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-8 text-slate-500">Nenhuma regra encontrada.</td></tr>
                      ) : (
                          filteredRules.map(rule => {
                              const category = categories.find(c => c.id === rule.categoryId);
                              const bank = banks.find(b => b.id === rule.bankId);
                              
                              return (
                                  <tr key={rule.id} className="hover:bg-slate-800/50">
                                      <td className="px-6 py-4">
                                          {bank ? (
                                              <div className="flex items-center gap-2 text-slate-300">
                                                  <img src={bank.logo} className="w-5 h-5 rounded-full object-contain bg-white p-0.5" />
                                                  <span className="text-xs">{bank.nickname || bank.name}</span>
                                              </div>
                                          ) : (
                                              <div className="flex items-center gap-2 text-slate-500">
                                                  <Globe size={16} />
                                                  <span className="text-xs">Todos</span>
                                              </div>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 font-mono text-slate-300">"{rule.keyword}"</td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2 py-1 rounded text-xs font-bold border ${rule.type === TransactionType.CREDIT ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                                              {rule.type === TransactionType.CREDIT ? 'Receita' : 'Despesa'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 flex items-center gap-2 text-slate-300">
                                          <ArrowRight size={14} className="text-slate-500"/>
                                          {category?.name || 'Categoria Desconhecida'}
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <button 
                                            onClick={() => onDeleteRule(rule.id)}
                                            className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                            title="Excluir Regra"
                                          >
                                              <Trash2 size={16}/>
                                          </button>
                                      </td>
                                  </tr>
                              )
                          })
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default KeywordRules;