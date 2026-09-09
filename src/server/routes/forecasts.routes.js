import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';
import { recalculateBankBalance } from '../lib/banks.js';
import { validateBody } from '../middleware/validate.js';
import { forecastCreateSchema, forecastUpdateSchema, forecastRealizeSchema, forecastBulkSchema } from '../schemas.js';

export default function register(app) {
app.get('/api/forecasts', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM forecasts WHERE user_id = $1 ORDER BY date`, [req.userId]);
        res.json(rows.map(r => ({ ...r, realized: !!r.realized, categoryId: r.category_id, bankId: r.bank_id, creditCardId: r.credit_card_id, installmentCurrent: r.installment_current, installmentTotal: r.installment_total, groupId: r.group_id })));
    } catch (err) {
        console.error('GET /forecasts error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});
app.post('/api/forecasts', authenticateToken, validateBody(forecastCreateSchema), async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, realized, installmentCurrent, installmentTotal, groupId } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO forecasts (user_id, date, description, value, type, category_id, bank_id, credit_card_id, realized, installment_current, installment_total, group_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [req.userId, date, description, value, type, categoryId || null, bankId || null, creditCardId || null, realized ? 1 : 0, installmentCurrent || null, installmentTotal || null, groupId || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /forecasts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Criação em lote — recorrência (mensal, semanal, anual…). 1 requisição, 1
// transação de banco, em vez de 1 POST por ocorrência (que estourava o rate-limit
// num "fixo mensal" de 60 parcelas).
app.post('/api/forecasts/bulk', authenticateToken, validateBody(forecastBulkSchema), async (req, res) => {
    const { forecasts } = req.body;
    const bankIds = new Set(forecasts.map(f => f.bankId).filter(Boolean));
    const catIds = new Set(forecasts.map(f => f.categoryId).filter(Boolean));
    const cardIds = new Set(forecasts.map(f => f.creditCardId).filter(Boolean));
    for (const bankId of bankIds) { const o = await assertUserOwns(req.userId, { bankId }); if (!o.ok) return res.status(400).json({ error: o.error }); }
    for (const categoryId of catIds) { const o = await assertUserOwns(req.userId, { categoryId }); if (!o.ok) return res.status(400).json({ error: o.error }); }
    for (const creditCardId of cardIds) { const o = await assertUserOwns(req.userId, { creditCardId }); if (!o.ok) return res.status(400).json({ error: o.error }); }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const payload = JSON.stringify(forecasts.map(f => ({
            date: f.date, description: f.description || '', value: Number(f.value) || 0, type: f.type,
            category_id: f.categoryId || null, bank_id: f.bankId || null, credit_card_id: f.creditCardId || null,
            realized: f.realized ? 1 : 0,
            installment_current: f.installmentCurrent || null, installment_total: f.installmentTotal || null,
            group_id: f.groupId || null,
        })));
        const ins = await client.query(
            `INSERT INTO forecasts (user_id, date, description, value, type, category_id, bank_id, credit_card_id, realized, installment_current, installment_total, group_id)
             SELECT $1, x.date, x.description, x.value, x.type, x.category_id, x.bank_id, x.credit_card_id, x.realized, x.installment_current, x.installment_total, x.group_id
             FROM json_to_recordset($2::json) AS x(
                 date text, description text, value numeric, type text, category_id int, bank_id int,
                 credit_card_id int, realized int, installment_current int, installment_total int, group_id text
             )
             RETURNING id`,
            [req.userId, payload]);
        await client.query('COMMIT');
        res.json({ inserted: ins.rows.length, ids: ins.rows.map(r => r.id) });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST /forecasts/bulk error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/forecasts/:id', authenticateToken, validateBody(forecastUpdateSchema), async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        await pool.query(
            `UPDATE forecasts SET date=$1, description=$2, value=$3, type=$4, category_id=$5, bank_id=$6, credit_card_id=$7 WHERE id=$8 AND user_id=$9`,
            [date, description, value, type, categoryId || null, bankId || null, creditCardId || null, req.params.id, req.userId]);
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
            `INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, credit_card_id, reconciled)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0) RETURNING *`,
            [req.userId, txDate, (fc.description || '') + suffix, fc.value, fc.type,
             fc.category_id || null, fc.bank_id || null, fc.credit_card_id || null]);

        if (!fc.credit_card_id && fc.bank_id) {
            const modifier = fc.type === 'credito' ? 1 : -1;
            await client.query(`UPDATE banks SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
                [Number(fc.value) * modifier, fc.bank_id, req.userId]);
        }
        await client.query('COMMIT');
        res.json({
            success: true,
            transaction: { ...tx, reconciled: !!tx.reconciled, categoryId: tx.category_id, bankId: tx.bank_id, creditCardId: tx.credit_card_id },
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
