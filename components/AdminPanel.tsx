import React, { useState, useEffect, useRef } from 'react';
import { Users, LayoutDashboard, FileText, Trash2, LogOut, ShieldAlert, BarChart, Eye, X, Download, Calendar, Receipt, ArrowUpRight, FileSpreadsheet, Landmark, Plus, Upload, Edit2, Save, Ban, Search, Printer, RefreshCcw, FileCode, HardDrive, CheckCircle } from 'lucide-react';

interface AdminPanelProps {
  token: string;
  onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ token, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'audit' | 'banks'>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [auditData, setAuditData] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [adminBanks, setAdminBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userDetails, setUserDetails] = useState<any>(null);
  // detailTab controla a visualização dentro do modal: Lançamentos ou Arquivos OFX
  const [detailTab, setDetailTab] = useState<'transactions' | 'ofx_files'>('transactions');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [newBankName, setNewBankName] = useState('');
  const [newBankLogo, setNewBankLogo] = useState<string | null>(null);
  const [editingBankId, setEditingBankId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getHeaders = () => {
      return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
      };
  };

  // Carregar dados com base na tab ativa, evitando concorrência direta no useEffect
  const loadTabContent = async (tab: string) => {
      setLoading(true);
      try {
          if (tab === 'dashboard') {
              const res = await fetch('/api/admin/global-data', { headers: getHeaders() });
              if(res.ok) setStats(await res.json());
          }
          else if (tab === 'users') {
              const res = await fetch('/api/admin/users', { headers: getHeaders() });
              if(res.ok) {
                  const data = await res.json();
                  if (Array.isArray(data)) {
                      setUsers(data);
                  } else {
                      console.error("Data received for users is not an array:", data);
                      setUsers([]);
                  }
              } else {
                  console.error("Erro ao buscar usuários. Status:", res.status);
              }
          }
          else if (tab === 'audit') {
              const res = await fetch(`/api/admin/audit-signups?limit=20&offset=${auditPage*20}`, { headers: getHeaders() });
              if(res.ok) {
                  const result = await res.json();
                  setAuditData(result.data || []);
                  setAuditTotal(result.total || 0);
              }
          }
          else if (tab === 'banks') {
              const res = await fetch('/api/admin/banks', { headers: getHeaders() });
              if(res.ok) setAdminBanks(await res.json());
          }
      } catch (e) {
          console.error("Erro ao carregar dados:", e);
      } finally {
          setLoading(false);
      }
  };

  // Carrega ao montar e ao trocar de tab explicitamente
  useEffect(() => {
      if (token) loadTabContent(activeTab);
  }, [activeTab, token, auditPage]);

  const handleTabChange = (tab: 'dashboard' | 'users' | 'audit' | 'banks') => {
      setActiveTab(tab);
      // O useEffect cuidará do carregamento
  };

