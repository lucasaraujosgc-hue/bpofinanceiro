import React, { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface ForgotPasswordProps {
  onBack: () => void;
  onSubmit: (email: string) => Promise<void>;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack, onSubmit }) => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
        await onSubmit(email);
        setIsSubmitted(true);
    } catch (error: any) {
        alert(error.message);
    } finally {
        setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-800">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Email Enviado!</h2>
          <p className="text-slate-400 mb-8">
            Enviamos as instruções de recuperação de senha para <strong>{email}</strong>. Verifique sua caixa de entrada.
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
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-800">
        <div className="p-6 border-b border-slate-800 flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-bold text-white">Recuperação de Senha</h2>
        </div>

        <div className="p-8">
          <p className="text-slate-400 mb-6 text-sm">
            Digite seu email cadastrado abaixo e lhe enviaremos um link seguro para redefinir sua senha.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email Cadastrado</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder-slate-600"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-slate-950 py-3 rounded-lg font-bold hover:bg-primaryHover transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/50"
            >
              {isLoading ? 'Enviando...' : 'Enviar Link de Recuperação'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;