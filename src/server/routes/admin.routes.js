import { pool } from '../db.js';
import { authenticateToken, checkAdmin, invalidateBlockedCache } from '../middleware/auth.js';
import { decrypt } from '../config.js';
import { logAudit, getAuditActor } from '../services/audit.js';
import { saveBankLogo } from '../services/logo.js';
import { revokeAllSessionsForUser } from '../services/session.js';
import { validateBody } from '../middleware/validate.js';
import { adminBlockSchema, adminBankCreateSchema, adminBankUpdateSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/admin/users', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT id, email, cnpj, razao_social, phone, created_at, blocked FROM users ORDER BY created_at DESC");
        const processed = rows.map(r => {
            try {
                return {
                    ...r,
                    cnpj: decrypt(r.cnpj) || r.cnpj,
                    razao_social: decrypt(r.razao_social) || r.razao_social,
                    phone: decrypt(r.phone) || r.phone,
                    blocked: !!r.blocked,
                };
            } catch { return r; }
        });
        res.json(processed);
    } catch (err) {
        console.error("DB Error /api/admin/users:", err.message);
        res.status(500).json({ error: "Erro ao buscar usuários." });
    }
});
app.put('/api/admin/users/:id/block', authenticateToken, checkAdmin, validateBody(adminBlockSchema), async (req, res) => {
    const { blocked } = req.body;
    try {
        await pool.query("UPDATE users SET blocked = $1 WHERE id = $2", [blocked ? 1 : 0, req.params.id]);
        invalidateBlockedCache(req.params.id);
        if (blocked) revokeAllSessionsForUser(req.params.id).catch(e => console.error('revoke on block:', e.message));
        logAudit(getAuditActor(req), blocked ? 'ADMIN_USER_BLOCK' : 'ADMIN_USER_UNBLOCK', `user ${req.params.id}`, req.ip);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /admin/users/:id/block error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// Trilha de auditoria (só admin). Ações sensíveis do contador + logins.
app.get('/api/admin/audit', authenticateToken, checkAdmin, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
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
app.get('/api/admin/global-data', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const u = await pool.query('SELECT COUNT(*)::int AS count FROM users');
        const t = await pool.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(value), 0)::float AS "totalValue" FROM transactions');
        res.json({ users: u.rows[0], transactions: t.rows[0] });
    } catch (err) {
        console.error('GET /admin/global-data error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/admin/audit-signups', authenticateToken, checkAdmin, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    try {
        const { rows } = await pool.query(
            `SELECT id, email, razao_social, created_at FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]);
        const totalRes = await pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE role != 'admin'`);
        const processed = rows.map(r => ({ ...r, razao_social: decrypt(r.razao_social) || r.razao_social }));
        res.json({ data: processed, total: totalRes.rows[0].total });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/admin/banks', authenticateToken, checkAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM global_banks ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        console.error('GET /admin/banks error:', err.message);
        res.json([]);
    }
});
app.post('/api/admin/banks', authenticateToken, checkAdmin, validateBody(adminBankCreateSchema), async (req, res) => {
    const { name, logoData } = req.body;
    let logoPath = '/logo/caixaf.png';
    if (logoData && logoData.startsWith('data:image')) {
        const saved = saveBankLogo(logoData);
        if (!saved) return res.status(400).json({ error: 'Logo inválido (use PNG, JPG ou WebP até 512 KB).' });
        logoPath = saved;
    } else if (typeof logoData === 'string' && /^\/logo\/[\w.-]+$/.test(logoData)) {
        logoPath = logoData;
    }
    try {
        const ins = await pool.query('INSERT INTO global_banks (name, logo) VALUES ($1, $2) RETURNING id', [name, logoPath]);
        logAudit(getAuditActor(req), 'ADMIN_BANK_CREATE', name, req.ip);
        res.json({ id: ins.rows[0].id, name, logo: logoPath });
    } catch (err) {
        console.error('POST /admin/banks error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/admin/banks/:id', authenticateToken, checkAdmin, validateBody(adminBankUpdateSchema), async (req, res) => {
    const { name, logoData } = req.body;
    try {
        const { rows: [row] } = await pool.query('SELECT * FROM global_banks WHERE id = $1', [req.params.id]);
        if (!row) return res.status(404).json({ error: "Not found" });

        let logoPath = row.logo;
        if (logoData && logoData.startsWith('data:image')) {
            const saved = saveBankLogo(logoData);
            if (!saved) return res.status(400).json({ error: 'Logo inválido (use PNG, JPG ou WebP até 512 KB).' });
            logoPath = saved;
        }
        await pool.query('UPDATE global_banks SET name = $1, logo = $2 WHERE id = $3', [name, logoPath, req.params.id]);
        await pool.query('UPDATE banks SET name = $1, logo = $2 WHERE name = $3', [name, logoPath, row.name]);
        logAudit(getAuditActor(req), 'ADMIN_BANK_UPDATE', `${req.params.id} ${name}`, req.ip);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /admin/banks error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/admin/banks/:id', authenticateToken, checkAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM global_banks WHERE id = $1', [req.params.id]);
        logAudit(getAuditActor(req), 'ADMIN_BANK_DELETE', String(req.params.id), req.ip);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /admin/banks error:', err.message);
        res.json({ success: false });
    }
});
app.get('/api/admin/users/:id/full-data', authenticateToken, checkAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const [tx, fc, ofx] = await Promise.all([
            pool.query(`SELECT t.*, c.name as category_name, b.name as bank_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN banks b ON t.bank_id = b.id WHERE t.user_id = $1 ORDER BY t.date DESC`, [userId]),
            pool.query(`SELECT f.*, c.name as category_name FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id WHERE f.user_id = $1`, [userId]),
            pool.query(`SELECT * FROM ofx_imports WHERE user_id = $1`, [userId]),
        ]);
        res.json({ transactions: tx.rows, forecasts: fc.rows, ofxImports: ofx.rows });
    } catch (err) {
        console.error('GET /admin/users/:id/full-data error:', err.message);
        res.status(500).json({ error: err.message });
    }
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
        await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [String(id)]);
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
