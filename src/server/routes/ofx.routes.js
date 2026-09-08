import { db, pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

export default function register(app) {
app.get('/api/ofx-imports', authenticateToken, (req, res) => {
    db.all(`SELECT id, file_name, import_date, bank_id, transaction_count FROM ofx_imports WHERE user_id = ? ORDER BY import_date DESC`, [req.userId], (err, rows) => {
        res.json((rows || []).map(r => ({...r, fileName: r.file_name, importDate: r.import_date, bankId: r.bank_id, transactionCount: r.transaction_count})));
    });
});
app.post('/api/ofx-imports', authenticateToken, (req, res) => {
    const { fileName, importDate, bankId, transactionCount, content } = req.body;
    db.run(`INSERT INTO ofx_imports (user_id, file_name, import_date, bank_id, transaction_count, content) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId, fileName, importDate, bankId, transactionCount, content], function(err) { res.json({id: this.lastID}); });
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
