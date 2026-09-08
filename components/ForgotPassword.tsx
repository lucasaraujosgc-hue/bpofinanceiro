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
      <div className="min-h-screen bg-ground flex items-center justify-center p-4">
        <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-line">
          <div className="w-16 h-16 bg-brand/10 text-white rounded-full flex items-center justify-center mx-auto mb-6 border border-ok/20">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-ink mb-2">Email Enviado!</h2>
          <p className="text-muted mb-8">
            Enviamos as instruções de recuperação de senha para <strong>{email}</strong>. Verifique sua caixa de entrada.
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
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-line">
        <div className="p-6 border-b border-line flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-sunken rounded-lg text-muted transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-bold text-ink">Recuperação de Senha</h2>
        </div>

        <div className="p-8">
          <p className="text-muted mb-6 text-sm">
            Digite seu email cadastrado abaixo e lhe enviaremos um link seguro para redefinir sua senha.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Email Cadastrado</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-line rounded-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all text-ink placeholder-faint"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand text-white py-3 rounded-lg font-bold hover:bg-brand-strong transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-md"
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