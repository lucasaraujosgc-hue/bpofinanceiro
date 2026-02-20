import React, { useState, useRef, useEffect } from 'react';
import { Bank, OFXImport, Transaction, TransactionType, KeywordRule } from '../types';
import { FileUp, Trash2, Calendar, Database, FileSpreadsheet, AlertTriangle, ArrowRight, Save, X, Loader2 } from 'lucide-react';

interface OFXImportsProps {
  token: string;
  userId: number;
  banks: Bank[];
  keywordRules: KeywordRule[];
  transactions: Transaction[]; // Recebendo todas as transações para comparação
  onTransactionsImported: () => void;
}

interface ConflictingTransaction {
    newTx: any; // O objeto do OFX
    oldTx: Transaction; // O objeto do Banco de Dados
    id: string; // Identificador temporário para a lista
    action: 'keep_old' | 'replace_with_new';
}

const OFXImports: React.FC<OFXImportsProps> = ({ token, userId, banks, keywordRules, transactions, onTransactionsImported }) => {
  const [imports, setImports] = useState<OFXImport[]>([]);
  const [importConfig, setImportConfig] = useState({
    bankId: banks[0]?.id || 0,
    startDate: '',
    endDate: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for Conflict Resolution
  const [conflicts, setConflicts] = useState<ConflictingTransaction[]>([]);
  const [cleanTransactions, setCleanTransactions] = useState<any[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [currentFileName, setCurrentFileName] = useState('');
  const [fileContent, setFileContent] = useState(''); 
  
  // Progress State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');

  const getHeaders = () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
  });

  // Load Imports History
  useEffect(() => {
      fetchImports();
  }, [userId]);

  // Update default bank ID
  useEffect(() => {
      if(banks.length > 0 && importConfig.bankId === 0) {
          setImportConfig(prev => ({...prev, bankId: banks[0].id}));
      }
  }, [banks]);

  const fetchImports = async () => {
      try {
          const res = await fetch('/api/ofx-imports', { headers: getHeaders() });
          if (res.ok) setImports(await res.json());
      } catch (e) {
          console.error(e);
      }
  };

  const processOFXFile = (file: File) => {
    setCurrentFileName(file.name);
    setIsProcessing(true);
    setProcessingStatus('Lendo arquivo...');
    setProgress(10);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) {
          setIsProcessing(false);
          return;
      }
      setFileContent(content);
      setProgress(30);
      setProcessingStatus('Analisando lançamentos...');

      // Pequeno delay para a UI atualizar
      setTimeout(() => {
          const transactionsRaw = content.split('<STMTTRN>');
          const start = importConfig.startDate ? new Date(importConfig.startDate) : null;
          const end = importConfig.endDate ? new Date(importConfig.endDate) : null;
          const currentBankId = Number(importConfig.bankId);

          const parsedTransactions: any[] = [];
          let ignored = 0;

          transactionsRaw.forEach(block => {
            const dateMatch = block.match(/<DTPOSTED>(\d{8})/);
            const amountMatch = block.match(/<TRNAMT>([\d.-]+)/);
            const memoMatch = block.match(/<MEMO>(.*?)[\r\n<]/);

            if (dateMatch && amountMatch && memoMatch) {
                const dateStr = dateMatch[1]; 
                const formattedDate = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
                const txDate = new Date(formattedDate);
                
                // Date Filter
                if (start && txDate < start) { ignored++; return; }
                if (end && txDate > end) { ignored++; return; }

                const rawValue = parseFloat(amountMatch[1]);
                const type = rawValue < 0 ? TransactionType.DEBIT : TransactionType.CREDIT;
                const description = memoMatch[1].trim();

                // KEYWORD RULE MATCHING
                let matchedCategoryId = 0;
                for (const rule of keywordRules) {
                    if (rule.type === type) {
                        // Check if rule applies to this bank (or globally)
                        const bankMatch = !rule.bankId || rule.bankId === currentBankId;
                        
                        if (bankMatch && description.toLowerCase().includes(rule.keyword.toLowerCase())) {
                            matchedCategoryId = rule.categoryId;
                            break;
                        }
                    }
                }
                
                parsedTransactions.push({
                    date: formattedDate,
                    description: description,
                    value: Math.abs(rawValue),
                    type: type,
                    bankId: currentBankId,
                    categoryId: matchedCategoryId,
                    reconciled: matchedCategoryId > 0
                });
            }
          });

          setProgress(60);

          if (parsedTransactions.length === 0) {
              alert("Nenhum lançamento encontrado no período.");
              setIsProcessing(false);
              return;
          }

          setProcessingStatus('Verificando duplicidades...');
          
          // Filter existing transactions for this bank
          const existingBankTransactions = transactions.filter(t => t.bankId === currentBankId);
          
          const newConflicts: ConflictingTransaction[] = [];
          const newClean: any[] = [];

          // We use a copy to splice out matches so 2 identical new txs match 2 identical old txs correctly one-by-one
          const availableExisting = [...existingBankTransactions];

          parsedTransactions.forEach((newTx, idx) => {
              // Find match in available existing
              const matchIndex = availableExisting.findIndex(ex => 
                  ex.date === newTx.date && 
                  Math.abs(ex.value) === Math.abs(newTx.value) &&
                  ex.type === newTx.type
              );

              if (matchIndex > -1) {
                  // Found a conflict
                  newConflicts.push({
                      id: `conflict-${idx}`,
                      newTx: newTx,
                      oldTx: availableExisting[matchIndex],
                      action: 'keep_old' // Default action
                  });
                  // Remove from available so it's not matched again
                  availableExisting.splice(matchIndex, 1);
              } else {
                  // No conflict
                  newClean.push(newTx);
              }
          });

          setCleanTransactions(newClean);
          setConflicts(newConflicts);
          
          setIsProcessing(false);
          setProgress(0);

          if (newConflicts.length > 0) {
              setShowConflictModal(true);
          } else {
              // No conflicts, proceed directly
              saveImport(newClean, []);
          }
      }, 100);
    };
    reader.readAsText(file);
  };

  const saveImport = async (cleanTxs: any[], resolvedConflicts: ConflictingTransaction[]) => {
      setIsProcessing(true);
      setProcessingStatus('Salvando lançamentos...');
      setProgress(0);

      const finalTransactionsToAdd = [...cleanTxs];
      const transactionsToDeleteIds: number[] = [];

      resolvedConflicts.forEach(c => {
          if (c.action === 'replace_with_new') {
              transactionsToDeleteIds.push(c.oldTx.id);
              finalTransactionsToAdd.push(c.newTx);
          }
      });

      if (finalTransactionsToAdd.length === 0 && transactionsToDeleteIds.length === 0) {
          alert("Nenhuma alteração a ser realizada.");
          setShowConflictModal(false);
          setIsProcessing(false);
          return;
      }

      try {
          let importId: number | null = null;
          
          if (finalTransactionsToAdd.length > 0) {
              const resImport = await fetch('/api/ofx-imports', {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify({
                      fileName: currentFileName,
                      importDate: new Date().toISOString(),
                      bankId: Number(importConfig.bankId),
                      transactionCount: finalTransactionsToAdd.length,
                      content: fileContent
                  })
              });
              const importData = await resImport.json();
              importId = importData.id;
          }

          // Delete Replaced Transactions
          if (transactionsToDeleteIds.length > 0) {
              setProcessingStatus('Removendo antigos...');
              for (const id of transactionsToDeleteIds) {
                  await fetch(`/api/transactions/${id}`, {
                      method: 'DELETE',
                      headers: getHeaders()
                  });
              }
          }

          // Insert New Transactions with Progress Bar
          const total = finalTransactionsToAdd.length;
          setProcessingStatus(`Importando ${total} lançamentos...`);
          
          // Enviar em lotes para performance melhor, ou um loop com progresso visual
          for (let i = 0; i < total; i++) {
                await fetch('/api/transactions', {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({ ...finalTransactionsToAdd[i], ofxImportId: importId })
                });
                // Update Progress
                const pct = Math.round(((i + 1) / total) * 100);
                setProgress(pct);
          }

          await fetchImports();
          onTransactionsImported(); // Critical: Refresh Parent State
          
          alert("Importação concluída com sucesso! Verifique se a data dos lançamentos corresponde ao filtro de data da tela de Lançamentos.");
          
          setShowConflictModal(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          setConflicts([]);
          setCleanTransactions([]);
          setFileContent('');

      } catch (err) {
          alert("Erro ao salvar dados.");
          console.error(err);
      } finally {
          setIsProcessing(false);
          setProgress(0);
      }
  };

  const handleConflictActionChange = (id: string, action: 'keep_old' | 'replace_with_new') => {
      setConflicts(prev => prev.map(c => c.id === id ? { ...c, action } : c));
  };

  const handleBulkAction = (action: 'keep_old' | 'replace_with_new') => {
      setConflicts(prev => prev.map(c => ({ ...c, action })));
  };

  const handleDeleteImport = async (id: number) => {
      if(confirm('ATENÇÃO: Excluir esta importação irá apagar TODOS os lançamentos financeiros vinculados a ela. Deseja continuar?')) {
          try {
              const res = await fetch(`/api/ofx-imports/${id}`, { 
                  method: 'DELETE',
                  headers: getHeaders()
              });
              if (res.ok) {
                  setImports(prev => prev.filter(i => i.id !== id));
                  onTransactionsImported(); // Refresh main list
              }
          } catch (e) {
              alert("Erro ao excluir.");
          }
      }
  };

  return (
    <div className="space-y-8 relative">
      {/* Loading Overlay */}
      {isProcessing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="bg-surface border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                      <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{processingStatus}</h3>
                  <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                  </div>
                  <p className="text-slate-400 text-sm font-mono">{progress}% concluído</p>
              </div>
          </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Gerenciador de OFX</h1>
        <p className="text-slate-400">Importe e gerencie seus arquivos bancários</p>
      </div>

      {/* Import Area */}
      <div className="bg-surface p-6 rounded-xl border border-slate-800 shadow-sm">
         <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <FileUp className="text-primary" size={20}/> Nova Importação
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-400">Conta Bancária</label>
                <select 
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white"
                    value={importConfig.bankId}
                    onChange={e => setImportConfig({...importConfig, bankId: Number(e.target.value)})}
                >
                    {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-400">Data Inicial (Opcional)</label>
                <input 
                    type="date"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white"
                    value={importConfig.startDate}
                    onChange={e => setImportConfig({...importConfig, startDate: e.target.value})}
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-400">Data Final (Opcional)</label>
                <input 
                    type="date"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none text-white"
                    value={importConfig.endDate}
                    onChange={e => setImportConfig({...importConfig, endDate: e.target.value})}
                />
            </div>
         </div>
         
         <div className="flex items-center gap-4">
             <input 
                type="file" 
                ref={fileInputRef}
                accept=".ofx"
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.[0]) processOFXFile(e.target.files[0]);
                }}
             />
             <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-slate-900 rounded-lg hover:bg-primaryHover font-medium transition-colors shadow-lg shadow-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <FileSpreadsheet size={20} />}
                Selecionar Arquivo OFX
             </button>
             <p className="text-sm text-slate-500">Selecione o arquivo .ofx fornecido pelo seu banco.</p>
         </div>
      </div>

      {/* Conflict Modal */}
      {showConflictModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowConflictModal(false)} />
              <div className="relative bg-surface w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl border border-amber-500/30 animate-in fade-in zoom-in duration-200">
                  <div className="px-6 py-4 border-b border-amber-500/20 bg-amber-950/30 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <AlertTriangle className="text-amber-500" size={24}/>
                          <div>
                              <h3 className="text-lg font-bold text-white">Conflitos de Duplicidade Detectados</h3>
                              <p className="text-sm text-amber-200/70">Alguns lançamentos do arquivo já existem no sistema com a mesma data e valor.</p>
                          </div>
                      </div>
                      <button onClick={() => setShowConflictModal(false)} className="text-slate-400 hover:text-white"><X size={24}/></button>
                  </div>

                  <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-end gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase self-center mr-2">Aplicar a todos:</span>
                      <button onClick={() => handleBulkAction('keep_old')} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 hover:bg-slate-700">Manter Existentes</button>
                      <button onClick={() => handleBulkAction('replace_with_new')} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 hover:bg-slate-700">Substituir por Novos</button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scroll p-6">
                      <table className="w-full text-sm">
                          <thead>
                              <tr className="text-slate-500 text-xs uppercase border-b border-slate-800">
                                  <th className="pb-3 text-left w-1/3">No Sistema (Existente)</th>
                                  <th className="pb-3 text-center">Ação</th>
                                  <th className="pb-3 text-left w-1/3">No Arquivo (Novo)</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                              {conflicts.map(c => (
                                  <tr key={c.id} className="hover:bg-slate-800/30">
                                      <td className="py-3 pr-4 opacity-70">
                                          <div className="font-mono text-xs text-slate-400">{new Date(c.oldTx.date).toLocaleDateString()}</div>
                                          <div className="font-medium text-slate-300">{c.oldTx.description}</div>
                                          <div className={c.oldTx.type === 'debito' ? 'text-rose-500' : 'text-emerald-500'}>R$ {c.oldTx.value.toFixed(2)}</div>
                                      </td>
                                      <td className="py-3 px-2">
                                          <div className="flex flex-col gap-2 items-center">
                                              <button 
                                                onClick={() => handleConflictActionChange(c.id, 'keep_old')}
                                                className={`w-full px-3 py-1.5 rounded text-xs font-bold border transition-colors ${c.action === 'keep_old' ? 'bg-slate-700 text-white border-slate-500' : 'bg-transparent text-slate-500 border-slate-800 hover:border-slate-600'}`}
                                              >
                                                  Manter Existente
                                              </button>
                                              <button 
                                                onClick={() => handleConflictActionChange(c.id, 'replace_with_new')}
                                                className={`w-full px-3 py-1.5 rounded text-xs font-bold border transition-colors ${c.action === 'replace_with_new' ? 'bg-primary/20 text-primary border-primary/50' : 'bg-transparent text-slate-500 border-slate-800 hover:border-slate-600'}`}
                                              >
                                                  Substituir
                                              </button>
                                          </div>
                                      </td>
                                      <td className="py-3 pl-4">
                                          <div className="font-mono text-xs text-primary">{new Date(c.newTx.date).toLocaleDateString()}</div>
                                          <div className="font-medium text-white">{c.newTx.description}</div>
                                          <div className={c.newTx.type === 'debito' ? 'text-rose-400' : 'text-emerald-400'}>R$ {c.newTx.value.toFixed(2)}</div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  <div className="p-6 border-t border-slate-800 bg-slate-950 rounded-b-xl flex justify-between items-center">
                      <span className="text-sm text-slate-400">
                          <strong>{cleanTransactions.length}</strong> novos lançamentos sem conflito serão importados automaticamente.
                      </span>
                      <div className="flex gap-3">
                          <button onClick={() => setShowConflictModal(false)} className="px-4 py-2 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800">Cancelar</button>
                          <button 
                            onClick={() => saveImport(cleanTransactions, conflicts)}
                            className="px-6 py-2 bg-primary text-slate-900 font-bold rounded-lg hover:bg-primaryHover flex items-center gap-2"
                          >
                              <Save size={18}/> Confirmar Importação
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* List Area */}
      <div className="bg-surface rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/30">
           <h3 className="font-semibold text-slate-200">Histórico de Importações</h3>
        </div>
        <table className="w-full text-sm text-left">
            <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                    <th className="px-6 py-4">Data Importação</th>
                    <th className="px-6 py-4">Arquivo</th>
                    <th className="px-6 py-4">Banco</th>
                    <th className="px-6 py-4 text-center">Lançamentos</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {imports.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Nenhuma importação realizada.</td>
                    </tr>
                ) : (
                    imports.map(imp => {
                        const bank = banks.find(b => b.id === imp.bankId);
                        return (
                            <tr key={imp.id} className="hover:bg-slate-800/50">
                                <td className="px-6 py-4 text-slate-400">
                                    {new Date(imp.importDate).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-200">{imp.fileName}</td>
                                <td className="px-6 py-4 flex items-center gap-2 text-slate-300">
                                    {bank && <img src={bank.logo} className="w-5 h-5 rounded-full bg-white p-0.5" />}
                                    {bank?.name || 'Desconhecido'}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="bg-sky-500/10 text-sky-500 px-2 py-1 rounded-md text-xs font-bold border border-sky-500/20">
                                        {imp.transactionCount}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button 
                                        onClick={() => handleDeleteImport(imp.id)}
                                        className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                        title="Excluir Importação e Lançamentos"
                                    >
                                        <Trash2 size={18} />
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
  );
};

export default OFXImports;