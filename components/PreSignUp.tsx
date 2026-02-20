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
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-800">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Verifique seu E-mail</h2>
            <p className="text-slate-400 mb-8">
                Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para continuar o cadastro da sua empresa.
            </p>
            <button
                onClick={onBack}
                className="w-full bg-slate-800 text-white py-3 rounded-lg font-semibold hover:bg-slate-700 transition-colors border border-slate-700"
            >
                Voltar para o Login
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
                <UserPlus className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white">Criar Nova Conta</h2>
            <p className="text-slate-400 mt-2">Informe seu e-mail para iniciar o cadastro</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder-slate-600"
                  placeholder="empresa@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={localLoading || isLoading}
              className="w-full bg-primary text-slate-950 py-3 rounded-lg font-bold hover:bg-primaryHover transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/50"
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
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-white mx-auto transition-colors"
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