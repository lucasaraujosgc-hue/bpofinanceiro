import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { encrypt, decrypt } from '../config.js';
import { validateBody } from '../middleware/validate.js';
import { integrationSettingsSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/integration/settings', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT token, start_date, target_type, category_in_id, category_out_id,
                    bank_in_id, bank_out_id, total_imported, last_sync
             FROM integration_settings WHERE user_id = $1`, [req.userId]);
        if (rows.length === 0) return res.json({ target_type: 'transaction', total_imported: 0 });
        const s = rows[0];
        res.json({ ...s, token: decrypt(s.token) }); // token cifrado em repouso
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/integration/settings', authenticateToken, validateBody(integrationSettingsSchema), async (req, res) => {
    const { token, start_date, target_type, category_in_id, category_out_id, bank_in_id, bank_out_id } = req.body;
    try {
        await pool.query(
            `INSERT INTO integration_settings (user_id, token, start_date, target_type, category_in_id, category_out_id, bank_in_id, bank_out_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (user_id) DO UPDATE SET
            token = EXCLUDED.token, start_date = EXCLUDED.start_date, target_type = EXCLUDED.target_type,
            category_in_id = EXCLUDED.category_in_id, category_out_id = EXCLUDED.category_out_id,
            bank_in_id = EXCLUDED.bank_in_id, bank_out_id = EXCLUDED.bank_out_id`,
            [req.userId, encrypt(token), start_date, target_type, category_in_id, category_out_id, bank_in_id, bank_out_id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/integration/sync', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM integration_settings WHERE user_id = $1', [req.userId]);
        if (rows.length === 0 || !rows[0].token) return res.status(400).json({ error: 'Token não configurado.' });

        const settings = { ...rows[0], token: decrypt(rows[0].token) };
        let url = `https://nfe.virgulacontabil.com.br/api/v1/export/notas/${encodeURIComponent(settings.token)}`;
        if (settings.start_date) {
            url += `?data_inicio=${settings.start_date}`;
        }

        const fetchObj = await fetch(url);
        if (!fetchObj.ok) {
            return res.status(400).json({ error: 'Erro ao buscar notas. Token pode estar inválido.' });
        }
        const json = await fetchObj.json();
        if (!json.success || !json.notas) {
            return res.status(400).json({ error: 'Formato de resposta inválido da API ou sem notas.' });
        }

        let importedCount = 0;
        const totalNotas = json.notas.length;
        
        for (const nota of json.notas) {
            const rawDate = nota.data_emissao || '';
            const dataV = rawDate.split(' ')[0]; // Convert YYYY-MM-DD HH:MM:SS to YYYY-MM-DD
            
            const isNfeEntrada = String(nota.tipo).toLowerCase() === 'entrada'; // NFe Entrada = Compra = Debito
            const desc = isNfeEntrada ? `Compra ${nota.fornecedor}` : `Venda ${nota.fornecedor}`;
            const val = parseFloat(nota.valor_total);
            
            const catId = isNfeEntrada ? settings.category_in_id : settings.category_out_id;
            const bankId = isNfeEntrada ? settings.bank_out_id : settings.bank_in_id;
            const opType = isNfeEntrada ? 'debito' : 'credito';

            if (settings.target_type === 'forecast') {
                await pool.query(
                    'INSERT INTO forecasts (user_id, date, description, value, type, category_id, bank_id, realized) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)',
                    [req.userId, dataV, desc, val, opType, catId || null, bankId || null]
                );
            } else {
                await pool.query(
                    'INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, reconciled) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
                    [req.userId, dataV, desc, val, opType, catId || null, bankId || null]
                );
            }
            importedCount++;
        }

        await pool.query('UPDATE integration_settings SET total_imported = COALESCE(total_imported, 0) + $1, last_sync = $2 WHERE user_id = $3', [importedCount, new Date().toISOString(), req.userId]);

        res.json({ success: true, count: importedCount, total: totalNotas });
    } catch(err) {
        console.error("Sync error:", err);
        res.status(500).json({ error: 'Erro ao processar sincronização: ' + err.message });
    }
});
}
