import React, { useState, useEffect, useMemo } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import BankList from './components/BankList';
import Reports from './components/Reports';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import SignUp from './components/SignUp';
import ResetPassword from './components/ResetPassword';
import FinalizeSignUp from './components/FinalizeSignUp';
import Forecasts from './components/Forecasts';
import OFXImports from './components/OFXImports';
import Categories from './components/Categories';
import KeywordRules from './components/KeywordRules';
import Tutorial from './components/Tutorial';
import AdminPanel from './components/AdminPanel';
import IntegrationConfig from './components/IntegrationConfig';
import Planning from './components/Planning';
import { Transaction, Bank, Category, Forecast, KeywordRule, CreditCard } from './types';
import { AlertTriangle, RefreshCcw, Lock, LogOut } from 'lucide-react';
import { saveSession, clearSession, realFetch } from './lib/http';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null); 
  const [token, setToken] = useState<string | null>(null);
  const [authView, setAuthView] = useState<'login' | 'forgot' | 'signup' | 'reset' | 'finalize'>('login');
  const [urlToken, setUrlToken] = useState<string | null>(null); 
  const [isLoading, setIsLoading] = useState(false);
  const [isAppError, setIsAppError] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [banks, setBanks] = useState<Bank[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const tokenParam = params.get('token');

    if (action && tokenParam) {
        setUrlToken(tokenParam);
        if (action === 'finalize') setAuthView('finalize');
        else if (action === 'reset') setAuthView('reset');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        // Tenta recuperar de localStorage (Persistente) ou sessionStorage (Sessão atual)
        const savedToken = localStorage.getItem('finance_app_token') || sessionStorage.getItem('finance_app_token');
        const savedUser = localStorage.getItem('finance_app_user') || sessionStorage.getItem('finance_app_user');
        
        if (savedToken && savedUser) {
            try {
                setToken(savedToken);
                setUser(JSON.parse(savedUser));
                setIsAuthenticated(true);
            } catch (e) {
                handleLogout();
            }
        }
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && token && user?.role !== 'admin' && !user?.blocked) {
        fetchInitialData();
    }
  }, [isAuthenticated, token, user]);

  // O patch de fetch (lib/http) dispara este evento quando o refresh token
  // também falha — encerra a sessão localmente, sem nova chamada de rede.
  useEffect(() => {
    const onForcedLogout = () => {
        clearSession();
        setIsAuthenticated(false);
        setIsAppError(false);
        setUser(null);
        setToken(null);
        setAuthView('login');
    };
    const onRefreshed = (e: Event) => {
        const next = (e as CustomEvent)?.detail?.token;
        if (next) setToken(next);
    };
    window.addEventListener('auth:logout', onForcedLogout);
    window.addEventListener('auth:refreshed', onRefreshed);
    return () => {
        window.removeEventListener('auth:logout', onForcedLogout);
        window.removeEventListener('auth:refreshed', onRefreshed);
    };
  }, []);

  // CÁLCULO DE SALDO (Conciliado + Pendente conforme solicitado)
  const banksWithBalance = useMemo(() => {
      return banks.map(bank => {
          // Filtra transações deste banco (EXCLUINDO CARTÃO DE CRÉDITO)
          const bankTxs = transactions.filter(t => t.bankId === bank.id && !t.creditCardId);
          
          const balance = bankTxs.reduce((acc, t) => {
              const val = Math.abs(t.value);
              const isCredit = t.type === 'credito' || String(t.type).toLowerCase().includes('receita');
              return isCredit ? acc + val : acc - val;
          }, 0);
          
          return { ...bank, balance };
      });
  }, [banks, transactions]);

  // JWT Helper - Usa o token do estado para garantir sincronia
  const apiFetch = async (url: string, options: RequestInit = {}) => {
      // Prioriza o token do estado, mas faz fallback para storage
      const activeToken = token || localStorage.getItem('finance_app_token') || sessionStorage.getItem('finance_app_token');
      
      const headers = { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`,
          ...options.headers 
      };
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
          handleLogout();
          throw new Error("Sessão expirada");
      }
      return res;
  };

  const fetchInitialData = async () => {
      setIsAppError(false);
      try {
          await Promise.all([
              fetchBanks(),
              fetchCreditCards(),
              fetchCategories(),
              fetchTransactions(),
              fetchForecasts(),
              fetchKeywordRules()
          ]);
      } catch (e: any) {
          console.error("Erro ao carregar dados", e);
          if (e.message !== "Sessão expirada") {
              setIsAppError(true);
          }
      }
  };

  const fetchBanks = async () => {
      const res = await apiFetch('/api/banks');
      if (res.ok) setBanks(await res.json());
  };
  const fetchCreditCards = async () => {
      const res = await apiFetch('/api/credit-cards');
      if (res.ok) setCreditCards(await res.json());
  };
  const fetchCategories = async () => {
      const res = await apiFetch('/api/categories');
      if (res.ok) setCategories(await res.json());
  };
  const fetchTransactions = async () => {
      const res = await apiFetch('/api/transactions');
      if (res.ok) setTransactions(await res.json());
  };
  const fetchForecasts = async () => {
      const res = await apiFetch('/api/forecasts');
      if (res.ok) setForecasts(await res.json());
  };
  const fetchKeywordRules = async () => {
      const res = await apiFetch('/api/keyword-rules');
      if (res.ok) setKeywordRules(await res.json());
  };

  const handleAddCategory = async (cat: any) => {
      const res = await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(cat) });
      if(res.ok) fetchCategories();
  };
  const handleDeleteCategory = async (id: number) => {
      if(confirm('Excluir?')) { await apiFetch(`/api/categories/${id}`, { method: 'DELETE' }); fetchCategories(); }
  };
  const handleUpdateCategory = async (cat: Category) => {
      await apiFetch(`/api/categories/${cat.id}`, { method: 'PUT', body: JSON.stringify(cat) });
      fetchCategories();
  }

  const handleAddTransaction = async (tx: any) => {
      const res = await apiFetch('/api/transactions', { method: 'POST', body: JSON.stringify(tx) });
      if(res.ok) fetchTransactions();
  };
  const handleEditTransaction = async (id: number, tx: any) => {
      const res = await apiFetch(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(tx) });
      if(res.ok) fetchTransactions();
  };
  const handleDeleteTransaction = async (id: number) => {
      if(confirm('Excluir?')) { await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' }); fetchTransactions(); }
  };
  const handleReconcile = async (id: number) => {
      const tx = transactions.find(t => t.id === id);
      if(tx) { await apiFetch(`/api/transactions/${id}/reconcile`, { method: 'PATCH', body: JSON.stringify({reconciled: !tx.reconciled}) }); fetchTransactions(); }
  };
  const handleBatchTransactions = async (ids: number[], set: any) => {
      const res = await apiFetch('/api/transactions/batch', { method: 'PATCH', body: JSON.stringify({ ids, set }) });
      await Promise.all([fetchTransactions(), fetchBanks()]);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Erro na edição em lote'); }
      return res.json().catch(() => ({}));
  };
  const handleUpdateBank = async (b: any) => {
      await apiFetch(`/api/banks/${b.id}`, { method: 'PUT', body: JSON.stringify(b) }); fetchBanks();
  };
  const handleAddBank = async (b: any) => {
      const res = await apiFetch('/api/banks', { method: 'POST', body: JSON.stringify(b) }); if(res.ok) fetchBanks();
  };
  const handleDeleteBank = async (id: number) => {
      await apiFetch(`/api/banks/${id}`, { method: 'DELETE' }); fetchBanks();
  };
  const handleAddCreditCard = async (c: any) => {
      const res = await apiFetch('/api/credit-cards', { method: 'POST', body: JSON.stringify(c) }); if(res.ok) fetchCreditCards();
  };
  const handleUpdateCreditCard = async (c: any) => {
      await apiFetch(`/api/credit-cards/${c.id}`, { method: 'PUT', body: JSON.stringify(c) }); fetchCreditCards();
  };
  const handleDeleteCreditCard = async (id: number) => {
      await apiFetch(`/api/credit-cards/${id}`, { method: 'DELETE' }); fetchCreditCards();
  };
  const handleAddKeywordRule = async (r: any) => {
      const res = await apiFetch('/api/keyword-rules', { method: 'POST', body: JSON.stringify(r) }); 
      if(res.ok) {
          fetchKeywordRules();
      } else {
          alert("Erro ao adicionar regra. Verifique os dados.");
      }
  };
  const handleDeleteKeywordRule = async (id: number) => {
      await apiFetch(`/api/keyword-rules/${id}`, { method: 'DELETE' }); fetchKeywordRules();
  };
  const handleApplyKeywordRule = async (id: number) => {
      const res = await apiFetch(`/api/keyword-rules/${id}/apply`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) await fetchTransactions();
      return res.ok ? { updated: j.updated ?? 0 } : undefined;
  };

  const handleLogout = () => {
      // Revoga a sessão no servidor (best-effort — não bloqueia a UI).
      const rt = localStorage.getItem('finance_app_refresh') || sessionStorage.getItem('finance_app_refresh');
      if (rt) {
          realFetch('/api/auth/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: rt }),
          }).catch(() => {});
      }

      setIsAuthenticated(false);
      setIsAppError(false);
      setUser(null);
      setToken(null);

      // Limpa token + refresh + user de ambos os storages.
      clearSession();

      setAuthView('login');
  };

  const handleLogin = async (data: any, rememberMe: boolean) => {
    setIsLoading(true);
    try {
        const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        if (res.ok) {
            const responseData = await res.json();
            setUser(responseData.user);
            setToken(responseData.token);
            setIsAuthenticated(true);

            // access + refresh token no store certo (localStorage = "lembrar de mim").
            saveSession(responseData, rememberMe);
            const store = rememberMe ? localStorage : sessionStorage;
            store.setItem('finance_app_user', JSON.stringify(responseData.user));
        } else {
            const err = await res.json();
            alert(err.error || "Erro no login");
        }
    } catch (e) { alert("Erro de conexão"); } finally { setIsLoading(false); }
  };

  const handleForgotPassword = async (email: string) => {
      const res = await fetch('/api/recover-password', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ email }) });
      if (!res.ok) throw new Error("Erro ao recuperar senha");
  };

  if (isAppError) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-ground text-ink p-4 text-center">
              <AlertTriangle className="text-danger w-12 h-12 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Serviço Indisponível</h2>
              <button onClick={fetchInitialData} className="flex items-center gap-2 bg-brand px-6 py-2 rounded-lg text-white font-bold hover:bg-brand-strong mt-4"><RefreshCcw size={18} /> Tentar Novamente</button>
              <button onClick={handleLogout} className="mt-4 text-sm text-faint underline hover:text-muted">Voltar ao Login</button>
          </div>
      );
  }

  if (!isAuthenticated) {
    if (authView === 'forgot') return <ForgotPassword onBack={() => setAuthView('login')} onSubmit={handleForgotPassword} />;
    if (authView === 'signup') return <SignUp onBack={() => setAuthView('login')} isLoading={isLoading} />;
    if (authView === 'finalize') return <FinalizeSignUp token={urlToken || ''} onSuccess={() => { setAuthView('login'); setUrlToken(null); }} />;
    if (authView === 'reset') return <ResetPassword token={urlToken || ''} onSuccess={() => setAuthView('login')} />;
    return <Login onLogin={handleLogin} onForgotPassword={() => setAuthView('forgot')} onSignUp={() => setAuthView('signup')} isLoading={isLoading} />;
  }

  // --- BLOCKED USER MODAL ---
  if (user?.blocked) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground p-4">
              <div className="bg-surface border border-danger/50/50 rounded-2xl shadow-2xl w-full max-w-lg p-8 text-center animate-in fade-in zoom-in duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-danger"></div>
                  <div className="w-20 h-20 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-danger/50/20">
                      <Lock size={40} className="text-danger" />
                  </div>
                  <h2 className="text-3xl font-bold text-ink mb-4">Acesso Bloqueado</h2>
                  <p className="text-muted text-lg mb-2">
                      Existem pendências financeiras ou cadastrais em sua conta.
                  </p>
                  <p className="text-muted mb-8 text-sm leading-relaxed">
                      Por favor, entre em contato com nosso departamento financeiro para regularizar sua situação e restabelecer o acesso ao sistema.
                  </p>
                  
                  <div className="bg-sunken rounded-xl p-4 border border-line mb-8">
                      <p className="text-sm font-medium text-muted mb-1">Canal de Atendimento:</p>
                      <a href="mailto:suporte@virgulacontabil.com.br" className="text-brand hover:underline font-bold text-lg block">
                          suporte@virgulacontabil.com.br
                      </a>
                  </div>

                  <button 
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-sunken hover:bg-sunken text-ink rounded-lg font-medium transition-colors border border-line"
                  >
                      <LogOut size={18} /> Sair do Sistema
                  </button>
              </div>
          </div>
      );
  }

  if (user?.role === 'admin') return <AdminPanel token={token || ''} onLogout={handleLogout} />;

  const activeBanks = banksWithBalance.filter(b => b.active);
  const currentToken = token || '';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard token={currentToken} userId={user.id} transactions={transactions} banks={activeBanks} forecasts={forecasts} categories={categories} onRefresh={fetchInitialData} />;
      case 'transactions': return <Transactions userId={user.id} transactions={transactions} banks={activeBanks} creditCards={creditCards} categories={categories} onAddTransaction={handleAddTransaction} onEditTransaction={handleEditTransaction} onDeleteTransaction={handleDeleteTransaction} onReconcile={handleReconcile} onBatch={handleBatchTransactions} />;
      case 'import': return <OFXImports token={currentToken} userId={user.id} banks={activeBanks} keywordRules={keywordRules} transactions={transactions} onTransactionsImported={fetchInitialData} />;
      case 'rules': return <KeywordRules categories={categories} rules={keywordRules} banks={activeBanks} onAddRule={handleAddKeywordRule} onDeleteRule={handleDeleteKeywordRule} onApplyRule={handleApplyKeywordRule} />;
      case 'banks': return <BankList banks={banksWithBalance} creditCards={creditCards} transactions={transactions} onUpdateBank={handleUpdateBank} onAddBank={handleAddBank} onDeleteBank={handleDeleteBank} onAddCreditCard={handleAddCreditCard} onUpdateCreditCard={handleUpdateCreditCard} onDeleteCreditCard={handleDeleteCreditCard} />;
      case 'categories': return <Categories categories={categories} onAddCategory={handleAddCategory} onDeleteCategory={handleDeleteCategory} onUpdateCategory={handleUpdateCategory} />;
      case 'integration': return <IntegrationConfig categories={categories} banks={activeBanks} />;
      case 'reports': return <Reports token={currentToken} transactions={transactions} categories={categories} />;
      case 'planning': return <Planning token={currentToken} categories={categories} />;
      case 'forecasts': return <Forecasts token={currentToken} userId={user.id} banks={activeBanks} creditCards={creditCards} transactions={transactions} categories={categories} onUpdate={fetchInitialData} onNavigate={setActiveTab} />;
      case 'tutorial': return <Tutorial />;
      default: return <Dashboard token={currentToken} userId={user.id} transactions={transactions} banks={activeBanks} forecasts={forecasts} categories={categories} onRefresh={fetchInitialData} />;
    }
  };

  return <Layout activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} userName={user?.razaoSocial}>{renderContent()}</Layout>;
}

export default App;