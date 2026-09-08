import React, { useState } from 'react';
import { Category, CategoryType } from '../types';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, HelpCircle } from 'lucide-react';

interface CategoriesProps {
  categories: Category[];
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: number) => void;
  onUpdateCategory?: (category: Category) => void;
}

// Grupos contábeis — precisam bater com ACCOUNTING_GROUPS no server.js.
// A ordem aqui é a ordem em que aparecem no DRE.
const INCOME_GROUPS = [
  { id: 'receita_bruta', label: 'Receita Bruta', desc: 'Receita principal da atividade: vendas de mercadorias, prestação de serviços, comissões.' },
  { id: 'outras_receitas', label: 'Outras Receitas Operacionais', desc: 'Receitas acessórias ligadas à operação: aluguéis, reembolsos, receitas eventuais da atividade. Entram no resultado operacional.' },
  { id: 'receita_financeira', label: 'Receitas Financeiras', desc: 'Juros recebidos, rendimentos de aplicações. Compõem o Resultado Financeiro.' },
  { id: 'receita_nao_operacional', label: 'Receitas Não Operacionais', desc: 'Ganhos fora da atividade principal: venda de ativo imobilizado, indenizações.' },
  { id: 'nao_operacional', label: 'Movimentações Patrimoniais / Internas', desc: 'Aportes de sócios, empréstimos recebidos, transferências entre contas. NÃO entram no DRE.' },
];

const EXPENSE_GROUPS = [
  { id: 'impostos', label: 'Impostos sobre Vendas (Deduções)', desc: 'Tributos sobre o faturamento: DAS, ISS, ICMS, PIS/COFINS. Reduzem a Receita Bruta.' },
  { id: 'custo_operacional', label: 'Custos (CMV / CPV / CSP)', desc: 'Custo direto do que foi vendido: compra de mercadorias, insumos, matéria-prima, frete sobre compras.' },
  { id: 'despesa_com_vendas', label: 'Despesas com Vendas', desc: 'Gastos para vender: comissões, marketing, publicidade, frete sobre vendas.' },
  { id: 'despesa_pessoal', label: 'Despesas com Pessoal', desc: 'Salários, pró-labore, encargos (FGTS/INSS), benefícios.' },
  { id: 'despesa_administrativa', label: 'Despesas Administrativas', desc: 'Estrutura para a empresa funcionar: aluguel, energia, contabilidade, softwares, seguros.' },
  { id: 'despesa_operacional', label: 'Despesas Gerais e Operacionais', desc: 'Demais gastos da operação: combustível, deslocamento, manutenção e reparos.' },
  { id: 'despesa_financeira', label: 'Despesas Financeiras', desc: 'Juros pagos, multas, tarifas bancárias, taxas de maquininha. Compõem o Resultado Financeiro.' },
  { id: 'despesa_nao_operacional', label: 'Despesas Não Operacionais', desc: 'Perdas fora da atividade principal: baixa de ativo, perdas eventuais.' },
  { id: 'impostos_sobre_lucro', label: 'IRPJ e CSLL', desc: 'Imposto de renda e contribuição sobre o lucro (no Simples já vem embutido no DAS — deixe zerado).' },
  { id: 'nao_operacional', label: 'Movimentações Patrimoniais / Internas', desc: 'Distribuição de lucros, pagamento de empréstimos, compra de ativo, transferências entre contas. NÃO entram no DRE.' },
];

const BEHAVIORS = [
  { id: 'variavel', label: 'Variável', desc: 'Varia conforme o volume de vendas (matéria-prima, comissões, impostos sobre venda).' },
  { id: 'fixa', label: 'Fixa', desc: 'Independe do volume de vendas (aluguel, salários, softwares). Usada no ponto de equilíbrio.' },
];

