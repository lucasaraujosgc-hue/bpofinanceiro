import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ofxImportCreateSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/ofx-imports', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, file_name, import_date, bank_id, transaction_count FROM ofx_imports WHERE user_id = $1 ORDER BY import_date DESC`,
            [req.userId]);
        res.json(rows.map(r => ({ ...r, fileName: r.file_name, importDate: r.import_date, bankId: r.bank_id, transactionCount: r.transaction_count })));
    } catch (err) {
        console.error('GET /ofx-imports error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});
app.post('/api/ofx-imports', authenticateToken, validateBody(ofxImportCreateSchema), async (req, res) => {
    const { fileName, importDate, bankId, transactionCount, content } = req.body;
    try {
        const ins = await pool.query(
            `INSERT INTO ofx_imports (user_id, file_name, import_date, bank_id, transaction_count, content)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [req.userId, fileName, importDate, bankId, transactionCount, content]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /ofx-imports error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/ofx-imports/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM transactions WHERE ofx_import_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM ofx_imports WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('COMMIT');
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("OFX delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});
}
