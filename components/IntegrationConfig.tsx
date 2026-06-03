import React, { useState, useEffect } from 'react';
import { Settings, RefreshCw, CheckCircle, Database } from 'lucide-react';
import { Category } from '../types';

interface IntegrationConfigProps {
    categories: Category[];
}

const IntegrationConfig: React.FC<IntegrationConfigProps> = ({ categories }) => {
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<any>(null);

    const [form, setForm] = useState({
        token: '',
        start_date: '',
        target_type: 'transaction',
        category_in_id: '',
        category_out_id: ''
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('finance_app_token') || sessionStorage.getItem('finance_app_token');
            const res = await fetch('/api/integration/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSettings(data);
                setForm({
                    token: data.token || '',
                    start_date: data.start_date || '',
                    target_type: data.target_type || 'transaction',
                    category_in_id: data.category_in_id?.toString() || '',
                    category_out_id: data.category_out_id?.toString() || ''
                });
            }
        } catch (e) {
            console.error('Error fetching settings', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const token = localStorage.getItem('finance_app_token') || sessionStorage.getItem('finance_app_token');
            const res = await fetch('/api/integration/settings', {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: form.token,
                    start_date: form.start_date,
                    target_type: form.target_type,
                    category_in_id: form.category_in_id ? parseInt(form.category_in_id) : null,
                    category_out_id: form.category_out_id ? parseInt(form.category_out_id) : null,
                })
            });
            if (res.ok) {
                fetchSettings();
                alert("Configurações salvas com sucesso!");
            } else {
                alert("Erro ao salvar");
            }
        } catch (e) {
            alert('Erro de conexão');
        } finally {
            setSaving(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const token = localStorage.getItem('finance_app_token') || sessionStorage.getItem('finance_app_token');
            const res = await fetch('/api/integration/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setSyncResult({ success: true, count: data.count });
                fetchSettings(); // update the counter
            } else {
                setSyncResult({ success: false, error: data.error });
            }
        } catch (e) {
            setSyncResult({ success: false, error: 'Erro de comunicação ao sincronizar' });
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-400">Carregando configurações...</div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center bg-surface p-6 rounded-xl border border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                        <Database className="text-primary w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Integração NFe</h2>
                        <p className="text-slate-400 text-sm">Importe notas fiscais automaticamente da Virgula Contábil</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface p-6 rounded-xl border border-slate-800">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Token de Exportação (Fornecido pela Contabilidade)</label>
                            <input 
                                type="text"
                                value={form.token}
                                onChange={(e) => setForm({...form, token: e.target.value})}
                                placeholder="Insira o seu token aqui..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary"
                                required
                            />
                        </div>

                        {form.token && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Data de Início da Importação (Opcional)</label>
                                    <input 
                                        type="date"
                                        value={form.start_date}
                                        onChange={(e) => setForm({...form, start_date: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Busca notas emitidas a partir desta data.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Destino dos Dados</label>
                                    <select 
                                        value={form.target_type}
                                        onChange={(e) => setForm({...form, target_type: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary"
                                    >
                                        <option value="transaction">Lançamentos Realizados (Transactions)</option>
                                        <option value="forecast">Previsões Financeiras (Forecasts)</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Categoria Padrão (NFe Entrada / Compras)</label>
                                        <select 
                                            value={form.category_in_id}
                                            onChange={(e) => setForm({...form, category_in_id: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none border-primary"
                                        >
                                            <option value="">Selecione...</option>
                                            {categories.filter(c => c.type === 'despesa' || c.type === 'debito').map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Categoria Padrão (NFe Saída / Vendas)</label>
                                        <select 
                                            value={form.category_out_id}
                                            onChange={(e) => setForm({...form, category_out_id: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary"
                                        >
                                            <option value="">Selecione...</option>
                                            {categories.filter(c => c.type === 'receita' || c.type === 'credito').map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={saving}
                            className="w-full bg-primary text-slate-900 font-bold py-2 px-4 rounded-lg hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                        >
                            {saving ? <RefreshCw className="animate-spin" size={18} /> : <Settings size={18} />}
                            {saving ? 'Salvando...' : 'Salvar Configurações'}
                        </button>
                    </form>
                </div>

                <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <Database size={150} />
                    </div>
                    <div className="relative z-10 flex flex-col h-full">
                        <h3 className="text-xl font-bold text-white mb-2">Painel de Sincronização</h3>
                        <p className="text-slate-400 text-sm mb-6">Inicie a importação manual das notas fiscais configuradas.</p>
                        
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 mb-6 flex-1">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-slate-400 text-sm">Status Atual:</span>
                                {settings?.token ? (
                                    <span className="text-emerald-400 text-sm font-medium flex items-center gap-1"><CheckCircle size={14} /> Configurado</span>
                                ) : (
                                    <span className="text-amber-400 text-sm font-medium">Aguardando Token</span>
                                )}
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-slate-400 text-sm">Total Importado:</span>
                                <span className="text-white font-mono">{settings?.total_imported || 0} notas</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-sm">Última Sincronização:</span>
                                <span className="text-slate-300 text-sm">
                                    {settings?.last_sync ? new Date(settings.last_sync).toLocaleString('pt-BR') : 'Nunca'}
                                </span>
                            </div>
                        </div>

                        {syncResult && (
                            <div className={`p-4 rounded-lg mb-6 border ${syncResult.success ? 'bg-emerald-900/20 border-emerald-900/50 text-emerald-400' : 'bg-rose-900/20 border-rose-900/50 text-rose-400'}`}>
                                {syncResult.success ? (
                                    <span>Importação concluída. <b>{syncResult.count}</b> notas importadas!</span>
                                ) : (
                                    <span>{syncResult.error}</span>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleSync}
                            disabled={!settings?.token || syncing}
                            className={`w-full py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${!settings?.token ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                        >
                            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                            {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IntegrationConfig;