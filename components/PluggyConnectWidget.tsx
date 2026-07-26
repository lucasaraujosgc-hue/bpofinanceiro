import React, { useState, useEffect } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { Building2 } from 'lucide-react';

interface PluggyConnectWidgetProps {
    token: string;
    onSuccess?: () => void;
}

const PluggyConnectWidget: React.FC<PluggyConnectWidgetProps> = ({ token, onSuccess }) => {
    const [connectToken, setConnectToken] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleConnectClick = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/pluggy/connect-token', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setConnectToken(data.accessToken);
                setIsOpen(true);
            } else {
                alert("Erro ao conectar à API bancária. Verifique as configurações.");
            }
        } catch (e) {
            console.error(e);
            alert("Erro de comunicação ao buscar token de conexão.");
        } finally {
            setLoading(false);
        }
    };

    const handleSuccess = async (itemData: any) => {
        console.log('Pluggy connect success:', itemData);
        setIsOpen(false);
        try {
            const res = await fetch('/api/pluggy/item', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ itemId: itemData.item.id })
            });
            if (res.ok) {
                alert("Conta bancária conectada com sucesso!");
                if (onSuccess) onSuccess();
            } else {
                alert("Erro ao salvar integração bancária.");
            }
        } catch (e) {
            console.error(e);
            alert("Erro de comunicação ao salvar a conta.");
        }
    };

    return (
        <div className="bg-[#04382c] border border-[#022c22] p-4 rounded-xl flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#E78A45]/20 text-[#E78A45] flex items-center justify-center border border-[#E78A45]/30">
                    <Building2 size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-white">Integração Bancária Automática</h3>
                    <p className="text-sm text-green-100/70">Conecte seu banco (Open Finance) para conciliação automática</p>
                </div>
            </div>
            
            <button
                onClick={handleConnectClick}
                disabled={loading}
                className="bg-[#E78A45] hover:bg-[#d47b3b] text-white px-5 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
            >
                {loading ? 'Carregando...' : 'Conectar Conta Bancária'}
            </button>

            {isOpen && connectToken && (
                <PluggyConnect
                    connectToken={connectToken}
                    includeSandbox={true}
                    onSuccess={handleSuccess}
                    onError={(error) => {
                        console.error('Falha na conexão', error);
                        alert("Houve um erro ou o processo foi cancelado.");
                        setIsOpen(false);
                    }}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};

export default PluggyConnectWidget;
