import React, { useState } from 'react';
import { Landmark, ArrowUpRight, Receipt, FileSpreadsheet, FileCog, Tags, BookOpen } from 'lucide-react';

const Tutorial: React.FC = () => {
  const [activeTopic, setActiveTopic] = useState('Bancos');

  const topics = [
    { id: 'Bancos', icon: <Landmark size={18}/>, title: 'Bancos' },
    { id: 'Previsões', icon: <ArrowUpRight size={18}/>, title: 'Previsões' },
    { id: 'Lançamentos', icon: <Receipt size={18}/>, title: 'Lançamentos' },
    { id: 'Importar Extrato', icon: <FileSpreadsheet size={18}/>, title: 'Importar Extrato' },
    { id: 'Regra de importação', icon: <FileCog size={18}/>, title: 'Regras de Importação' },
    { id: 'Categorias', icon: <Tags size={18}/>, title: 'Categorias' },
  ];

  const renderContent = () => {
      switch (activeTopic) {
          case 'Bancos':
              return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-bold text-white">Gerenciando Bancos</h3>
                      <p className="text-slate-400">
                          O módulo de Bancos é onde você cadastra todas as contas que deseja controlar.
                          Você pode adicionar contas correntes, cartões de crédito ou até mesmo "Caixa Físico".
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                          <li>Use o botão <strong>"Nova Conta"</strong> para adicionar uma instituição.</li>
                          <li>Selecione um dos ícones predefinidos para facilitar a identificação visual.</li>
                          <li>Você pode inativar uma conta a qualquer momento clicando em editar e "Arquivar Conta". O histórico será mantido, mas ela não aparecerá nas opções de lançamento.</li>
                          <li>O saldo exibido no card do banco é calculado automaticamente com base nos lançamentos conciliados.</li>
                      </ul>
                  </div>
              );
          case 'Previsões':
              return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-bold text-white">Contas a Pagar e Receber (Previsões)</h3>
                      <p className="text-slate-400">
                          As previsões servem para você planejar o futuro. Elas não afetam seu saldo atual até que sejam "Efetivadas".
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                          <li>Cadastre contas fixas (ex: Aluguel) marcando a opção <strong>"Fixo Mensal"</strong>. O sistema gerará 60 parcelas automaticamente.</li>
                          <li>Para compras parceladas, informe o número de parcelas e o sistema criará os lançamentos futuros.</li>
                          <li>Quando o pagamento realmente ocorrer, clique no botão de <strong>"Check" (Efetivar)</strong> na lista. Isso transformará a previsão em um Lançamento real.</li>
                          <li>Use o filtro de data no topo para ver o que está previsto para os próximos meses.</li>
                      </ul>
                  </div>
              );
          case 'Lançamentos':
              return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-bold text-white">Lançamentos Financeiros</h3>
                      <p className="text-slate-400">
                          Aqui fica o histórico real do que aconteceu. Tudo que afeta seu saldo está aqui.
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                          <li>Você pode criar um lançamento manual clicando em "Novo Lançamento".</li>
                          <li>Use a <strong>"Edição em Lote"</strong> para categorizar ou conciliar vários itens de uma vez. Basta selecionar os itens e escolher a ação no topo.</li>
                          <li>O status "Conciliado" indica que você conferiu que aquele valor realmente saiu/entrou na conta bancária.</li>
                          <li>Lançamentos vindos da importação de OFX ou efetivados das previsões aparecem aqui automaticamente.</li>
                      </ul>
                  </div>
              );
          case 'Importar Extrato':
              return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-bold text-white">Importação de Arquivo OFX</h3>
                      <p className="text-slate-400">
                          A forma mais rápida de alimentar o sistema. Baixe o arquivo .OFX no site do seu banco e envie aqui.
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                          <li>Selecione a conta bancária de destino e o arquivo.</li>
                          <li>O sistema verifica automaticamente se já existem lançamentos idênticos (mesma data e valor).</li>
                          <li>Se houver conflito (duplicidade), você verá uma tela perguntando se deseja <strong>Substituir</strong> (atualizar o existente) ou <strong>Manter o Existente</strong> (ignorar o do arquivo).</li>
                          <li>Se você tiver Regras de Importação cadastradas, o sistema categorizará automaticamente os lançamentos.</li>
                      </ul>
                  </div>
              );
          case 'Regra de importação':
              return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-bold text-white">Automação com Regras</h3>
                      <p className="text-slate-400">
                          Ensine o sistema a categorizar seus gastos automaticamente durante a importação do OFX.
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                          <li>Exemplo: Crie uma regra onde a palavra-chave é "UBER" e a categoria é "Transporte".</li>
                          <li>Toda vez que você importar um extrato que tenha "UBER" na descrição, ele será classificado automaticamente como "Transporte".</li>
                          <li>Isso economiza horas de trabalho manual de classificação.</li>
                      </ul>
                  </div>
              );
          case 'Categorias':
              return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-bold text-white">Plano de Contas (Categorias)</h3>
                      <p className="text-slate-400">
                          Organize suas finanças criando categorias personalizadas para Receitas e Despesas.
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                          <li>O sistema já vem com várias categorias padrão, mas você pode criar as suas.</li>
                          <li>Categorias bem definidas são essenciais para que os Relatórios (DRE e Gráficos) façam sentido.</li>
                          <li>Você pode excluir categorias que não usa, desde que não tenham lançamentos vinculados.</li>
                      </ul>
                  </div>
              );
          default:
              return null;
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
              <BookOpen className="text-indigo-400" size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Tutorial do Sistema</h1>
            <p className="text-slate-400">Aprenda a utilizar cada módulo da plataforma</p>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Navigation */}
          <div className="lg:col-span-1 space-y-2">
              {topics.map(topic => (
                  <button
                      key={topic.id}
                      onClick={() => setActiveTopic(topic.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                          ${activeTopic === topic.id 
                              ? 'bg-surface border border-primary/30 text-primary shadow-lg shadow-emerald-900/10' 
                              : 'bg-surface/50 border border-slate-800 text-slate-400 hover:text-white hover:bg-surface'}
                      `}
                  >
                      {topic.icon}
                      {topic.title}
                  </button>
              ))}
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3 bg-surface border border-slate-800 rounded-xl p-8 min-h-[400px] shadow-xl">
              {renderContent()}
          </div>
      </div>
    </div>
  );
};

export default Tutorial;