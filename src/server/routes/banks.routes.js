import { db, pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';

export default function register(app) {
app.get('/api/global-banks', (req, res) => {
    db.all('SELECT * FROM global_banks ORDER BY name', [], (err, rows) => res.json(rows || []));
});
app.get('/api/banks', authenticateToken, (req, res) => {
    db.all('SELECT * FROM banks WHERE user_id = ? ORDER BY active DESC, name', [req.userId], (err, rows) => res.json(rows || []));
});
app.post('/api/banks', authenticateToken, (req, res) => {
    const { name, accountNumber, nickname, logo } = req.body;
    db.run(`INSERT INTO banks (user_id, name, account_number, nickname, logo) VALUES (?, ?, ?, ?, ?)`, 
        [req.userId, name, accountNumber, nickname, logo], function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({id: this.lastID});
    });
});
app.put('/api/banks/:id', authenticateToken, (req, res) => {
    const { nickname, active } = req.body;
    db.run(`UPDATE banks SET nickname = COALESCE(?, nickname), active = COALESCE(?, active) WHERE id = ? AND user_id = ?`,
        [nickname, active, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/banks/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM transactions WHERE bank_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM forecasts WHERE bank_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM credit_cards WHERE bank_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM banks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('COMMIT');
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Bank delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});

// Cartões de Crédito
app.get('/api/credit-cards', authenticateToken, (req, res) => {
    db.all('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY name', [req.userId], (err, rows) => {
        res.json((rows || []).map(r => ({
            id: r.id, bankId: r.bank_id, name: r.name,
            closingDay: r.closing_day, dueDay: r.due_day, limitValue: r.limit_value
        })));
    });
});
app.post('/api/credit-cards', authenticateToken, async (req, res) => {
    const { bankId, name, closingDay, dueDay, limitValue } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO credit_cards (user_id, bank_id, name, closing_day, due_day, limit_value)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [req.userId, bankId || null, name, closingDay || null, dueDay || null, limitValue || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /credit-cards error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/credit-cards/:id', authenticateToken, (req, res) => {
    const { name, closingDay, dueDay, limitValue } = req.body;
    db.run(`UPDATE credit_cards SET name = ?, closing_day = ?, due_day = ?, limit_value = ? WHERE id = ? AND user_id = ?`,
        [name, closingDay, dueDay, limitValue, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/credit-cards/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM transactions WHERE credit_card_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM credit_cards WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('COMMIT');
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Credit card delete delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});
}
