import React, { useState } from 'react';
import { Mail, ArrowRight, UserPlus, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface PreSignUpProps {
  onBack: () => void;
  isLoading: boolean;
}

const PreSignUp: React.FC<PreSignUpProps> = ({ onBack, isLoading }) => {
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoading(true);

    try {
        const res = await fetch('/api/request-signup', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        });
        
        if (res.ok) {
            setIsSent(true);
        } else {
            const err = await res.json();
            alert(err.error || "Erro ao solicitar cadastro");
        }
    } catch (e) {
        alert("Erro de conexão");
    } finally {
        setLocalLoading(false);
    }
  };

  if (isSent) {
      return (
        <div className="min-h-screen bg-ground flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-line">
            <div className="w-16 h-16 bg-brand/10 text-white rounded-full flex items-center justify-center mx-auto mb-6 border border-ok/20">
                <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-2">Verifique seu E-mail</h2>
            <p className="text-muted mb-8">
                Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para continuar o cadastro da sua empresa.
            </p>
            <button
                onClick={onBack}
                className="w-full bg-sunken text-ink py-3 rounded-lg font-semibold hover:bg-sunken transition-colors border border-line"
            >
                Voltar para o Login
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
                <UserPlus className="w-8 h-8 text-brand" />
            </div>
            <h2 className="text-2xl font-bold text-ink">Criar Nova Conta</h2>
            <p className="text-muted mt-2">Informe seu e-mail para iniciar o cadastro</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Email Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-line rounded-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all text-ink placeholder-faint"
                  placeholder="empresa@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={localLoading || isLoading}
              className="w-full bg-brand text-white py-3 rounded-lg font-bold hover:bg-brand-strong transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-md"
            >
              {localLoading ? (
                'Enviando...'
              ) : (
                <>
                  Continuar <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
             <button 
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-faint hover:text-ink mx-auto transition-colors"
             >
                <ArrowLeft size={16}/> Voltar ao login
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreSignUp;