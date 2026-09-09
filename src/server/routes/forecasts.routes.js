import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';
import { recalculateBankBalance } from '../lib/banks.js';
import { validateBody } from '../middleware/validate.js';
import { forecastCreateSchema, forecastUpdateSchema, forecastRealizeSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/forecasts', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM forecasts WHERE user_id = $1 ORDER BY date`, [req.userId]);
        res.json(rows.map(r => ({ ...r, realized: !!r.realized, categoryId: r.category_id, bankId: r.bank_id, creditCardId: r.credit_card_id, installmentCurrent: r.installment_current, installmentTotal: r.installment_total, groupId: r.group_id, accrualDate: r.accrual_date })));
    } catch (err) {
        console.error('GET /forecasts error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});
app.post('/api/forecasts', authenticateToken, validateBody(forecastCreateSchema), async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, realized, installmentCurrent, installmentTotal, groupId, accrualDate } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO forecasts (user_id, date, description, value, type, category_id, bank_id, credit_card_id, realized, installment_current, installment_total, group_id, accrual_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [req.userId, date, description, value, type, categoryId || null, bankId || null, creditCardId || null, realized ? 1 : 0, installmentCurrent || null, installmentTotal || null, groupId || null, accrualDate || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /forecasts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/forecasts/:id', authenticateToken, validateBody(forecastUpdateSchema), async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, accrualDate } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        await pool.query(
            `UPDATE forecasts SET date=$1, description=$2, value=$3, type=$4, category_id=$5, bank_id=$6, credit_card_id=$7, accrual_date=$8 WHERE id=$9 AND user_id=$10`,
            [date, description, value, type, categoryId || null, bankId || null, creditCardId || null, accrualDate || null, req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /forecasts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// Realiza uma previsão: numa única transação de banco, marca realized=1 E cria
// o lançamento correspondente. Substitui o antigo par de chamadas do frontend
// (PATCH realize + POST /transactions), que não era atômico e podia duplicar.
// Retorna { success, transaction }.
app.patch('/api/forecasts/:id/realize', authenticateToken, validateBody(forecastRealizeSchema), async (req, res) => {
    const { realizedDate } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [fc] } = await client.query(
            `SELECT * FROM forecasts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [req.params.id, req.userId]);
        if (!fc) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Previsão não encontrada' }); }
        if (fc.realized) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Previsão já realizada' }); }

        await client.query(`UPDATE forecasts SET realized = 1 WHERE id = $1`, [fc.id]);

        const suffix = fc.installment_total
            ? ` (${fc.installment_current}/${fc.installment_total})`
            : (fc.group_id ? ' (Recorrente)' : '');
        const txDate = realizedDate || fc.date;
        const { rows: [tx] } = await client.query(
            `INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, credit_card_id, reconciled, accrual_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9) RETURNING *`,
            [req.userId, txDate, (fc.description || '') + suffix, fc.value, fc.type,
             fc.category_id || null, fc.bank_id || null, fc.credit_card_id || null, fc.accrual_date || null]);

        if (!fc.credit_card_id && fc.bank_id) {
            const modifier = fc.type === 'credito' ? 1 : -1;
            await client.query(`UPDATE banks SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
                [Number(fc.value) * modifier, fc.bank_id, req.userId]);
        }
        await client.query('COMMIT');
        res.json({
            success: true,
            transaction: { ...tx, reconciled: !!tx.reconciled, categoryId: tx.category_id, bankId: tx.bank_id, creditCardId: tx.credit_card_id, accrualDate: tx.accrual_date },
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('PATCH /forecasts realize error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});
app.delete('/api/forecasts/:id', authenticateToken, async (req, res) => {
    const mode = req.query.mode || 'single';
    try {
        if (mode === 'single') {
            await pool.query(`DELETE FROM forecasts WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
            return res.json({ success: true });
        }

        const { rows: [current] } = await pool.query(
            `SELECT group_id, date FROM forecasts WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        if (!current) return res.status(404).json({ success: false, error: "Não encontrado" });

        if (!current.group_id) {
            await pool.query(`DELETE FROM forecasts WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
            return res.json({ success: true });
        }

        let sql = `DELETE FROM forecasts WHERE group_id = $1 AND user_id = $2`;
        const params = [current.group_id, req.userId];
        if (mode === 'future') { sql += ` AND date >= $3`; params.push(current.date); }
        await pool.query(sql, params);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /forecasts error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
}
