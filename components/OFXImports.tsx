import React, { useState, useRef, useEffect } from 'react';
import { Bank, OFXImport, Transaction, TransactionType, KeywordRule } from '../types';
import { fmtDateBR } from '../lib/date';
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
                let matchedDescription: string | null = null;
                for (const rule of keywordRules) {
                    if (rule.type === type) {
                        // Check if rule applies to this bank (or globally)
                        const bankMatch = !rule.bankId || rule.bankId === currentBankId;

                        if (bankMatch && description.toLowerCase().includes(rule.keyword.toLowerCase())) {
                            matchedCategoryId = rule.categoryId;
                            if ((rule as any).setDescription) matchedDescription = (rule as any).setDescription;
                            break;
                        }
                    }
                }

                parsedTransactions.push({
                    date: formattedDate,
                    description: matchedDescription || description,
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
              saveImport(newClean, [], content);
          }
      }, 100);
    };
    reader.readAsText(file);
  };

  const saveImport = async (cleanTxs: any[], resolvedConflicts: ConflictingTransaction[], originalContent: string) => {
      setIsProcessing(true);
      setProcessingStatus('Salvando lançamentos...');
      setProgress(10);

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
          // Remove os antigos que serão substituídos (poucos, em geral nenhum)
          if (transactionsToDeleteIds.length > 0) {
              setProcessingStatus('Removendo antigos...');
              for (const id of transactionsToDeleteIds) {
                  await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers: getHeaders() });
              }
          }

          // UMA requisição: cria o registro do OFX + insere todos os lançamentos
          // + ajusta o saldo, tudo numa transação de banco. (Antes era 1 request
          // por lançamento — estourava o rate-limit em extratos grandes.)
          if (finalTransactionsToAdd.length > 0) {
              setProcessingStatus(`Importando ${finalTransactionsToAdd.length} lançamentos...`);
              setProgress(45);
              const res = await fetch('/api/transactions/bulk', {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify({
                      ofxImport: {
                          fileName: currentFileName,
                          importDate: new Date().toISOString(),
                          bankId: Number(importConfig.bankId),
                          content: originalContent || fileContent,
                      },
                      transactions: finalTransactionsToAdd,
                  }),
              });
              if (!res.ok) {
                  const e = await res.json().catch(() => ({}));
                  throw new Error(e.error || `HTTP ${res.status}`);
              }
              setProgress(90);
          }

          await fetchImports();
          onTransactionsImported(); // Critical: Refresh Parent State

          alert("Importação concluída com sucesso! Verifique se a data dos lançamentos corresponde ao filtro de data da tela de Lançamentos.");

          setShowConflictModal(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          setConflicts([]);
          setCleanTransactions([]);
          setFileContent('');

      } catch (err: any) {
          alert("Erro ao salvar dados: " + (err?.message || 'desconhecido'));
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
              <div className="bg-surface border border-line p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                      <div className="absolute inset-0 border-4 border-line rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-brand rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-xl font-bold text-ink mb-2">{processingStatus}</h3>
                  <div className="w-full bg-sunken rounded-full h-2 mb-2 overflow-hidden">
                      <div className="bg-brand h-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                  </div>
                  <p className="text-muted text-sm font-mono">{progress}% concluído</p>
              </div>
          </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-ink">Gerenciador de OFX</h1>
        <p className="text-muted">Importe e gerencie seus arquivos bancários</p>
      </div>

      {/* Import Area */}
      <div className="bg-surface p-6 rounded-xl border border-line shadow-sm">
         <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
            <FileUp className="text-brand" size={20}/> Nova Importação
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Conta Bancária</label>
                <select 
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none text-ink"
                    value={importConfig.bankId}
                    onChange={e => setImportConfig({...importConfig, bankId: Number(e.target.value)})}
                >
                    {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Data Inicial (Opcional)</label>
                <input 
                    type="date"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none text-ink"
                    value={importConfig.startDate}
                    onChange={e => setImportConfig({...importConfig, startDate: e.target.value})}
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted">Data Final (Opcional)</label>
                <input 
                    type="date"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg focus:ring-2 focus:ring-brand/50 focus:border-brand outline-none text-ink"
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
                className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand-strong font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
             >
                {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <FileSpreadsheet size={20} />}
                Selecionar Arquivo OFX
             </button>
             <p className="text-sm text-faint">Selecione o arquivo .ofx fornecido pelo seu banco.</p>
         </div>
      </div>

      {/* Conflict Modal */}
      {showConflictModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowConflictModal(false)} />
              <div className="relative bg-surface w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl border border-warn/30 animate-in fade-in zoom-in duration-200">
                  <div className="px-6 py-4 border-b border-warn/20 bg-warn/10 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <AlertTriangle className="text-warn" size={24}/>
                          <div>
                              <h3 className="text-lg font-bold text-ink">Conflitos de Duplicidade Detectados</h3>
                              <p className="text-sm text-warn">Alguns lançamentos do arquivo já existem no sistema com a mesma data e valor.</p>
                          </div>
                      </div>
                      <button onClick={() => setShowConflictModal(false)} className="text-muted hover:text-ink"><X size={24}/></button>
                  </div>

                  <div className="p-4 bg-surface border-b border-line flex justify-end gap-2">
                      <span className="text-xs font-semibold text-faint uppercase self-center mr-2">Aplicar a todos:</span>
                      <button onClick={() => handleBulkAction('keep_old')} className="px-3 py-1.5 bg-sunken border border-line rounded text-xs text-muted hover:bg-sunken">Manter Existentes</button>
                      <button onClick={() => handleBulkAction('replace_with_new')} className="px-3 py-1.5 bg-sunken border border-line rounded text-xs text-muted hover:bg-sunken">Substituir por Novos</button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scroll p-6">
                      <table className="w-full text-sm">
                          <thead>
                              <tr className="text-faint text-xs uppercase border-b border-line">
                                  <th className="pb-3 text-left w-1/3">No Sistema (Existente)</th>
                                  <th className="pb-3 text-center">Ação</th>
                                  <th className="pb-3 text-left w-1/3">No Arquivo (Novo)</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                              {conflicts.map(c => (
                                  <tr key={c.id} className="hover:bg-sunken/30">
                                      <td className="py-3 pr-4 opacity-70">
                                          <div className="font-mono text-xs text-muted">{fmtDateBR(c.oldTx.date)}</div>
                                          <div className="font-medium text-muted">{c.oldTx.description}</div>
                                          <div className={c.oldTx.type === 'debito' ? 'text-danger' : 'text-ok'}>{(c.oldTx.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                                      </td>
                                      <td className="py-3 px-2">
                                          <div className="flex flex-col gap-2 items-center">
                                              <button 
                                                onClick={() => handleConflictActionChange(c.id, 'keep_old')}
                                                className={`w-full px-3 py-1.5 rounded text-xs font-bold border transition-colors ${c.action === 'keep_old' ? 'bg-sunken text-ink border-line' : 'bg-transparent text-faint border-line hover:border-line'}`}
                                              >
                                                  Manter Existente
                                              </button>
                                              <button 
                                                onClick={() => handleConflictActionChange(c.id, 'replace_with_new')}
                                                className={`w-full px-3 py-1.5 rounded text-xs font-bold border transition-colors ${c.action === 'replace_with_new' ? 'bg-brand/20 text-brand border-brand/50' : 'bg-transparent text-faint border-line hover:border-line'}`}
                                              >
                                                  Substituir
                                              </button>
                                          </div>
                                      </td>
                                      <td className="py-3 pl-4">
                                          <div className="font-mono text-xs text-brand">{fmtDateBR(c.newTx.date)}</div>
                                          <div className="font-medium text-ink">{c.newTx.description}</div>
                                          <div className={c.newTx.type === 'debito' ? 'text-danger' : 'text-ok'}>{(c.newTx.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  <div className="p-6 border-t border-line bg-ground rounded-b-xl flex justify-between items-center">
                      <span className="text-sm text-muted">
                          <strong>{cleanTransactions.length}</strong> novos lançamentos sem conflito serão importados automaticamente.
                      </span>
                      <div className="flex gap-3">
                          <button onClick={() => setShowConflictModal(false)} className="px-4 py-2 border border-line rounded-lg text-muted hover:bg-sunken">Cancelar</button>
                          <button 
                            onClick={() => saveImport(cleanTransactions, conflicts, fileContent)}
                            className="px-6 py-2 bg-brand text-white font-bold rounded-lg hover:bg-brand-strong flex items-center gap-2"
                          >
                              <Save size={18}/> Confirmar Importação
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* List Area */}
      <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-ground/30">
           <h3 className="font-semibold text-ink">Histórico de Importações</h3>
        </div>
        <table className="w-full text-sm text-left">
            <thead className="bg-ground text-muted font-medium border-b border-line">
                <tr>
                    <th className="px-6 py-4">Data Importação</th>
                    <th className="px-6 py-4">Arquivo</th>
                    <th className="px-6 py-4">Banco</th>
                    <th className="px-6 py-4 text-center">Lançamentos</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-line">
                {imports.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-faint">Nenhuma importação realizada.</td>
                    </tr>
                ) : (
                    imports.map(imp => {
                        const bank = banks.find(b => b.id === imp.bankId);
                        return (
                            <tr key={imp.id} className="hover:bg-sunken/60">
                                <td className="px-6 py-4 text-muted">
                                    {new Date(imp.importDate).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 font-medium text-ink">{imp.fileName}</td>
                                <td className="px-6 py-4 flex items-center gap-2 text-muted">
                                    {bank && <img src={bank.logo} className="w-5 h-5 rounded-full bg-white p-0.5" />}
                                    {bank?.name || 'Desconhecido'}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="bg-info/10 text-info px-2 py-1 rounded-md text-xs font-bold border border-info/40/20">
                                        {imp.transactionCount}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button 
                                        onClick={() => handleDeleteImport(imp.id)}
                                        className="p-2 text-faint hover:text-brand-fg hover:bg-danger/10 rounded transition-colors"
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