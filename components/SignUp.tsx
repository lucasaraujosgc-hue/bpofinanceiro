import React, { useState } from 'react';
import { UserPlus, Mail, Building2, Phone, FileText, ArrowRight, ShieldCheck, X, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface SignUpProps {
  onBack: () => void;
  isLoading: boolean;
}

const TERMS_CONTENT = `
1. ACEITAÇÃO DOS TERMOS

Ao acessar, cadastrar-se ou utilizar o Sistema de Conciliação Financeira (“Sistema”), o usuário (“Usuário”) declara ter lido, compreendido e concordado integralmente com estes Termos e Condições de Uso (“Termos”).

Caso o Usuário não concorde com quaisquer disposições aqui previstas, deverá abster-se de utilizar o Sistema.

O Sistema é disponibilizado por VIRGULA CONTABIL LTDA, pessoa jurídica de direito privado, inscrita no CNPJ nº 52.613.515/0001-60, doravante denominada simplesmente “VIRGULA CONTABIL”.

2. DESCRIÇÃO DO SERVIÇO

O Sistema consiste em uma plataforma digital destinada ao gerenciamento, organização e conciliação de informações financeiras, com finalidade de apoio à gestão e à prestação de serviços contábeis.

Dentre suas funcionalidades, incluem-se, sem limitação:

Registro e categorização de lançamentos financeiros;

Importação de extratos bancários (OFX, PDF ou outros formatos suportados);

Geração de relatórios financeiros, como fluxo de caixa e demonstrativos simplificados;

Controle de lançamentos recorrentes e previsões financeiras.

O Sistema não substitui a atuação profissional do contador, tampouco exime o Usuário de suas obrigações legais, fiscais, trabalhistas ou financeiras.

3. CADASTRO, CONTA E SEGURANÇA
3.1. Elegibilidade

O Usuário declara ser maior de 18 (dezoito) anos e possuir plena capacidade civil para celebrar este contrato.

3.2. Informações de Cadastro

O Usuário compromete-se a fornecer informações verdadeiras, completas e atualizadas, sendo exclusivamente responsável por quaisquer prejuízos decorrentes de dados incorretos ou desatualizados.

3.3. Criação de Senha e Acesso

O acesso ao Sistema será realizado por meio de credenciais pessoais e intransferíveis. O cadastro de senha poderá ocorrer mediante link enviado ao e-mail informado, de uso único e com prazo de validade.

3.4. Responsabilidade pela Conta

O Usuário é o único responsável:

pela confidencialidade de suas credenciais;

por todas as atividades realizadas em sua conta;

por comunicar imediatamente a VIRGULA CONTABIL em caso de suspeita de uso indevido ou acesso não autorizado.

4. DADOS DO USUÁRIO, PROPRIEDADE E TRATAMENTO
4.1. Propriedade dos Dados

Todos os dados, documentos e informações inseridos ou importados no Sistema (“Dados do Usuário”) permanecem de exclusiva propriedade do Usuário.

4.2. Acesso aos Dados

O Usuário autoriza a VIRGULA CONTABIL a acessar, armazenar, processar e tratar os Dados do Usuário estritamente na medida necessária para:

execução dos serviços contratados;

manutenção e funcionamento do Sistema;

melhoria contínua das funcionalidades;

cumprimento de obrigações legais e regulatórias.

4.3. Base Legal

O tratamento dos Dados do Usuário ocorre com fundamento, principalmente, na execução de contrato e no legítimo interesse, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).

4.4. Confidencialidade

A VIRGULA CONTABIL compromete-se a manter os Dados do Usuário sob sigilo, não os divulgando a terceiros, salvo:

mediante autorização do Usuário;

por obrigação legal ou ordem judicial;

para parceiros estritamente necessários à operação do Sistema, observados contratos de confidencialidade.

5. SEGURANÇA DA INFORMAÇÃO

A VIRGULA CONTABIL adota medidas técnicas e administrativas razoáveis e compatíveis com os padrões de mercado, visando proteger os Dados do Usuário contra acessos não autorizados, destruição, perda, alteração ou divulgação indevida.

Tais medidas incluem, sempre que aplicável:

criptografia de dados em trânsito e em repouso;

controle de acesso lógico;

autenticação segura;

monitoramento e registro de acessos;

políticas internas de segurança da informação.

O Usuário reconhece que nenhum sistema é absolutamente seguro, não sendo possível garantir a eliminação total de riscos.

6. INCIDENTES DE SEGURANÇA

Na hipótese de ocorrência de incidente de segurança que possa acarretar risco ou dano relevante ao Usuário, a VIRGULA CONTABIL:

adotará medidas para contenção e mitigação do incidente;

comunicará o Usuário e, quando aplicável, a Autoridade Nacional de Proteção de Dados (ANPD), nos termos da legislação vigente.

7. RESPONSABILIDADES DO USUÁRIO

O Usuário declara e concorda que:

é responsável pela veracidade, legalidade e integridade dos Dados do Usuário;

o Sistema é ferramenta de apoio, não substituindo controles próprios;

é vedada a utilização do Sistema para fins ilícitos, fraudulentos ou contrários à legislação vigente.

8. EXCLUSÃO DE GARANTIAS E LIMITAÇÃO DE RESPONSABILIDADE
8.1. Funcionamento do Sistema

O Sistema é disponibilizado “no estado em que se encontra”, podendo sofrer interrupções, manutenções ou indisponibilidades temporárias.

8.2. Limitação de Responsabilidade

Na máxima extensão permitida pela lei, a VIRGULA CONTABIL não será responsável por:

danos decorrentes de uso indevido do Sistema;

falhas originadas de informações incorretas fornecidas pelo Usuário;

lucros cessantes, perdas financeiras indiretas ou danos morais decorrentes do uso do Sistema.

Nada nestes Termos exclui ou limita responsabilidades que não possam ser legalmente afastadas.

9. PROPRIEDADE INTELECTUAL

Todo o conteúdo, código-fonte, layout, marcas, funcionalidades e estrutura do Sistema são de propriedade exclusiva da VIRGULA CONTABIL, sendo vedada sua reprodução, modificação ou exploração sem autorização expressa.

10. RESCISÃO
10.1. Pelo Usuário

O Usuário poderá solicitar o cancelamento de sua conta a qualquer momento.

10.2. Pela VIRGULA CONTABIL

A VIRGULA CONTABIL poderá suspender ou encerrar o acesso ao Sistema em caso de violação destes Termos ou da legislação aplicável.

Após o encerramento, os Dados do Usuário poderão ser excluídos ou anonimizados, salvo quando houver obrigação legal de retenção.

11. DISPOSIÇÕES GERAIS
11.1. Alterações

A VIRGULA CONTABIL poderá alterar estes Termos a qualquer momento, mediante publicação da versão atualizada no Sistema.

11.2. Lei Aplicável e Foro

Estes Termos são regidos pelas leis da República Federativa do Brasil, ficando eleito o foro da Comarca de São Gonçalo dos Campos – BA, com renúncia a qualquer outro, por mais privilegiado que seja.

12. CONTATO

Para dúvidas, solicitações ou exercício de direitos relacionados a dados pessoais, o Usuário poderá entrar em contato pelo e-mail: [contato@virgulacontabil.com.br].`;

const maskCnpjCpf = (value: string) => {
  const v = value.replace(/\D/g, '');
  if (v.length <= 11) {
    return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else {
    return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
};

const maskPhone = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 10) {
        return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    } else {
        return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
};

const SignUp: React.FC<SignUpProps> = ({ onBack, isLoading }) => {
  const [formData, setFormData] = useState({
    cnpj: '',
    razaoSocial: '',
    email: '',
    phone: '',
  });

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cnpj || !formData.razaoSocial || !formData.email || !formData.phone) {
        alert("Preencha todos os campos.");
        return;
    }
    // Open modal to confirm terms and submit
    setShowTermsModal(true);
  };

  const handleFinalSubmit = async () => {
    setLocalLoading(true);
    try {
        const res = await fetch('/api/request-signup', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(formData)
        });
        
        if (res.ok) {
            setIsSuccess(true);
            setShowTermsModal(false);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (e.target.name === 'cnpj') value = maskCnpjCpf(value);
    if (e.target.name === 'phone') value = maskPhone(value);
    
    setFormData({ ...formData, [e.target.name]: value });
  };

  if (isSuccess) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-800">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Quase lá!</h2>
            <p className="text-slate-400 mb-8">
                Enviamos um e-mail para <strong>{formData.email}</strong>. <br/>
                Clique no link recebido para criar sua senha e ativar sua conta.
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
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-800">
        
        {/* Left Side - Hero */}
        <div className="bg-slate-950 p-8 text-white md:w-2/5 flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mb-6 border border-primary/30">
              <UserPlus className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Primeiro Acesso</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Cadastre sua empresa para ter controle total sobre suas finanças.
            </p>
          </div>
          
          <div className="mt-8 relative z-10">
            <button 
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} /> Voltar para Login
            </button>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="p-8 md:w-3/5">
          <h3 className="text-xl font-bold text-white mb-6">Dados da Empresa</h3>
          <form onSubmit={handlePreSubmit} className="space-y-4">
            
            <div className="space-y-4">
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  name="cnpj"
                  type="text"
                  required
                  maxLength={18}
                  value={formData.cnpj}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-white placeholder-slate-600"
                  placeholder="CNPJ ou CPF"
                />
              </div>

              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  name="razaoSocial"
                  type="text"
                  required
                  value={formData.razaoSocial}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-white placeholder-slate-600"
                  placeholder="Razão Social / Nome Completo"
                />
              </div>

              <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-white placeholder-slate-600"
                    placeholder="Email Corporativo"
                  />
              </div>
              <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    name="phone"
                    type="tel"
                    required
                    maxLength={15}
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-white placeholder-slate-600"
                    placeholder="Telefone / WhatsApp"
                  />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={localLoading || isLoading}
                className="w-full bg-primary text-slate-950 py-3 rounded-lg font-bold hover:bg-primaryHover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/50"
              >
                Avançar <ArrowRight size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Terms Modal */}
      {showTermsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowTermsModal(false)} />
              <div className="relative bg-surface w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl border border-slate-700 flex flex-col animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-700 flex items-center justify-between bg-slate-950 rounded-t-xl">
                      <div className="flex items-center gap-3">
                          <ShieldCheck className="text-primary" size={24}/>
                          <h3 className="text-xl font-bold text-white">Termos e Condições de Uso</h3>
                      </div>
                      <button onClick={() => setShowTermsModal(false)} className="text-slate-400 hover:text-white transition-colors">
                          <X size={24}/>
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 text-slate-300 text-sm leading-relaxed custom-scroll whitespace-pre-wrap">
                      {TERMS_CONTENT}
                  </div>

                  <div className="p-6 border-t border-slate-700 bg-slate-950 rounded-b-xl flex justify-end gap-4">
                      <button 
                        onClick={() => setShowTermsModal(false)}
                        className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                        onClick={handleFinalSubmit}
                        disabled={localLoading}
                        className="px-6 py-2 bg-primary text-slate-900 font-bold rounded-lg hover:bg-primaryHover transition-colors flex items-center gap-2"
                      >
                          {localLoading ? 'Enviando...' : 'Li e Concordo'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default SignUp;