const Categories: React.FC<CategoriesProps> = ({ categories, onAddCategory, onDeleteCategory, onUpdateCategory }) => {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CategoryType>(CategoryType.EXPENSE);
  const [editing, setEditing] = useState<Category | null>(null);
  const [group, setGroup] = useState('');
  const [behavior, setBehavior] = useState('variavel');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddCategory({
      name: newName.trim(),
      type: newType,
      groupType: newType === CategoryType.INCOME ? 'outras_receitas' : 'despesa_operacional',
      behaviorType: 'variavel',
    });
    setNewName('');
  };

  const openConfig = (cat: Category) => {
    setEditing(cat);
    setGroup(cat.groupType || (cat.type === CategoryType.INCOME ? 'outras_receitas' : 'despesa_operacional'));
    setBehavior(cat.behaviorType === 'fixa' ? 'fixa' : 'variavel');
  };

  const saveConfig = () => {
    if (editing && onUpdateCategory) {
      onUpdateCategory({ ...editing, groupType: group, behaviorType: behavior });
      setEditing(null);
    }
  };

  const income = categories.filter(c => c.type === CategoryType.INCOME);
  const expense = categories.filter(c => c.type === CategoryType.EXPENSE);
  const groupList = editing?.type === CategoryType.INCOME ? INCOME_GROUPS : EXPENSE_GROUPS;
  const showBehavior = editing?.type === CategoryType.EXPENSE &&
    ['custo_operacional', 'despesa_com_vendas', 'despesa_pessoal', 'despesa_administrativa', 'despesa_operacional'].includes(group);

  const groupLabel = (id?: string, type?: CategoryType) => {
    if (!id) return 'Não configurado';
    const found = (type === CategoryType.INCOME ? INCOME_GROUPS : EXPENSE_GROUPS).find(g => g.id === id);
    return found ? found.label : id.replace(/_/g, ' ');
  };

  const list = (items: Category[], type: CategoryType) => (
    <div className="flex-1 overflow-y-auto max-h-[520px] custom-scroll">
      {items.length === 0 ? (
        <div className="p-8 text-center text-faint text-sm">Nenhuma categoria.</div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map(cat => (
            <li key={cat.id} className="px-5 py-3 flex justify-between items-center hover:bg-sunken/50 group transition-colors">
              <div className="min-w-0">
                <span className="text-ink font-medium block truncate">{cat.name}</span>
                <span className="text-[10px] text-faint uppercase tracking-wide">
                  {groupLabel(cat.groupType, type)}
                  {cat.behaviorType === 'fixa' && <span className="ml-1.5 text-info">· fixa</span>}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openConfig(cat)} title="Configurar" className="p-1.5 text-faint hover:text-brand hover:bg-sunken rounded transition-colors">
                  <Settings size={15} />
                </button>
                <button onClick={() => onDeleteCategory(cat.id)} title="Excluir" className="p-1.5 text-faint hover:text-danger hover:bg-sunken rounded transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Categorias</h1>
        <p className="text-muted">Cada categoria é ligada a um grupo contábil, que define onde ela aparece no DRE.</p>
      </div>

      <div className="bg-surface p-5 rounded-xl border border-line">
        <h2 className="text-base font-semibold text-ink mb-4 flex items-center gap-2">
          <Plus className="text-brand" size={18} /> Nova categoria
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted block mb-1">Nome</label>
            <input
              type="text"
              className="w-full px-4 py-2 bg-sunken border border-line rounded-lg text-ink placeholder:text-faint outline-none focus:border-brand"
              placeholder="Ex: Assinatura de software"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </div>
          <div className="w-full md:w-44">
            <label className="text-xs font-medium text-muted block mb-1">Tipo</label>
            <select
              className="w-full px-4 py-2 bg-sunken border border-line rounded-lg text-ink outline-none focus:border-brand"
              value={newType}
              onChange={e => setNewType(e.target.value as CategoryType)}
            >
              <option value={CategoryType.EXPENSE}>Despesa</option>
              <option value={CategoryType.INCOME}>Receita</option>
            </select>
          </div>
          <button type="submit" className="px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium transition-colors">
            Adicionar
          </button>
        </form>
        <p className="text-xs text-faint mt-2">Depois, clique na engrenagem para escolher o grupo contábil.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-surface rounded-xl border border-line overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-line bg-ok/10 flex items-center gap-2">
            <ArrowUpCircle className="text-ok" size={18} />
            <h3 className="font-bold text-ink">Receitas</h3>
            <span className="ml-auto text-xs font-bold text-ok bg-ok/10 px-2 py-0.5 rounded-full border border-ok/20">{income.length}</span>
          </div>
          {list(income, CategoryType.INCOME)}
        </div>

        <div className="bg-surface rounded-xl border border-line overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-line bg-danger/10 flex items-center gap-2">
            <ArrowDownCircle className="text-danger" size={18} />
            <h3 className="font-bold text-ink">Despesas</h3>
            <span className="ml-auto text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full border border-danger/20">{expense.length}</span>
          </div>
          {list(expense, CategoryType.EXPENSE)}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative bg-surface border border-line rounded-xl shadow-lg w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <Settings size={18} className="text-brand" /> Configurar categoria
              </h3>
              <button onClick={() => setEditing(null)}><X size={18} className="text-muted hover:text-ink" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-faint uppercase">Categoria</span>
                <p className="text-ink font-medium text-lg">{editing.name}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-sm font-medium text-muted">Grupo contábil</label>
                  <div className="group relative">
                    <HelpCircle size={15} className="text-faint cursor-help hover:text-brand" />
                    <div className="absolute left-full top-0 ml-2 w-72 bg-surface border border-line p-3 rounded-lg shadow-lg text-xs text-muted z-50 hidden group-hover:block">
                      <p className="font-bold text-ink mb-2 border-b border-line pb-1">Guia de grupos</p>
                      <ul className="space-y-1.5 max-h-72 overflow-y-auto custom-scroll">
                        {groupList.map(g => (
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
                  className="w-full px-3 py-2 bg-sunken border border-line rounded-lg text-ink outline-none focus:border-brand"
                  value={group}
                  onChange={e => setGroup(e.target.value)}
                >
                  {groupList.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
                <p className="text-xs text-faint mt-1.5">{groupList.find(g => g.id === group)?.desc}</p>
              </div>

              {showBehavior && (
                <div>
                  <label className="text-sm font-medium text-muted block mb-1.5">Comportamento do custo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BEHAVIORS.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBehavior(b.id)}
                        className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                          behavior === b.id ? 'border-brand bg-brand/10 text-ink' : 'border-line text-muted hover:border-brand/40'
                        }`}
                      >
                        <span className="font-bold block">{b.label}</span>
                        <span className="opacity-80">{b.desc}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-faint mt-1.5">Usado no ponto de equilíbrio e na margem de contribuição.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)} className="flex-1 py-2 border border-line text-muted rounded-lg hover:bg-sunken">Cancelar</button>
                <button onClick={saveConfig} className="flex-1 py-2 bg-brand text-white font-semibold rounded-lg hover:bg-brand-strong flex justify-center items-center gap-2">
                  <Save size={16} /> Salvar
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
