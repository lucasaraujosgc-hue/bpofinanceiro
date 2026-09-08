import { db } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { INITIAL_CATEGORIES_SEED } from '../schema.js';

export default function register(app) {
app.get('/api/categories', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM categories WHERE user_id = ? ORDER BY name`, [req.userId], (err, rows) => {
        if(rows && rows.length === 0) {
            const stmt = db.prepare("INSERT INTO categories (user_id, name, type, group_type, behavior_type, affects_dre, affects_cashflow, affects_balance) VALUES (?, ?, ?, ?, ?, true, true, false)");
            INITIAL_CATEGORIES_SEED.forEach(c => stmt.run(req.userId, c.name, c.type, c.group, c.behavior || 'variavel'));
            stmt.finalize(() => {
                db.all(`SELECT * FROM categories WHERE user_id = ?`, [req.userId], (err, newRows) => {
                    res.json((newRows || []).map(r => ({ ...r, groupType: r.group_type, mainGroup: r.main_group, subGroup: r.sub_group, costClassification: r.cost_classification, behaviorType: r.behavior_type, affectsDre: r.affects_dre, affectsCashflow: r.affects_cashflow, affectsBalance: r.affects_balance })));
                });
            });
        } else {
            res.json((rows || []).map(r => ({ ...r, groupType: r.group_type, mainGroup: r.main_group, subGroup: r.sub_group, costClassification: r.cost_classification, behaviorType: r.behavior_type, affectsDre: r.affects_dre, affectsCashflow: r.affects_cashflow, affectsBalance: r.affects_balance })));
        }
    });
});
app.post('/api/categories', authenticateToken, (req, res) => {
    const { name, type, groupType, mainGroup, subGroup, nature, affectsDre, affectsCashflow, affectsBalance, costClassification, behaviorType } = req.body;
    db.run(`INSERT INTO categories (user_id, name, type, group_type, main_group, sub_group, nature, affects_dre, affects_cashflow, affects_balance, cost_classification, behavior_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [req.userId, name, type, groupType, mainGroup, subGroup, nature, affectsDre !== undefined ? affectsDre : true, affectsCashflow !== undefined ? affectsCashflow : true, affectsBalance || false, costClassification, behaviorType], function(err) {
        res.json({ id: this.lastID });
    });
});
app.put('/api/categories/:id', authenticateToken, (req, res) => {
    const { name, type, groupType, mainGroup, subGroup, nature, affectsDre, affectsCashflow, affectsBalance, costClassification, behaviorType } = req.body;
    db.run(`UPDATE categories SET name = ?, type = ?, group_type = ?, main_group = ?, sub_group = ?, nature = ?, affects_dre = ?, affects_cashflow = ?, affects_balance = ?, cost_classification = ?, behavior_type = ? WHERE id = ? AND user_id = ?`, 
    [name, type, groupType, mainGroup, subGroup, nature, affectsDre !== undefined ? affectsDre : true, affectsCashflow !== undefined ? affectsCashflow : true, affectsBalance || false, costClassification, behaviorType, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM categories WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err) => res.json({success: !err}));
});
}
