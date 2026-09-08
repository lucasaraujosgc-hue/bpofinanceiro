import React, { useState } from 'react';
import { Category, CategoryType } from '../types';
import { Plus, Trash2, Tag, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, HelpCircle } from 'lucide-react';

interface CategoriesProps {
  categories: Category[];
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: number) => void;
  onUpdateCategory?: (category: Category) => void;
}

// Grupos baseados na nova estrutura de DRE e Seed do server.js
const INCOME_GROUPS = [
  {
    id: 'receita_bruta',
    label: 'Receita Bruta',
    desc: 'Receitas principais da atividade da empresa (vendas de mercadorias, prestação de serviços, comissões).'
  },
  {
    id: 'outras_receitas',
    label: 'Outras Receitas Operacionais',
    desc: 'Receitas acessórias relacionadas à operação (aluguéis, reembolsos, receitas eventuais da atividade).'
  },
  {
    id: 'receita_financeira',
    label: 'Receitas Financeiras',
    desc: 'Rendimentos financeiros, juros recebidos, aplicações.'
  },
  {
    id: 'receita_nao_operacional',
    label: 'Receitas Não Operacionais',
    desc: 'Ganhos eventuais fora da atividade principal, como venda de ativo imobilizado.'
  },
  {
    id: 'nao_operacional',
    label: 'Movimentações Internas',
    desc: 'Aportes de sócios e transferências internas. Não representam receita e não afetam o lucro.'
  }
];

const EXPENSE_GROUPS = [
  {
    id: 'custo_operacional',
    label: 'Custos Operacionais (CMV / CSP)',
    desc: 'Custos diretamente ligados à venda ou prestação do serviço (compra de mercadorias, insumos, fretes de compra).'
  },
  {
    id: 'despesa_pessoal',
    label: 'Despesas com Pessoal',
    desc: 'Salários, pró-labore, encargos trabalhistas e previdenciários.'
  },
  {
    id: 'despesa_administrativa',
    label: 'Despesas Administrativas',
    desc: 'Gastos administrativos para manter a empresa funcionando (aluguel, escritório, contabilidade).'
  },
  {
    id: 'despesa_operacional',
    label: 'Despesas Operacionais',
    desc: 'Despesas ligadas à operação e vendas (marketing, sistemas, deslocamentos, manutenção).'
  },
  {
    id: 'impostos',
    label: 'Impostos sobre o Faturamento',
    desc: 'Tributos incidentes sobre a receita (DAS, ISS, ICMS). Reduzem a Receita Bruta.'
  },
  {
    id: 'despesa_financeira',
    label: 'Despesas Financeiras',
    desc: 'Juros, multas e tarifas bancárias.'
  },
  {
    id: 'nao_operacional',
    label: 'Despesas e Movimentações Não Operacionais',
    desc: 'Distribuição de lucros, serviços eventuais não operacionais e transferências internas. Não afetam o resultado operacional.'
  }
];

