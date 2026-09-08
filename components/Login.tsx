import React, { useState } from 'react';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import Logo from './Logo';
import { ThemeToggle } from './ThemeToggle';

interface LoginProps {
  onLogin: (data: any, rememberMe: boolean) => void;
  onForgotPassword: () => void;
  onSignUp: () => void;
  isLoading: boolean;
}

const FIELD =
  'w-full rounded-lg bg-sunken border border-line pl-9 pr-4 py-2.5 text-sm text-ink placeholder:text-faint transition-colors outline-none focus:border-brand focus:bg-surface';

const Login: React.FC<LoginProps> = ({ onLogin, onForgotPassword, onSignUp, isLoading }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({ email, password }, rememberMe);
  };

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl bg-surface border border-line shadow-lg overflow-hidden">
        <div className="px-8 pt-9 pb-7 text-center border-b border-line">
          <Logo size="lg" className="mx-auto mb-3" />
          <p className="text-muted text-sm mt-1">Acesse seus indicadores financeiros</p>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD}
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={FIELD}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center pt-1">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line text-brand focus:ring-brand"
              />
              <label htmlFor="remember-me" className="ml-2 block text-xs text-muted">
                Permanecer conectado
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? 'Entrando...' : <>Acessar Sistema <ArrowRight size={18} /></>}
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-2 text-center border-t border-line pt-4">
            <button onClick={onForgotPassword} className="text-xs text-faint hover:text-brand transition-colors">
              Esqueceu sua senha? Recuperar acesso
            </button>
            <button
              onClick={onSignUp}
              className="text-xs font-semibold text-brand hover:text-brand-strong transition-colors mt-1"
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
