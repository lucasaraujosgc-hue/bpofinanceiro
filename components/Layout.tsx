import React, { ReactNode } from 'react';
import { LayoutDashboard, Receipt, PieChart, Landmark, LogOut, Menu, ArrowUpRight, FileSpreadsheet, Tags, User, ChevronDown, FileCog, BookOpen } from 'lucide-react';
import Logo from './Logo';
import { ThemeToggle } from './ThemeToggle';

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
    <div className="flex h-screen bg-ground overflow-hidden text-ink">
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
        w-64 bg-surface border-r border-line transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full flex flex-col">
          
          {/* Top User Section */}
          <div className="p-3 bg-ground border-b border-line">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-sunken flex items-center justify-center text-brand border border-line">
                        <User size={16} />
                    </div>
                    <span className="font-semibold text-ink text-sm truncate max-w-[120px]" title={displayUser}>
                        {displayUser}
                    </span>
                </div>
                <ChevronDown size={16} className="text-faint" />
             </div>
          </div>

          {/* App Header */}
          <div className="px-4 py-5 flex items-center justify-between">
             <Logo size="md" />
             <ThemeToggle />
          </div>

          <nav className="flex-1 px-3 space-y-4 overflow-y-auto custom-scroll">
            
            {/* Main Action Group */}
            <div className="space-y-0.5">
                <button
                  onClick={() => { onTabChange('dashboard'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'dashboard' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                  `}
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </button>

                <button
                  onClick={() => { onTabChange('forecasts'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'forecasts' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                  `}
                >
                  <ArrowUpRight size={16} />
                  Previsões
                </button>

                <button
                  onClick={() => { onTabChange('transactions'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'transactions' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                  `}
                >
                  <Receipt size={16} />
                  Lançamentos
                </button>

                <button
                  onClick={() => { onTabChange('import'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'import' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                  `}
                >
                  <FileSpreadsheet size={16} />
                  Importar Extrato
                </button>

                <button
                  onClick={() => { onTabChange('rules'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${activeTab === 'rules' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                  `}
                >
                  <FileCog size={16} />
                  Regras de Importação
                </button>
            </div>

            {/* Cadastros */}
            <div>
                <div className="text-[10px] font-semibold text-faint uppercase tracking-wider mb-1 px-2">Cadastros</div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => { onTabChange('banks'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'banks' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                        `}
                    >
                        <Landmark size={16} />
                        Bancos
                    </button>
                    <button
                        onClick={() => { onTabChange('categories'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'categories' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                        `}
                    >
                        <Tags size={16} />
                        Categorias
                    </button>
                    <button
                        onClick={() => { onTabChange('integration'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'integration' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                        `}
                    >
                        <FileCog size={16} />
                        Configurações
                    </button>
                </div>
            </div>

            {/* Relatórios */}
            <div>
                <div className="text-[10px] font-semibold text-faint uppercase tracking-wider mb-1 px-2">Análises</div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => { onTabChange('reports'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'reports' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                        `}
                    >
                        <PieChart size={16} />
                        Relatórios Financeiros
                    </button>
                </div>
            </div>

            {/* Ajuda */}
            <div>
                <div className="text-[10px] font-semibold text-faint uppercase tracking-wider mb-1 px-2">Ajuda</div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => { onTabChange('tutorial'); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                            ${activeTab === 'tutorial' ? 'bg-brand/10 text-brand border border-brand/20' : 'text-muted hover:text-ink hover:bg-sunken'}
                        `}
                    >
                        <BookOpen size={16} />
                        Tutorial
                    </button>
                </div>
            </div>

          </nav>

          <div className="p-3 border-t border-line">
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-white hover:bg-danger/10 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-ground">
        {/* Mobile Header */}
        <header className="lg:hidden bg-surface border-b border-line p-4 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-muted hover:bg-sunken rounded-lg"
            >
              <Menu size={24} />
            </button>
          </div>
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