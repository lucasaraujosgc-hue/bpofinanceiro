import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, CheckCircle2, UserCheck } from 'lucide-react';

interface FinalizeSignUpProps {
  token: string;
  onSuccess: () => void;
}

const FinalizeSignUp: React.FC<FinalizeSignUpProps> = ({ token, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [userInfo, setUserInfo] = useState<{email: string, razaoSocial: string} | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    // Validate token and fetch user info
    fetch(`/api/validate-signup-token/${token}`)
        .then(res => {
            if (!res.ok) throw new Error("Link inválido ou expirado.");
            return res.json();
        })
        .then(data => {
            setUserInfo(data);
        })
        .catch(err => {
            setTokenError(err.message);
        });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        alert("As senhas não coincidem.");
        return;
    }
    
    setIsLoading(true);
    try {
        const res = await fetch('/api/complete-signup', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token, password })
        });

        if (res.ok) {
            setIsSuccess(true);
        } else {
            const err = await res.json();
            alert(err.error || "Erro ao criar senha.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    } finally {
        setIsLoading(false);
    }
  };

  if (tokenError) {
      return (
          <div className="min-h-screen bg-ground flex items-center justify-center p-4">
              <div className="bg-surface p-8 rounded-xl border border-danger/30 text-center max-w-md">
                  <h2 className="text-xl font-bold text-danger mb-2">Link Inválido</h2>
                  <p className="text-muted">{tokenError}</p>
                  <button onClick={onSuccess} className="mt-4 text-brand hover:underline">Voltar ao início</button>
              </div>
          </div>
      );
  }

  if (isSuccess) {
      return (
        <div className="min-h-screen bg-ground flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-line">
            <div className="w-16 h-16 bg-brand/10 text-brand-fg rounded-full flex items-center justify-center mx-auto mb-6 border border-ok/20">
                <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-2">Conta Ativada!</h2>
            <p className="text-muted mb-8">
                Sua senha foi cadastrada com sucesso. Você já pode acessar o sistema.
            </p>
            <button
                onClick={onSuccess}
                className="w-full bg-brand text-white py-3 rounded-lg font-bold hover:bg-brand-strong transition-colors shadow-md"
            >
                Fazer Login
            </button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-line">
        <div className="p-8 bg-ground text-center border-b border-line">
            <div className="w-16 h-16 bg-brand/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-brand/30">
                <UserCheck className="w-8 h-8 text-brand" />
            </div>
            <h2 className="text-2xl font-bold text-ink">Criar Senha</h2>
            {userInfo && <p className="text-muted mt-2 text-sm">{userInfo.razaoSocial}</p>}
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={20} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-line rounded-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all text-ink placeholder-faint"
                  placeholder="Sua senha segura"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Confirmar Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={20} />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-line rounded-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all text-ink placeholder-faint"
                  placeholder="Repita a senha"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand text-white py-3 rounded-lg font-bold hover:bg-brand-strong transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
            >
              {isLoading ? (
                'Salvando...'
              ) : (
                <>
                  Ativar Conta <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FinalizeSignUp;