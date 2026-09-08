import { db, pool } from '../db.js';
import { authenticateToken, checkAdmin, invalidateBlockedCache } from '../middleware/auth.js';
import { decrypt } from '../config.js';
import { logAudit, getAuditActor } from '../services/audit.js';
import { saveBankLogo } from '../services/logo.js';

export default function register(app) {
app.get('/api/admin/users', authenticateToken, checkAdmin, (req, res) => {
    db.all("SELECT id, email, cnpj, razao_social, phone, created_at, blocked FROM users ORDER BY created_at DESC", [], (err, rows) => {
        if (err) {
            console.error("DB Error /api/admin/users:", err);
            return res.status(500).json({ error: "Erro ao buscar usuários." });
        }
        try {
            const safeRows = rows || [];
            
            const processed = safeRows.map(r => {
                try {
                    return { 
                        ...r, 
                        cnpj: decrypt(r.cnpj) || r.cnpj, 
                        razao_social: decrypt(r.razao_social) || r.razao_social, 
                        phone: decrypt(r.phone) || r.phone,
                        blocked: !!r.blocked
                    };
                } catch (e) {
                    return r; 
                }
            });
            
            res.json(processed);
        } catch (processError) {
            console.error("Processing Error /api/admin/users:", processError);
            res.status(500).json({ error: "Erro ao processar dados de usuários." });
        }
    });
});
app.put('/api/admin/users/:id/block', authenticateToken, checkAdmin, (req, res) => {
    const { blocked } = req.body;
    db.run("UPDATE users SET blocked = ? WHERE id = ?", [blocked ? 1 : 0, req.params.id], function(err) {
        if(err) return res.status(500).json({error: err.message});
        invalidateBlockedCache(req.params.id);
        logAudit(getAuditActor(req), blocked ? 'ADMIN_USER_BLOCK' : 'ADMIN_USER_UNBLOCK', `user ${req.params.id}`, req.ip);
        res.json({success: true});
    });
});
// Trilha de auditoria (só admin). Ações sensíveis do contador + logins.
app.get('/api/admin/audit', authenticateToken, checkAdmin, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, action, details, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT $1 OFFSET $2`,
            [limit, offset]);
        const total = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_logs`);
        res.json({ data: rows, total: total.rows[0].n });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/admin/global-data', authenticateToken, checkAdmin, (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users', (err, u) => {
        db.get('SELECT COUNT(*) as count, SUM(value) as totalValue FROM transactions', (err, t) => {
            res.json({ users: u, transactions: t });
        });
    });
});
app.get('/api/admin/audit-signups', authenticateToken, checkAdmin, async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    try {
        const { rows } = await pool.query(`SELECT id, email, razao_social, created_at FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
        const totalRes = await pool.query(`SELECT COUNT(*) as total FROM users WHERE role != 'admin'`);
        
        const processed = rows.map(r => ({ ...r, razao_social: decrypt(r.razao_social) || r.razao_social }));
        res.json({ data: processed, total: Number(totalRes.rows[0].total) });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/admin/banks', authenticateToken, checkAdmin, (req, res) => {
    db.all('SELECT * FROM global_banks ORDER BY id DESC', [], (err, rows) => res.json(rows || []));
});
app.post('/api/admin/banks', authenticateToken, checkAdmin, (req, res) => {
    const { name, logoData } = req.body;
    let logoPath = '/logo/caixaf.png';
    if (logoData && logoData.startsWith('data:image')) {
        const saved = saveBankLogo(logoData);
        if (!saved) return res.status(400).json({ error: 'Logo inválido (use PNG, JPG ou WebP até 512 KB).' });
        logoPath = saved;
    } else if (typeof logoData === 'string' && /^\/logo\/[\w.-]+$/.test(logoData)) {
        logoPath = logoData;
    }
    db.run('INSERT INTO global_banks (name, logo) VALUES (?, ?)', [name, logoPath], function(err) {
        logAudit(getAuditActor(req), 'ADMIN_BANK_CREATE', name, req.ip);
        res.json({ id: this.lastID, name, logo: logoPath });
    });
});
app.put('/api/admin/banks/:id', authenticateToken, checkAdmin, (req, res) => {
    const { name, logoData } = req.body;
    db.get('SELECT * FROM global_banks WHERE id = ?', [req.params.id], (err, row) => {
        if(!row) return res.status(404).json({error: "Not found"});
        let logoPath = row.logo;
        if (logoData && logoData.startsWith('data:image')) {
            const saved = saveBankLogo(logoData);
            if (!saved) return res.status(400).json({ error: 'Logo inválido (use PNG, JPG ou WebP até 512 KB).' });
            logoPath = saved;
        }
        db.run('UPDATE global_banks SET name = ?, logo = ? WHERE id = ?', [name, logoPath, req.params.id], function(err) {
            db.run('UPDATE banks SET name = ?, logo = ? WHERE name = ?', [name, logoPath, row.name]);
            logAudit(getAuditActor(req), 'ADMIN_BANK_UPDATE', `${req.params.id} ${name}`, req.ip);
            res.json({ success: true });
        });
    });
});
app.delete('/api/admin/banks/:id', authenticateToken, checkAdmin, (req, res) => {
    db.run('DELETE FROM global_banks WHERE id = ?', [req.params.id], (err) => {
        logAudit(getAuditActor(req), 'ADMIN_BANK_DELETE', String(req.params.id), req.ip);
        res.json({ success: !err });
    });
});
app.get('/api/admin/users/:id/full-data', authenticateToken, checkAdmin, (req, res) => {
    const userId = req.params.id;
    const p1 = new Promise((resolve) => db.all(`SELECT t.*, c.name as category_name, b.name as bank_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN banks b ON t.bank_id = b.id WHERE t.user_id = ? ORDER BY t.date DESC`, [userId], (err, r) => resolve(r)));
    const p2 = new Promise((resolve) => db.all(`SELECT f.*, c.name as category_name FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id WHERE f.user_id = ?`, [userId], (err, r) => resolve(r)));
    const p3 = new Promise((resolve) => db.all(`SELECT * FROM ofx_imports WHERE user_id = ?`, [userId], (err, r) => resolve(r)));
    Promise.all([p1, p2, p3]).then(([transactions, forecasts, ofxImports]) => res.json({ transactions, forecasts, ofxImports }));
});
app.delete('/api/admin/users/:id', authenticateToken, checkAdmin, async (req, res) => {
    const id = req.params.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tables = ['transactions', 'forecasts', 'credit_cards', 'banks', 'categories', 'ofx_imports', 'keyword_rules'];
        for (const t of tables) {
            await client.query(`DELETE FROM ${t} WHERE user_id = $1`, [id]);
        }
        await client.query("DELETE FROM users WHERE id = $1", [id]);
        await client.query('COMMIT');
        invalidateBlockedCache(id);
        logAudit(getAuditActor(req), 'ADMIN_USER_DELETE', `user ${id} + todos os dados`, req.ip);
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Admin user delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});
}
