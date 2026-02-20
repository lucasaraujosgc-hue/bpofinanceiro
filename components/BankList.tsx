import React, { useState, useEffect } from 'react';
import { Bank, CreditCard, Transaction, TransactionType } from '../types';
import { Plus, Power, Edit2, X, Trash2, Archive, ChevronDown, ChevronUp, AlertCircle, CreditCard as CreditCardIcon, Calendar } from 'lucide-react';

interface BankListProps {
  banks: Bank[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  onUpdateBank: (bank: Bank) => void;
  onAddBank: (bank: Omit<Bank, 'id' | 'balance' | 'active'>) => void;
  onDeleteBank: (id: number) => void;
  onAddCreditCard: (card: Omit<CreditCard, 'id'>) => void;
  onUpdateCreditCard: (card: CreditCard) => void;
  onDeleteCreditCard: (id: number) => void;
}

interface BankCardProps {
    bank: Bank;
    onEdit: (bank: Bank) => void;
    onDelete: (id: number) => void;
}

interface CreditCardCardProps {
    card: CreditCard;
    bank: Bank | undefined;
    invoiceAmount: number;
    onEdit: (card: CreditCard) => void;
    onDelete: (id: number) => void;
}

const BankCard: React.FC<BankCardProps> = ({ bank, onEdit, onDelete }) => (
    <div 
        className={`group bg-surface rounded-xl p-6 border shadow-sm transition-all duration-200 relative overflow-hidden ${
            bank.active 
            ? 'border-slate-800 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20' 
            : 'border-slate-800/50 opacity-75 bg-slate-900/30'
        }`}
    >
        {!bank.active && (
            <div className="absolute top-0 right-0 bg-slate-800 text-slate-400 text-[10px] px-2 py-1 rounded-bl-lg border-b border-l border-slate-700 flex items-center gap-1">
                <Archive size={10} /> Arquivada
            </div>
        )}

        <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg bg-white p-2 border flex items-center justify-center overflow-hidden ${bank.active ? 'border-slate-700 shadow-sm' : 'border-slate-300 grayscale opacity-70'}`}>
                    <img src={bank.logo} alt={bank.name} className="max-w-full max-h-full object-contain" onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                    }}/>
                </div>
                <div>
                    <h3 className={`font-bold text-lg ${bank.active ? 'text-slate-200' : 'text-slate-400'}`}>{bank.name}</h3>
                    <p className="text-xs text-slate-500">{bank.nickname || 'Conta Corrente'}</p>
                </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button 
                    onClick={() => onEdit(bank)}
                    className="p-1.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Editar"
                >
                    <Edit2 size={16} />
                </button>
                <button 
                    onClick={() => onDelete(bank.id)}
                    className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Excluir Definitivamente"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
        
        <div className="space-y-3 mb-4">
            <div className="flex justify-between text-sm items-center p-2 bg-slate-900/50 rounded-lg border border-slate-800/50">
                <span className="text-slate-500 text-xs uppercase font-semibold">Conta / Agência</span>
                <span className="font-mono text-slate-300">{bank.accountNumber || '-'}</span>
            </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
            <span className="text-xs text-slate-500 font-semibold uppercase">Saldo Atual</span>
            <span className={`font-bold text-lg ${
                bank.balance >= 0 
                    ? (bank.active ? 'text-emerald-500' : 'text-emerald-500/70') 
                    : (bank.active ? 'text-rose-500' : 'text-rose-500/70')
            }`}>
                R$ {bank.balance.toFixed(2)}
            </span>
        </div>
    </div>
);

const CreditCardCard: React.FC<CreditCardCardProps> = ({ card, bank, invoiceAmount, onEdit, onDelete }) => (
    <div className="group bg-surface rounded-xl p-6 border border-slate-800 shadow-sm hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-900/10 transition-all duration-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-indigo-900/30 text-indigo-300 text-[10px] px-2 py-1 rounded-bl-lg border-b border-l border-indigo-500/20 flex items-center gap-1">
            <CreditCardIcon size={10} /> Cartão de Crédito
        </div>

        <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-white p-2 border border-slate-700 shadow-sm flex items-center justify-center overflow-hidden">
                    {bank ? (
                        <img src={bank.logo} alt={bank.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                        <CreditCardIcon className="text-slate-400" />
                    )}
                </div>
                <div>
                    <h3 className="font-bold text-lg text-slate-200">{card.name}</h3>
                    <p className="text-xs text-slate-500">{bank?.name || 'Banco Desconhecido'}</p>
                </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button 
                    onClick={() => onEdit(card)}
                    className="p-1.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Editar"
                >
                    <Edit2 size={16} />
                </button>
                <button 
                    onClick={() => onDelete(card.id)}
                    className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Excluir"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800/50 flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                    <Calendar size={10}/> Fechamento
                </span>
                <span className="font-mono text-slate-300 text-sm">Dia {card.closingDay}</span>
            </div>
            <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800/50 flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                    <Calendar size={10}/> Vencimento
                </span>
                <span className="font-mono text-slate-300 text-sm">Dia {card.dueDay}</span>
            </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
            <span className="text-xs text-slate-500 font-semibold uppercase">Fatura Atual</span>
            <span className="font-bold text-lg text-rose-500">
                R$ {invoiceAmount.toFixed(2)}
            </span>
        </div>
        {card.limitValue && (
            <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div 
                    className="bg-indigo-500 h-full rounded-full" 
                    style={{ width: `${Math.min((invoiceAmount / card.limitValue) * 100, 100)}%` }}
                ></div>
            </div>
        )}
    </div>
);

const BankList: React.FC<BankListProps> = ({ banks, creditCards, transactions, onUpdateBank, onAddBank, onDeleteBank, onAddCreditCard, onUpdateCreditCard, onDeleteCreditCard }) => {
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  
  const [selectedPreset, setSelectedPreset] = useState<{name: string, logo: string} | null>(null);
  const [newBankData, setNewBankData] = useState({ nickname: '', accountNumber: '' });
  
  const [newCardData, setNewCardData] = useState({ 
      bankId: 0, 
      name: '', 
      closingDay: 1, 
      dueDay: 10, 
      limitValue: '' 
  });
  
  const [showArchived, setShowArchived] = useState(false);
  
  const [availablePresets, setAvailablePresets] = useState<{id: number, name: string, logo: string}[]>([]);

  useEffect(() => {
      if (isAddModalOpen) {
          fetchGlobalBanks();
      }
  }, [isAddModalOpen]);

  const fetchGlobalBanks = async () => {
      try {
          const res = await fetch('/api/global-banks');
          if (res.ok) {
              setAvailablePresets(await res.json());
          }
      } catch (e) {
          console.error("Failed to fetch global banks", e);
      }
  };

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBank) {
      onUpdateBank(editingBank);
      setEditingBank(null);
    }
  };

  const handleSaveCard = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingCard) {
          onUpdateCreditCard(editingCard);
          setEditingCard(null);
      } else {
          onAddCreditCard({
              bankId: newCardData.bankId,
              name: newCardData.name,
              closingDay: newCardData.closingDay,
              dueDay: newCardData.dueDay,
              limitValue: newCardData.limitValue ? Number(newCardData.limitValue) : undefined
          });
          setIsAddCardModalOpen(false);
          setNewCardData({ bankId: 0, name: '', closingDay: 1, dueDay: 10, limitValue: '' });
      }
  };

  const handleCreateBank = (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedPreset) {
          onAddBank({
              name: selectedPreset.name,
              logo: selectedPreset.logo,
              nickname: newBankData.nickname,
              accountNumber: newBankData.accountNumber
          });
          setIsAddModalOpen(false);
          setSelectedPreset(null);
          setNewBankData({ nickname: '', accountNumber: '' });
      }
  };

  const handleDeleteClick = (id: number) => {
      if(confirm('Tem certeza que deseja excluir esta conta? O histórico de lançamentos será preservado, mas não será mais possível vincular novos lançamentos.')) {
          onDeleteBank(id);
      }
  };

  const handleDeleteCardClick = (id: number) => {
      if(confirm('Tem certeza que deseja excluir este cartão?')) {
          onDeleteCreditCard(id);
      }
  };

  const activeBanks = banks.filter(b => b.active);
  const archivedBanks = banks.filter(b => !b.active);

  const getInvoiceAmount = (card: CreditCard) => {
      // Simple calculation: Sum of all unreconciled DEBIT transactions for this card
      // Or based on closing date. Let's use closing date logic.
      
      const today = new Date();
      const currentDay = today.getDate();
      
      let startDate = new Date(today.getFullYear(), today.getMonth(), card.closingDay + 1);
      if (currentDay <= card.closingDay) {
          // We are in the current period, which started last month
          startDate = new Date(today.getFullYear(), today.getMonth() - 1, card.closingDay + 1);
      }
      
      // Filter transactions
      return transactions
        .filter(t => t.creditCardId === card.id && t.type === TransactionType.DEBIT && new Date(t.date) >= startDate)
        .reduce((sum, t) => sum + t.value, 0);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Minhas Contas</h1>
          <p className="text-slate-400 text-sm">Gerencie seus bancos, carteiras e cartões de crédito</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => setIsAddCardModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-medium transition-colors shadow-lg shadow-indigo-900/20"
            >
            <Plus size={18} />
            Novo Cartão
            </button>
            <button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover font-medium transition-colors shadow-lg shadow-emerald-900/20"
            >
            <Plus size={18} />
            Nova Conta
            </button>
        </div>
      </div>

      {/* Credit Cards Grid */}
      {creditCards.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div> Cartões de Crédito ({creditCards.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {creditCards.map(card => (
                    <CreditCardCard 
                        key={card.id} 
                        card={card} 
                        bank={banks.find(b => b.id === card.bankId)}
                        invoiceAmount={getInvoiceAmount(card)}
                        onEdit={(c) => { setEditingCard(c); setIsAddCardModalOpen(true); }} 
                        onDelete={handleDeleteCardClick} 
                    />
                ))}
            </div>
          </div>
      )}

      {/* Active Banks Grid */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Contas Ativas ({activeBanks.length})
        </h2>
        
        {activeBanks.length === 0 ? (
            <div className="py-12 text-center bg-surface rounded-xl border border-slate-800 border-dashed flex flex-col items-center gap-3">
                <div className="p-3 bg-slate-800 rounded-full text-slate-500">
                    <AlertCircle size={24} />
                </div>
                <div>
                    <p className="text-slate-300 font-medium">Nenhuma conta ativa encontrada.</p>
                    <p className="text-sm text-slate-500">Adicione uma nova conta ou reative uma arquivada.</p>
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeBanks.map(bank => (
                    <BankCard 
                        key={bank.id} 
                        bank={bank} 
                        onEdit={setEditingBank} 
                        onDelete={handleDeleteClick} 
                    />
                ))}
            </div>
        )}
      </div>

      {/* Archived Banks Section */}
      {archivedBanks.length > 0 && (
          <div className="space-y-4 border-t border-slate-800 pt-6">
              <button 
                onClick={() => setShowArchived(!showArchived)}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors text-sm font-medium w-full"
              >
                  {showArchived ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  Contas Arquivadas ({archivedBanks.length})
                  <div className="h-px bg-slate-800 flex-1 ml-2"></div>
              </button>

              {showArchived && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2">
                      {archivedBanks.map(bank => (
                          <BankCard 
                              key={bank.id} 
                              bank={bank} 
                              onEdit={setEditingBank} 
                              onDelete={handleDeleteClick} 
                          />
                      ))}
                  </div>
              )}
          </div>
      )}

      {/* Add Bank Modal */}
      {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)} />
            <div className="relative bg-surface border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <h3 className="font-semibold text-white">
                        {selectedPreset ? `Nova Conta: ${selectedPreset.name}` : 'Selecionar Instituição'}
                    </h3>
                    <button onClick={() => { setIsAddModalOpen(false); setSelectedPreset(null); }} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                
                {!selectedPreset ? (
                    /* Step 1: Select Bank Preset */
                    <div className="p-6 overflow-y-auto custom-scroll">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {availablePresets.map((preset, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => setSelectedPreset(preset)}
                                    className="flex flex-col items-center gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900 hover:border-primary hover:bg-slate-800/80 transition-all text-center group"
                                >
                                    <div className="w-12 h-12 rounded-lg bg-white p-2 flex items-center justify-center group-hover:shadow-sm shadow-emerald-900/20">
                                        <img src={preset.logo} alt={preset.name} className="max-w-full max-h-full object-contain" />
                                    </div>
                                    <span className="font-medium text-slate-300 text-sm group-hover:text-white">{preset.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Step 2: Fill Details */
                    <form onSubmit={handleCreateBank} className="p-6 space-y-4 text-slate-300">
                        <div className="flex items-center gap-4 mb-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
                             <div className="w-12 h-12 bg-white rounded-lg p-2 flex items-center justify-center">
                                 <img src={selectedPreset.logo} alt={selectedPreset.name} className="max-w-full max-h-full object-contain"/>
                             </div>
                             <div>
                                 <p className="text-sm text-slate-500">Banco selecionado</p>
                                 <p className="font-bold text-white">{selectedPreset.name}</p>
                             </div>
                             <button type="button" onClick={() => setSelectedPreset(null)} className="ml-auto text-sm text-primary hover:underline">Alterar</button>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-400">Apelido da Conta (Opcional)</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-white placeholder-slate-600"
                                value={newBankData.nickname}
                                onChange={e => setNewBankData({...newBankData, nickname: e.target.value})}
                                placeholder="Ex: Conta Principal, Reserva, PJ..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-400">Número da Conta/Agência</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-white placeholder-slate-600"
                                value={newBankData.accountNumber}
                                onChange={e => setNewBankData({...newBankData, accountNumber: e.target.value})}
                                placeholder="0000-0"
                            />
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button 
                                type="button" 
                                onClick={() => setSelectedPreset(null)}
                                className="flex-1 px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 font-medium transition-colors"
                            >
                                Voltar
                            </button>
                            <button 
                                type="submit"
                                className="flex-1 px-4 py-2 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover font-medium transition-colors shadow-sm shadow-emerald-900/50"
                            >
                                Criar Conta
                            </button>
                        </div>
                    </form>
                )}
            </div>
          </div>
      )}

      {/* Add/Edit Credit Card Modal */}
      {isAddCardModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setIsAddCardModalOpen(false); setEditingCard(null); }} />
            <div className="relative bg-surface border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <h3 className="font-semibold text-white">{editingCard ? 'Editar Cartão' : 'Novo Cartão de Crédito'}</h3>
                    <button onClick={() => { setIsAddCardModalOpen(false); setEditingCard(null); }} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSaveCard} className="p-6 space-y-4">
                    {!editingCard && (
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-400">Banco Vinculado</label>
                            <select 
                                required
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white"
                                value={newCardData.bankId}
                                onChange={e => setNewCardData({...newCardData, bankId: Number(e.target.value)})}
                            >
                                <option value={0}>Selecione...</option>
                                {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-400">Nome do Cartão</label>
                        <input 
                            type="text" required
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-600"
                            value={editingCard ? editingCard.name : newCardData.name}
                            onChange={e => editingCard ? setEditingCard({...editingCard, name: e.target.value}) : setNewCardData({...newCardData, name: e.target.value})}
                            placeholder="Ex: Nubank Gold, Black..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-400">Dia Fechamento</label>
                            <input 
                                type="number" min="1" max="31" required
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white"
                                value={editingCard ? editingCard.closingDay : newCardData.closingDay}
                                onChange={e => editingCard ? setEditingCard({...editingCard, closingDay: Number(e.target.value)}) : setNewCardData({...newCardData, closingDay: Number(e.target.value)})}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-400">Dia Vencimento</label>
                            <input 
                                type="number" min="1" max="31" required
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white"
                                value={editingCard ? editingCard.dueDay : newCardData.dueDay}
                                onChange={e => editingCard ? setEditingCard({...editingCard, dueDay: Number(e.target.value)}) : setNewCardData({...newCardData, dueDay: Number(e.target.value)})}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-400">Limite (Opcional)</label>
                        <input 
                            type="number" step="0.01"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white"
                            value={editingCard ? (editingCard.limitValue || '') : newCardData.limitValue}
                            onChange={e => editingCard ? setEditingCard({...editingCard, limitValue: Number(e.target.value)}) : setNewCardData({...newCardData, limitValue: e.target.value})}
                            placeholder="R$ 0,00"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                            type="button" 
                            onClick={() => { setIsAddCardModalOpen(false); setEditingCard(null); }}
                            className="flex-1 px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-medium transition-colors shadow-sm shadow-indigo-900/50"
                        >
                            {editingCard ? 'Salvar Alterações' : 'Criar Cartão'}
                        </button>
                    </div>
                </form>
            </div>
          </div>
      )}

      {/* Edit Bank Modal */}
      {editingBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditingBank(null)} />
          <div className="relative bg-surface border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-white">Editar Conta - {editingBank.name}</h3>
              <button onClick={() => setEditingBank(null)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveBank} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-400">Apelido da Conta</label>
                <input 
                    type="text" 
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-white placeholder-slate-600"
                    value={editingBank.nickname || ''}
                    onChange={e => setEditingBank({...editingBank, nickname: e.target.value})}
                    placeholder="Ex: Conta Principal"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-400">Número da Conta</label>
                <input 
                    type="text" 
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-white"
                    value={editingBank.accountNumber}
                    onChange={e => setEditingBank({...editingBank, accountNumber: e.target.value})}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                 <button
                    type="button"
                    onClick={() => setEditingBank({...editingBank, active: !editingBank.active})}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors border ${
                        editingBank.active 
                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20' 
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                 >
                    <Power size={16} />
                    {editingBank.active ? 'Arquivar Conta' : 'Reativar Conta'}
                 </button>
              </div>
              
              <p className="text-xs text-slate-500 text-center">
                  {editingBank.active 
                    ? "Contas arquivadas são ocultadas da lista principal, mas o histórico é mantido."
                    : "Reativar a conta a tornará visível novamente para novos lançamentos."}
              </p>

              <div className="pt-4 flex gap-3">
                <button 
                    type="button" 
                    onClick={() => setEditingBank(null)}
                    className="flex-1 px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 font-medium transition-colors"
                >
                    Cancelar
                </button>
                <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover font-medium transition-colors shadow-sm shadow-emerald-900/50"
                >
                    Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankList;