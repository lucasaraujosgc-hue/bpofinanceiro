import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';
import { validateBody } from '../middleware/validate.js';
import { keywordRuleCreateSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/keyword-rules', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM keyword_rules WHERE user_id = $1`, [req.userId]);
        res.json(rows.map(r => ({ ...r, categoryId: r.category_id, bankId: r.bank_id })));
    } catch (err) {
        console.error('GET /keyword-rules error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});
app.post('/api/keyword-rules', authenticateToken, validateBody(keywordRuleCreateSchema), async (req, res) => {
    const { keyword, type, categoryId, bankId } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO keyword_rules (user_id, keyword, type, category_id, bank_id)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [req.userId, keyword, type, categoryId || null, bankId || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /keyword-rules error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/keyword-rules/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`DELETE FROM keyword_rules WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /keyword-rules error:', err.message);
        res.json({ success: false });
    }
});
}
