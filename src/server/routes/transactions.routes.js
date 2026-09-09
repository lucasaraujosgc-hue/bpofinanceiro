import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';
import { recalculateBankBalance } from '../lib/banks.js';
import { validateBody } from '../middleware/validate.js';
import { transactionCreateSchema, transactionUpdateSchema, transactionReconcileSchema, transactionBatchUpdateSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC LIMIT 5000`, [req.userId]);
        res.json(rows.map(r => ({...r, reconciled: !!r.reconciled, categoryId: r.category_id, bankId: r.bank_id, creditCardId: r.credit_card_id})));
    } catch(err) {
        console.error("GET /transactions error:", err.message);
        res.status(500).json({error: "Server Error"});
    }
});
app.post('/api/transactions', authenticateToken, validateBody(transactionCreateSchema), async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, reconciled, ofxImportId } = req.body;
    try {
        // 400 (não 403): é validação de payload. O apiFetch do frontend desloga
        // em 401/403, e um id de categoria/banco obsoleto não deve derrubar a sessão.
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(400).json({ error: owned.error });

        const ins = await pool.query(
            `INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, credit_card_id, reconciled, ofx_import_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [req.userId, date, description, value, type, categoryId || null, bankId || null, creditCardId || null, reconciled ? 1 : 0, ofxImportId || null]
        );

        if (!creditCardId && bankId) {
            const modifier = type === 'credito' ? 1 : -1;
            await pool.query(`UPDATE banks SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
                [Number(value) * modifier, bankId, req.userId]);
        }
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error("POST /transactions error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/transactions/:id', authenticateToken, validateBody(transactionUpdateSchema), async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, reconciled } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const { rows: [oldTx] } = await pool.query(
            `SELECT * FROM transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        if (!oldTx) return res.status(404).json({ error: "Não encontrado" });
        await pool.query(
            `UPDATE transactions SET date=$1, description=$2, value=$3, type=$4, category_id=$5, bank_id=$6, credit_card_id=$7, reconciled=$8 WHERE id=$9 AND user_id=$10`,
            [date, description, value, type, categoryId || null, bankId || null, creditCardId || null, reconciled ? 1 : 0, req.params.id, req.userId]);
        if (!oldTx.credit_card_id) recalculateBankBalance(oldTx.bank_id);
        if (!creditCardId && bankId) recalculateBankBalance(bankId);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /transactions error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const { rows: [row] } = await pool.query(
            `SELECT bank_id, credit_card_id FROM transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        if (!row) return res.json({ success: false });
        await pool.query(`DELETE FROM transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        if (!row.credit_card_id) recalculateBankBalance(row.bank_id);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /transactions error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
app.patch('/api/transactions/:id/reconcile', authenticateToken, validateBody(transactionReconcileSchema), async (req, res) => {
    const { reconciled } = req.body;
    try {
        await pool.query(`UPDATE transactions SET reconciled = $1 WHERE id = $2 AND user_id = $3`,
            [reconciled ? 1 : 0, req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('PATCH /transactions reconcile error:', err.message);
        res.json({ success: false });
    }
});
app.patch('/api/transactions/batch-update', authenticateToken, validateBody(transactionBatchUpdateSchema), async (req, res) => {
    const { transactionIds, categoryId } = req.body;
    if(!Array.isArray(transactionIds) || transactionIds.length === 0) return res.json({success: true});
    try {
        await pool.query(
            `UPDATE transactions SET category_id = $1, reconciled = 1 WHERE id = ANY($2::int[]) AND user_id = $3`,
            [categoryId, transactionIds, req.userId]
        );
        res.json({success: true});
    } catch(e) {
        console.error("Batch update error:", e.message);
        res.status(500).json({success: false});
    }
});
}
