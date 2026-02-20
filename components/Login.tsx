import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, Wallet } from 'lucide-react';

interface LoginProps {
  onLogin: (data: any, rememberMe: boolean) => void;
  onForgotPassword: () => void;
  onSignUp: () => void;
  isLoading: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, onForgotPassword, onSignUp, isLoading }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({ email, password }, rememberMe);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="p-6 bg-slate-950 text-center border-b border-slate-800">
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-primary/30">
            <Wallet className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-white">Virgula Contábil</h2>
          <p className="text-slate-400 text-sm mt-1">Acesse seus indicadores financeiros</p>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-white placeholder-slate-600"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-300">Senha</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-white placeholder-slate-600"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center pt-1">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 text-primary focus:ring-primary border-slate-700 rounded bg-slate-800"
              />
              <label htmlFor="remember-me" className="ml-2 block text-xs text-slate-400">
                Permanecer conectado
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-slate-950 py-2.5 rounded-lg font-bold hover:bg-primaryHover transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/50 text-sm"
            >
              {isLoading ? (
                'Entrando...'
              ) : (
                <>
                  Acessar Sistema <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-2 text-center border-t border-slate-800 pt-4">
            <button 
              onClick={onForgotPassword}
              className="text-xs text-slate-500 hover:text-primary transition-colors"
            >
              Esqueceu sua senha? Recuperar acesso
            </button>
            
            <button 
              onClick={onSignUp}
              className="text-xs font-semibold text-primary hover:text-emerald-400 transition-colors mt-1"
            >
              Primeiro acesso? Crie sua conta empresarial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;