  const handleOpenUser = async (user: any) => {
      setSelectedUser(user); 
      setLoading(true);
      setDetailTab('transactions'); // Reset para a tab principal
      const today = new Date(); 
      setStartDate(new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]); 
      setEndDate(new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0]);
      
      try { 
          const res = await fetch(`/api/admin/users/${user.id}/full-data`, { headers: getHeaders() }); 
          if (res.ok) setUserDetails(await res.json()); 
          else alert("Erro ao carregar detalhes do usuário");
      } catch (e) {
          console.error(e);
          alert("Erro de conexão");
      } finally { 
          setLoading(false); 
      }
  };

  const handleDeleteUser = async (id: number, email: string) => {
      if (confirm(`ATENÇÃO: Isso excluirá permanentemente a empresa ${email} e TODOS os seus dados. Confirmar?`)) {
          try {
              const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: getHeaders() });
              if (res.ok) { 
                  alert("Usuário removido."); 
                  loadTabContent('users'); // Recarrega a lista
                  setSelectedUser(null); 
              } else {
                  alert("Erro ao remover usuário");
              }
          } catch (e) {
              alert("Erro de conexão");
          }
      }
  };

  const handleBlockUser = async (id: number, currentBlocked: boolean) => {
      const action = currentBlocked ? 'desbloquear' : 'bloquear';
      if (confirm(`Deseja realmente ${action} este usuário?`)) {
          try {
              const res = await fetch(`/api/admin/users/${id}/block`, { 
                  method: 'PUT', 
                  headers: getHeaders(),
                  body: JSON.stringify({ blocked: !currentBlocked })
              });
              if(res.ok) {
                  loadTabContent('users');
              } else {
                  alert("Erro ao alterar status");
              }
          } catch (e) {
              alert("Erro de conexão");
          }
      }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) { 
          const reader = new FileReader(); 
          reader.onloadend = () => { setNewBankLogo(reader.result as string); }; 
          reader.readAsDataURL(file); 
      }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBankName) return alert("Nome do banco é obrigatório");
      
      const url = editingBankId ? `/api/admin/banks/${editingBankId}` : '/api/admin/banks';
      const method = editingBankId ? 'PUT' : 'POST';
      
      try {
          const res = await fetch(url, { 
              method, 
              headers: getHeaders(), 
              body: JSON.stringify({ name: newBankName, logoData: newBankLogo }) 
          });
          
          if (res.ok) { 
              handleCancelEdit(); 
              loadTabContent('banks');
              alert(editingBankId ? "Atualizado!" : "Criado!"); 
          } else {
              alert("Erro ao salvar.");
          }
      } catch (e) { console.error(e); }
  };

  const handleEditBankClick = (bank: any) => { 
      setEditingBankId(bank.id); 
      setNewBankName(bank.name); 
      setNewBankLogo(bank.logo); 
  };
  
  const handleCancelEdit = () => { 
      setEditingBankId(null); 
      setNewBankName(''); 
      setNewBankLogo(null); 
      if(fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleDeleteBank = async (id: number) => { 
      if(confirm("Excluir este banco global?")) { 
          await fetch(`/api/admin/banks/${id}`, { method: 'DELETE', headers: getHeaders() }); 
          loadTabContent('banks');
      } 
  };

  const exportToCSV = (transactions: any[], userName: string) => {
    if (!transactions || transactions.length === 0) return alert("Sem dados para exportar.");
    
    const headers = ["Data", "Descrição", "Valor", "Tipo", "Categoria", "Banco", "Conciliado"];
    const csvContent = [
        headers.join(","),
        ...transactions.map(t => {
            const date = new Date(t.date).toLocaleDateString('pt-BR');
            const desc = `"${(t.description || '').replace(/"/g, '""')}"`; 
            const val = t.value.toFixed(2).replace('.', ',');
            const type = t.type === 'credito' ? 'Receita' : 'Despesa';
            const cat = t.category_name || '-';
            const bank = t.bank_name || '-';
            const status = t.reconciled ? 'Sim' : 'Não';
            return `${date},${desc},${val},${type},"${cat}","${bank}",${status}`;
        })
    ].join("\n");

    // Adiciona BOM (\uFEFF) para garantir que o Excel reconheça o UTF-8 corretamente
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `extrato_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadOriginalOFX = (fileName: string, content: string) => {
    if (!content) return alert("Conteúdo do arquivo vazio.");
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName || 'arquivo.ofx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filterByDate = (items: any[]) => items?.filter(item => { 
      const d = item.date || item.import_date; 
      if (!d) return false;
      return d.split('T')[0] >= startDate && d.split('T')[0] <= endDate; 
  }) || [];

  return (
    <div className="flex h-screen bg-ground text-ink">
      <aside className="w-64 bg-surface border-r border-line flex flex-col shrink-0">
          <div className="p-6 border-b border-line flex items-center gap-2">
              <ShieldAlert className="text-danger" size={24}/>
              <h1 className="font-bold text-lg text-ink">Admin Master</h1>
          </div>
          <nav className="flex-1 p-4 space-y-2">
              <button onClick={() => handleTabChange('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-danger/10 text-danger' : 'text-muted hover:text-ink hover:bg-sunken'}`}>
                  <LayoutDashboard size={20}/> Dashboard
              </button>
              <button onClick={() => handleTabChange('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'users' ? 'bg-danger/10 text-danger' : 'text-muted hover:text-ink hover:bg-sunken'}`}>
                  <Users size={20}/> Usuários
              </button>
              <button onClick={() => handleTabChange('banks')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'banks' ? 'bg-danger/10 text-danger' : 'text-muted hover:text-ink hover:bg-sunken'}`}>
                  <Landmark size={20}/> Bancos Globais
              </button>
              <button onClick={() => handleTabChange('audit')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'audit' ? 'bg-danger/10 text-danger' : 'text-muted hover:text-ink hover:bg-sunken'}`}>
                  <FileText size={20}/> Auditoria
              </button>
          </nav>
          <div className="p-4 border-t border-line">
              <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-muted hover:text-ink rounded-lg hover:bg-sunken transition-colors">
                  <LogOut size={20}/> Sair
              </button>
          </div>
      </aside>

      <main className="flex-1 overflow-auto bg-black p-8 relative">
          {loading && (
              <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-danger/50"></div>
              </div>
          )}

          {activeTab === 'dashboard' && stats && (
              <div className="space-y-6 animate-in fade-in">
                  <h2 className="text-2xl font-bold text-ink mb-6">Visão Geral</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-surface p-6 rounded-xl border border-line">
                          <h3 className="text-muted font-medium mb-2">Usuários</h3>
                          <p className="text-3xl font-bold text-ink">{stats.users?.count || 0}</p>
                      </div>
                      <div className="bg-surface p-6 rounded-xl border border-line">
                          <h3 className="text-muted font-medium mb-2">Lançamentos</h3>
                          <p className="text-3xl font-bold text-ink">{stats.transactions?.count || 0}</p>
                      </div>
                      <div className="bg-surface p-6 rounded-xl border border-line">
                          <h3 className="text-muted font-medium mb-2">Volume</h3>
                          <p className="text-3xl font-bold text-ok">R$ {(stats.transactions?.totalValue || 0).toLocaleString('pt-BR', { notation: 'compact' })}</p>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'users' && (
              <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-ink">Gerenciar Usuários</h2>
                      <button 
                        onClick={() => loadTabContent('users')} 
                        className="px-4 py-2 bg-sunken hover:bg-sunken text-muted rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                      >
                          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> Atualizar Lista
                      </button>
                  </div>
                  
                  <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-lg">
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-sunken text-muted font-bold uppercase text-xs">
                                  <tr>
                                      <th className="px-6 py-4">Razão Social</th>
                                      <th className="px-6 py-4">Email</th>
                                      <th className="px-6 py-4">CNPJ</th>
                                      <th className="px-6 py-4">Data Cadastro</th>
                                      <th className="px-6 py-4 text-center">Status</th>
                                      <th className="px-6 py-4 text-center">Ações</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                  {users.length === 0 ? (
                                      <tr><td colSpan={6} className="px-6 py-8 text-center text-faint">Nenhum usuário encontrado.</td></tr>
                                  ) : (
                                      users.map(u => (
                                          <tr key={u.id} className={`hover:bg-sunken/60 ${u.blocked ? 'bg-danger/10' : ''}`}>
                                              <td className={`px-6 py-4 font-medium ${u.blocked ? 'text-danger' : 'text-ink'}`}>{u.razao_social || 'Sem Nome'}</td>
                                              <td className="px-6 py-4 text-muted">{u.email}</td>
                                              <td className="px-6 py-4 text-muted font-mono text-xs">{u.cnpj}</td>
                                              <td className="px-6 py-4 text-faint text-xs">
                                                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                                              </td>
                                              <td className="px-6 py-4 text-center">
                                                  {u.blocked ? (
                                                      <span className="bg-danger/20 text-danger px-2 py-1 rounded text-xs font-bold border border-danger/30">BLOQUEADO</span>
                                                  ) : (
                                                      <span className="bg-brand/20 text-brand-fg px-2 py-1 rounded text-xs font-bold border border-ok/30">ATIVO</span>
                                                  )}
                                              </td>
                                              <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                                                  <button 
                                                    onClick={() => handleOpenUser(u)} 
                                                    className="p-2 bg-info/10 text-info rounded hover:bg-info/20" 
                                                    title="Ver Detalhes"
                                                  >
                                                      <Eye size={18}/>
                                                  </button> 
                                                  <button 
                                                    onClick={() => handleBlockUser(u.id, u.blocked)} 
                                                    className={`p-2 rounded ${u.blocked ? 'bg-brand/10 text-brand-fg hover:bg-brand/20' : 'bg-warn/10 text-warn hover:bg-warn/10'}`}
                                                    title={u.blocked ? "Desbloquear Usuário" : "Bloquear Usuário"}
                                                  >
                                                      {u.blocked ? <CheckCircle size={18}/> : <Ban size={18}/>}
                                                  </button>
                                                  <button 
                                                    onClick={() => handleDeleteUser(u.id, u.email)} 
                                                    className="p-2 bg-danger/10 text-danger rounded hover:bg-danger/20" 
                                                    title="Excluir Usuário"
                                                  >
                                                      <Trash2 size={18}/>
                                                  </button>
                                              </td>
                                          </tr>
                                      ))
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'banks' && (
              <div className="space-y-6 animate-in fade-in">
                  <h2 className="text-2xl font-bold text-ink">Bancos Globais</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-1">
                          <div className="bg-surface border border-line p-6 rounded-xl sticky top-6">
                              <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
                                  {editingBankId ? <Edit2 size={18} className="text-info"/> : <Plus size={18} className="text-ok"/>}
                                  {editingBankId ? 'Editar Banco' : 'Novo Banco'}
                              </h3>
                              <form onSubmit={handleSaveBank} className="space-y-4">
                                  <input type="text" required className="w-full bg-ground border border-line rounded-lg p-2 text-ink outline-none" value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="Nome da Instituição"/>
                                  <div className="mt-1 flex items-center gap-4">
                                      <div className="w-16 h-16 bg-white rounded-lg p-2 flex items-center justify-center border border-line overflow-hidden">
                                          {newBankLogo ? <img src={newBankLogo} className="max-w-full max-h-full object-contain"/> : <span className="text-muted text-xs">Sem logo</span>}
                                      </div>
                                      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLogoUpload} className="text-sm text-muted"/>
                                  </div>
                                  <div className="flex gap-2 pt-2">
                                      {editingBankId && <button type="button" onClick={handleCancelEdit} className="flex-1 py-2 bg-sunken text-muted rounded-lg">Cancelar</button>}
                                      <button type="submit" className="flex-1 py-2 bg-info text-white rounded-lg font-bold">Salvar</button>
                                  </div>
                              </form>
                          </div>
                      </div>
                      <div className="lg:col-span-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {adminBanks.map(bank => (
                                  <div key={bank.id} className="bg-surface border border-line p-4 rounded-xl flex items-center justify-between group">
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center"><img src={bank.logo} className="max-w-full max-h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src=''} /></div>
                                          <span className="font-medium text-ink">{bank.name}</span>
                                      </div>
                                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => handleEditBankClick(bank)} className="p-2 text-brand-fg hover:bg-info/10 rounded"><Edit2 size={16}/></button>
                                          <button onClick={() => handleDeleteBank(bank.id)} className="p-2 text-brand-fg hover:bg-danger/10 rounded"><Trash2 size={16}/></button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'audit' && (
              <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-lg">
                  <div className="p-4 border-b border-line flex justify-between items-center">
                      <h2 className="text-ink font-bold">Registros de Cadastros</h2>
                      <span className="text-muted text-sm">Total: {auditTotal} empresas</span>
                  </div>
                  <table className="w-full text-sm text-left">
                      <thead className="bg-sunken text-muted font-bold uppercase text-xs">
                          <tr><th className="px-6 py-4">Data e Hora</th><th className="px-6 py-4">Empresa (Razão Social)</th><th className="px-6 py-4">Email</th></tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                          {auditData.map((t, idx) => (
                              <tr key={idx} className="hover:bg-sunken/60">
                                  <td className="px-6 py-3 text-muted font-mono text-xs">{new Date(Number(t.created_at)).toLocaleString()}</td>
                                  <td className="px-6 py-3 text-info font-medium">{t.razao_social}</td>
                                  <td className="px-6 py-3 text-muted">{t.email}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  <div className="p-4 border-t border-line flex justify-between items-center text-sm">
                      <button 
                          disabled={auditPage === 0} 
                          onClick={() => setAuditPage(p => p - 1)}
                          className="px-4 py-2 border border-line rounded text-muted hover:bg-sunken disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Anterior
                      </button>
                      <span className="text-muted">Página {auditPage + 1} de {Math.ceil(auditTotal / 20) || 1}</span>
                      <button 
                          disabled={(auditPage + 1) * 20 >= auditTotal}
                          onClick={() => setAuditPage(p => p + 1)}
                          className="px-4 py-2 border border-line rounded text-muted hover:bg-sunken disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Próxima
                      </button>
                  </div>
              </div>
          )}
      </main>

      {/* User Details Modal (Atualizado com Filtros e OFX Original) */}
      {selectedUser && userDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="bg-surface border border-line w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-line flex justify-between bg-ground items-center">
                      <div className="flex flex-col gap-1">
                          <h2 className="text-2xl font-bold text-ink">{selectedUser.razao_social}</h2>
                          <div className="flex gap-4 text-xs text-muted">
                              <span>CNPJ: {selectedUser.cnpj}</span>
                              <span>Email: {selectedUser.email}</span>
                          </div>
                      </div>
                      <button onClick={() => setSelectedUser(null)} className="text-muted hover:text-ink bg-sunken p-2 rounded-full"><X size={20}/></button>
                  </div>

                  {/* Abas e Filtros */}
                  <div className="px-6 pt-4 bg-ground border-b border-line flex flex-col md:flex-row justify-between items-center gap-4">
                      <div className="flex bg-surface rounded-lg p-1 border border-line">
                          <button 
                            onClick={() => setDetailTab('transactions')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${detailTab === 'transactions' ? 'bg-sunken text-ink shadow' : 'text-muted hover:text-ink'}`}
                          >
                              Lançamentos
                          </button>
                          <button 
                            onClick={() => setDetailTab('ofx_files')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${detailTab === 'ofx_files' ? 'bg-sunken text-ink shadow' : 'text-muted hover:text-ink'}`}
                          >
                              Arquivos OFX
                          </button>
                      </div>

                      {detailTab === 'transactions' && (
                          <div className="flex items-center gap-3 bg-surface p-1.5 rounded-lg border border-line">
                              <span className="text-xs text-faint font-bold px-2">PERÍODO:</span>
                              <input 
                                  type="date" 
                                  value={startDate} 
                                  onChange={e => setStartDate(e.target.value)} 
                                  className="bg-ground border border-line rounded px-2 py-1 text-xs text-ink outline-none focus:border-brand"
                              />
                              <span className="text-faint text-xs">até</span>
                              <input 
                                  type="date" 
                                  value={endDate} 
                                  onChange={e => setEndDate(e.target.value)} 
                                  className="bg-ground border border-line rounded px-2 py-1 text-xs text-ink outline-none focus:border-brand"
                              />
                              <div className="w-px h-6 bg-sunken mx-1"></div>
                              <button 
                                onClick={() => exportToCSV(filterByDate(userDetails.transactions), selectedUser.razao_social)}
                                className="px-3 py-1 bg-brand hover:bg-brand text-ink text-xs font-bold rounded flex items-center gap-1 transition-colors"
                                title="Exportar Excel"
                              >
                                  <FileSpreadsheet size={14}/> CSV
                              </button>
                          </div>
                      )}
                  </div>

                  <div className="flex-1 overflow-auto p-6 bg-surface">
                      {detailTab === 'transactions' ? (
                          <>
                            <h3 className="text-ink font-bold mb-4 flex items-center gap-2">
                                <Receipt size={20} className="text-ok"/>
                                Histórico de Lançamentos
                            </h3>
                            <table className="w-full text-sm text-left">
                                <thead className="text-faint border-b border-line bg-surface sticky top-0">
                                    <tr>
                                        <th className="py-3">Data</th>
                                        <th className="py-3">Descrição</th>
                                        <th className="py-3">Banco</th>
                                        <th className="py-3 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {filterByDate(userDetails.transactions).length === 0 ? (
                                        <tr><td colSpan={4} className="py-8 text-center text-faint">Nenhum lançamento neste período.</td></tr>
                                    ) : (
                                        filterByDate(userDetails.transactions).map((t: any) => (
                                            <tr key={t.id} className="hover:bg-sunken/60">
                                                <td className="py-3 text-muted font-mono text-xs">{new Date(t.date).toLocaleDateString()}</td>
                                                <td className="py-3 text-ink">
                                                    {t.description}
                                                    <span className="block text-xs text-faint">{t.category_name || 'Sem categoria'}</span>
                                                </td>
                                                <td className="py-3 text-muted text-xs">{t.bank_name}</td>
                                                <td className={`py-3 text-right font-medium ${t.type==='credito'?'text-ok':'text-danger'}`}>
                                                    R$ {t.value.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                          </>
                      ) : (
                          <>
                            <h3 className="text-ink font-bold mb-4 flex items-center gap-2">
                                <HardDrive size={20} className="text-info"/>
                                Arquivos OFX Importados
                            </h3>
                            <div className="border border-line rounded-xl overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-faint border-b border-line bg-ground">
                                        <tr>
                                            <th className="px-6 py-3">Data Importação</th>
                                            <th className="px-6 py-3">Nome do Arquivo</th>
                                            <th className="px-6 py-3 text-center">Itens</th>
                                            <th className="px-6 py-3 text-right">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line bg-surface">
                                        {(!userDetails.ofxImports || userDetails.ofxImports.length === 0) ? (
                                            <tr><td colSpan={4} className="px-6 py-8 text-center text-faint">Nenhum arquivo importado.</td></tr>
                                        ) : (
                                            userDetails.ofxImports.map((file: any) => (
                                                <tr key={file.id} className="hover:bg-sunken/60">
                                                    <td className="px-6 py-4 text-muted text-xs font-mono">
                                                        {new Date(file.import_date || file.importDate).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-ink font-medium flex items-center gap-2">
                                                        <FileCode size={16} className="text-info"/>
                                                        {file.file_name || file.fileName}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-muted">
                                                        {file.transaction_count || file.transactionCount}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button 
                                                            onClick={() => downloadOriginalOFX(file.file_name || file.fileName, file.content)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-info/10 text-info hover:bg-info/20 border border-info/20 rounded text-xs font-bold transition-colors"
                                                        >
                                                            <Download size={14}/> Baixar OFX
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminPanel;