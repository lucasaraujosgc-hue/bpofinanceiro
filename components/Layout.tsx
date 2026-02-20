import React, { ReactNode } from 'react';
import { LayoutDashboard, Receipt, PieChart, Landmark, LogOut, Menu, ArrowUpRight, FileSpreadsheet, Tags, Scale, Calculator, User, ChevronDown, FileCog, BookOpen } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  userName?: string; 
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, onLogout, userName }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const displayUser = userName || 'Empresa';

  return (
    <div className="flex h-screen bg-background overflow-hidden text-slate-200">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/70 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-surface border-r border-slate-800 transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full flex flex-col">
          
          {/* Top User Section */}
          <div className="p-3 bg-slate-950 border-b border-slate-800">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-primary border border-slate-700">
                        <User size={16} />
                    </div>
                    <span className="font-semibold text-slate-200 text-sm truncate max-w-[120px]" title={displayUser}>
                        {displayUser}
                    </span>
                </div>
                <ChevronDown size={16} className="text-slate-500" />
             </div>
          </div>

          {/* App Header */}
          <div className="px-4 py-4 flex items-center gap-3">
             <div className="p-1.5 bg-primary/10 rounded-lg">
                <Landmark className="text-primary" size={18} />
             </div>
             <span className="font-bold text-base text-white">Virgula Contábil</span>
          </div>

          <nav className="flex-1 px-3 space-y-4 overflow-y-auto custom-scroll">
            
            {/* Main Action Group */}
            <div className="space-y-0.5">
                <button
                  onClick={() => { onTabChange('dashboard'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'dashboard' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                  `}
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </button>

                <button
                  onClick={() => { onTabChange('forecasts'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'forecasts' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                  `}
                >
                  <ArrowUpRight size={16} />
                  Previsões
                </button>

                <button
                  onClick={() => { onTabChange('transactions'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'transactions' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                  `}
                >
                  <Receipt size={16} />
                  Lançamentos
                </button>

                <button
                  onClick={() => { onTabChange('import'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'import' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                  `}
                >
                  <FileSpreadsheet size={16} />
                  Importar Extrato
                </button>

                <button
                  onClick={() => { onTabChange('rules'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'rules' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                  `}
                >
                  <FileCog size={16} />
                  Regras de Importação
                </button>
            </div>

            {/* Cadastros */}
            <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 px-2">Cadastros</div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => { onTabChange('banks'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'banks' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                        `}
                    >
                        <Landmark size={16} />
                        Bancos
                    </button>
                    <button
                        onClick={() => { onTabChange('categories'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'categories' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                        `}
                    >
                        <Tags size={16} />
                        Categorias
                    </button>
                </div>
            </div>

            {/* Relatórios */}
            <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 px-2">Análises</div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => { onTabChange('reports'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'reports' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                        `}
                    >
                        <PieChart size={16} />
                        Relatórios Financeiros
                    </button>
                </div>
            </div>

            {/* Ajuda */}
            <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 px-2">Ajuda</div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => { onTabChange('tutorial'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'tutorial' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                        `}
                    >
                        <BookOpen size={16} />
                        Tutorial
                    </button>
                </div>
            </div>

          </nav>

          <div className="p-3 border-t border-slate-800">
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Mobile Header */}
        <header className="lg:hidden bg-surface border-b border-slate-800 p-4 flex items-center justify-between">
          <span className="font-bold text-lg text-white">Virgula Contábil</span>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-400 hover:bg-slate-800 rounded-lg"
          >
            <Menu size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-auto custom-scroll p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;