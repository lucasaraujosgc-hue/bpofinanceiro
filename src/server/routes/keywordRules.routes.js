import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';
import { validateBody } from '../middleware/validate.js';
import { keywordRuleCreateSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/keyword-rules', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM keyword_rules WHERE user_id = $1`, [req.userId]);
        res.json(rows.map(r => ({ ...r, categoryId: r.category_id, bankId: r.bank_id, setDescription: r.set_description || null })));
    } catch (err) {
        console.error('GET /keyword-rules error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});
app.post('/api/keyword-rules', authenticateToken, validateBody(keywordRuleCreateSchema), async (req, res) => {
    const { keyword, type, categoryId, bankId, setDescription } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO keyword_rules (user_id, keyword, type, category_id, bank_id, set_description)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [req.userId, keyword, type, categoryId || null, bankId || null, setDescription || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /keyword-rules error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Aplica uma regra RETROATIVAMENTE aos lançamentos já existentes que casam
// (palavra-chave + tipo + banco) e ainda estão SEM categoria — nunca sobrescreve
// categorização já feita. Se a regra tem set_description, também renomeia.
app.post('/api/keyword-rules/:id/apply', authenticateToken, async (req, res) => {
    try {
        const { rows: [rule] } = await pool.query(
            `SELECT * FROM keyword_rules WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        if (!rule) return res.status(404).json({ error: 'Regra não encontrada' });
        if (!rule.category_id) return res.status(400).json({ error: 'Regra sem categoria' });

        const like = `%${String(rule.keyword).toLowerCase()}%`;
        const params = [rule.category_id, req.userId, rule.type, like];
        let bankClause = '';
        if (rule.bank_id) { bankClause = ' AND bank_id = $5'; params.push(rule.bank_id); }
        const setDesc = rule.set_description
            ? `, description = $${params.push(rule.set_description)}`
            : '';

        const upd = await pool.query(
            `UPDATE transactions
             SET category_id = $1, reconciled = 1${setDesc}
             WHERE user_id = $2 AND category_id IS NULL AND type = $3
               AND lower(description) LIKE $4${bankClause}
             RETURNING id`,
            params);
        res.json({ updated: upd.rows.length });
    } catch (err) {
        console.error('POST /keyword-rules/:id/apply error:', err.message);
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