const Categories: React.FC<CategoriesProps> = ({ categories, onAddCategory, onDeleteCategory, onUpdateCategory }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>(CategoryType.EXPENSE);
  
  // Edit Group Modal State
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    
    // Default groups based on type
    const defaultGroup = newCategoryType === CategoryType.INCOME ? 'outras_receitas' : 'despesa_operacional';

    onAddCategory({
      name: newCategoryName,
      type: newCategoryType,
      groupType: defaultGroup
    });
    setNewCategoryName('');
  };

  const openConfigModal = (cat: Category) => {
      setEditingCategory(cat);
      setSelectedGroup(cat.groupType || (cat.type === CategoryType.INCOME ? 'outras_receitas' : 'despesa_operacional'));
  };

  const handleSaveGroup = () => {
      if (editingCategory && onUpdateCategory) {
          onUpdateCategory({
              ...editingCategory,
              groupType: selectedGroup
          });
          setEditingCategory(null);
      }
  };

  const incomeCategories = categories.filter(c => c.type === CategoryType.INCOME);
  const expenseCategories = categories.filter(c => c.type === CategoryType.EXPENSE);

  const getGroupLabel = (groupId?: string, type?: CategoryType) => {
      if (!groupId) return 'Não Configurado';
      const list = type === CategoryType.INCOME ? INCOME_GROUPS : EXPENSE_GROUPS;
      const found = list.find(g => g.id === groupId);
      if (found) return found.label;
      
      // Caso não encontre pelo ID (IDs antigos ou customizados), formata o ID amigavelmente
      return groupId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const activeGroupList = editingCategory?.type === CategoryType.INCOME ? INCOME_GROUPS : EXPENSE_GROUPS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Categorias</h1>
        <p className="text-muted">Gerencie as categorias de receitas e despesas</p>
      </div>

      {/* Add New Category Form */}
      <div className="bg-surface p-6 rounded-xl border border-line shadow-sm">
        <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
           <Plus className="text-brand" size={20}/> Nova Categoria
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
                <label className="text-sm font-medium text-muted block mb-1">Nome da Categoria</label>
                <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none text-ink placeholder-faint"
                    placeholder="Ex: Marketing Digital"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                />
            </div>
            <div className="w-full md:w-48">
                <label className="text-sm font-medium text-muted block mb-1">Tipo</label>
                <select 
                    className="w-full px-4 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none text-ink"
                    value={newCategoryType}
                    onChange={(e) => setNewCategoryType(e.target.value as CategoryType)}
                >
                    <option value={CategoryType.EXPENSE}>Despesa</option>
                    <option value={CategoryType.INCOME}>Receita</option>
                </select>
            </div>
            <button 
                type="submit"
                className="w-full md:w-auto px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium transition-colors shadow-sm"
            >
                Adicionar
            </button>
        </form>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Income List */}
          <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden flex flex-col h-full">
             <div className="px-6 py-4 border-b border-line bg-ok/10 flex items-center gap-2">
                 <ArrowUpCircle className="text-ok" size={20} />
                 <h3 className="font-bold text-ink">Categorias de Receita</h3>
                 <span className="ml-auto bg-brand/10 text-white text-xs font-bold px-2 py-1 rounded-full border border-ok/20">
                     {incomeCategories.length}
                 </span>
             </div>
             <div className="flex-1 overflow-y-auto max-h-[500px] custom-scroll">
                 {incomeCategories.length === 0 ? (
                     <div className="p-8 text-center text-faint">Nenhuma categoria cadastrada.</div>
                 ) : (
                     <ul className="divide-y divide-line">
                         {incomeCategories.map(cat => (
                             <li key={cat.id} className="px-6 py-3 flex justify-between items-center hover:bg-sunken/60 group transition-colors">
                                 <div>
                                     <span className="text-muted font-medium block">{cat.name}</span>
                                     <span className="text-[10px] text-faint uppercase tracking-wide">
                                         {getGroupLabel(cat.groupType, CategoryType.INCOME)}
                                     </span>
                                 </div>
                                 <div className="flex gap-2">
                                     <button 
                                        onClick={() => openConfigModal(cat)}
                                        className="p-1.5 text-faint hover:text-white hover:bg-info/10 rounded transition-colors"
                                        title="Configurar Grupo"
                                     >
                                         <Settings size={16} />
                                     </button>
                                     <button 
                                        onClick={() => onDeleteCategory(cat.id)}
                                        className="p-1.5 text-faint hover:text-white hover:bg-danger/10 rounded transition-colors"
                                        title="Excluir"
                                     >
                                         <Trash2 size={16} />
                                     </button>
                                 </div>
                             </li>
                         ))}
                     </ul>
                 )}
             </div>
          </div>

          {/* Expense List */}
          <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden flex flex-col h-full">
             <div className="px-6 py-4 border-b border-line bg-danger/10 flex items-center gap-2">
                 <ArrowDownCircle className="text-danger" size={20} />
                 <h3 className="font-bold text-ink">Categorias de Despesa</h3>
                 <span className="ml-auto bg-danger/10 text-white text-xs font-bold px-2 py-1 rounded-full border border-danger/20">
                     {expenseCategories.length}
                 </span>
             </div>
             <div className="flex-1 overflow-y-auto max-h-[500px] custom-scroll">
                 {expenseCategories.length === 0 ? (
                     <div className="p-8 text-center text-faint">Nenhuma categoria cadastrada.</div>
                 ) : (
                     <ul className="divide-y divide-line">
                         {expenseCategories.map(cat => (
                             <li key={cat.id} className="px-6 py-3 flex justify-between items-center hover:bg-sunken/60 group transition-colors">
                                 <div>
                                     <span className="text-muted font-medium block">{cat.name}</span>
                                     <span className="text-[10px] text-faint uppercase tracking-wide">
                                         {getGroupLabel(cat.groupType, CategoryType.EXPENSE)}
                                     </span>
                                 </div>
                                 <div className="flex gap-2">
                                     <button 
                                        onClick={() => openConfigModal(cat)}
                                        className="p-1.5 text-faint hover:text-white hover:bg-info/10 rounded transition-colors"
                                        title="Configurar Grupo"
                                     >
                                         <Settings size={16} />
                                     </button>
                                     <button 
                                        onClick={() => onDeleteCategory(cat.id)}
                                        className="p-1.5 text-faint hover:text-white hover:bg-danger/10 rounded transition-colors"
                                        title="Excluir"
                                     >
                                         <Trash2 size={16} />
                                     </button>
                                 </div>
                             </li>
                         ))}
                     </ul>
                 )}
             </div>
          </div>
      </div>

      {/* Config Modal */}
      {editingCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingCategory(null)} />
              <div className="relative bg-surface border border-line rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                          <Settings size={20} className="text-brand"/> Configurar Categoria
                      </h3>
                      <button onClick={() => setEditingCategory(null)}><X size={20} className="text-muted hover:text-ink"/></button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-semibold text-faint uppercase">Categoria</label>
                          <p className="text-ink font-medium text-lg">{editingCategory.name}</p>
                      </div>
                      
                      <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                              <label className="text-sm font-medium text-muted">Grupo Contábil</label>
                              <div className="group relative">
                                  <HelpCircle size={16} className="text-faint cursor-help hover:text-brand transition-colors"/>
                                  <div className="absolute left-full top-0 ml-2 w-64 bg-sunken border border-line p-3 rounded-lg shadow-xl text-xs text-muted z-50 hidden group-hover:block">
                                      <p className="font-bold text-ink mb-2 border-b border-line pb-1">Guia de Grupos</p>
                                      <ul className="space-y-1.5">
                                          {activeGroupList.map(g => (
                                              <li key={g.id}>
                                                  <span className="text-brand font-semibold block">{g.label}</span>
                                                  <span className="opacity-80">{g.desc}</span>
                                              </li>
                                          ))}
                                      </ul>
                                  </div>
                              </div>
                          </div>
                          
                          <select 
                              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-ink outline-none focus:border-brand"
                              value={selectedGroup}
                              onChange={(e) => setSelectedGroup(e.target.value)}
                          >
                              {activeGroupList.map(g => (
                                  <option key={g.id} value={g.id}>{g.label}</option>
                              ))}
                          </select>
                          <p className="text-xs text-faint mt-2">
                              Isso define onde esta categoria aparecerá no Demonstrativo de Resultados (DRE).
                          </p>
                      </div>

                      <div className="flex gap-3 pt-4">
                          <button onClick={() => setEditingCategory(null)} className="flex-1 py-2 border border-line text-muted rounded-lg hover:bg-sunken">Cancelar</button>
                          <button onClick={handleSaveGroup} className="flex-1 py-2 bg-brand text-white font-bold rounded-lg hover:bg-brand-strong flex justify-center items-center gap-2">
                              <Save size={18}/> Salvar
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Categories;