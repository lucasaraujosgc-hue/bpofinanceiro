import React, { useState } from 'react';
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

interface ResetPasswordProps {
  token: string;
  onSuccess: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ token, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        alert("As senhas não coincidem.");
        return;
    }
    
    setIsLoading(true);
    try {
        const res = await fetch('/api/reset-password-confirm', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token, newPassword: password })
        });

        if (res.ok) {
            setIsSuccess(true);
        } else {
            const err = await res.json();
            alert(err.error || "Erro ao redefinir senha. O link pode ter expirado.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    } finally {
        setIsLoading(false);
    }
  };

  if (isSuccess) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-800">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Senha Alterada!</h2>
            <p className="text-slate-400 mb-8">
                Sua senha foi atualizada com sucesso. Você já pode acessar sua conta.
            </p>
            <button
                onClick={onSuccess}
                className="w-full bg-primary text-slate-900 py-3 rounded-lg font-bold hover:bg-primaryHover transition-colors shadow-lg shadow-emerald-900/50"
            >
                Ir para o Login
            </button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="p-8 bg-slate-950 text-center border-b border-slate-800">
            <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
                <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white">Nova Senha</h2>
            <p className="text-slate-400 mt-2">Crie uma nova senha segura para sua conta</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder-slate-600"
                  placeholder="Nova senha"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder-slate-600"
                  placeholder="Confirme a senha"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-slate-950 py-3 rounded-lg font-bold hover:bg-primaryHover transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/50"
            >
              {isLoading ? (
                'Alterando...'
              ) : (
                <>
                  Alterar Senha <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;