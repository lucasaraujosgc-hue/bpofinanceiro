import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { seedUserCategories } from '../lib/categorySeed.js';
import { validateBody } from '../middleware/validate.js';
import { categoryCreateSchema, categoryUpdateSchema } from '../schemas.js';

const toDto = (r) => ({
    ...r,
    groupType: r.group_type, mainGroup: r.main_group, subGroup: r.sub_group,
    costClassification: r.cost_classification, behaviorType: r.behavior_type,
    affectsDre: r.affects_dre, affectsCashflow: r.affects_cashflow, affectsBalance: r.affects_balance,
});

export default function register(app) {
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        let { rows } = await pool.query(`SELECT * FROM categories WHERE user_id = $1 ORDER BY name`, [req.userId]);
        if (rows.length === 0) {
            await seedUserCategories(req.userId);
            ({ rows } = await pool.query(`SELECT * FROM categories WHERE user_id = $1 ORDER BY name`, [req.userId]));
        }
        res.json(rows.map(toDto));
    } catch (err) {
        console.error('GET /categories error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});
app.post('/api/categories', authenticateToken, validateBody(categoryCreateSchema), async (req, res) => {
    const { name, type, groupType, mainGroup, subGroup, nature, affectsDre, affectsCashflow, affectsBalance, costClassification, behaviorType } = req.body;
    try {
        const ins = await pool.query(
            `INSERT INTO categories (user_id, name, type, group_type, main_group, sub_group, nature, affects_dre, affects_cashflow, affects_balance, cost_classification, behavior_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [req.userId, name, type, groupType, mainGroup, subGroup, nature,
             affectsDre !== undefined ? affectsDre : true,
             affectsCashflow !== undefined ? affectsCashflow : true,
             affectsBalance || false, costClassification, behaviorType]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /categories error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/categories/:id', authenticateToken, validateBody(categoryUpdateSchema), async (req, res) => {
    const { name, type, groupType, mainGroup, subGroup, nature, affectsDre, affectsCashflow, affectsBalance, costClassification, behaviorType } = req.body;
    try {
        await pool.query(
            `UPDATE categories SET name = $1, type = $2, group_type = $3, main_group = $4, sub_group = $5, nature = $6, affects_dre = $7, affects_cashflow = $8, affects_balance = $9, cost_classification = $10, behavior_type = $11 WHERE id = $12 AND user_id = $13`,
            [name, type, groupType, mainGroup, subGroup, nature,
             affectsDre !== undefined ? affectsDre : true,
             affectsCashflow !== undefined ? affectsCashflow : true,
             affectsBalance || false, costClassification, behaviorType, req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /categories error:', err.message);
        res.json({ success: false });
    }
});
app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`DELETE FROM categories WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /categories error:', err.message);
        res.json({ success: false });
    }
});
}
