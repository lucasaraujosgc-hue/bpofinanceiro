import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { assertUserOwns } from '../lib/ownership.js';
import { recalculateBankBalance } from '../lib/banks.js';
import { validateBody } from '../middleware/validate.js';
import { transactionCreateSchema, transactionUpdateSchema, transactionReconcileSchema, transactionBatchSchema, transactionBulkSchema } from '../schemas.js';

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

// Criação em lote — 1 requisição, 1 transação de banco. Usado pela importação
// de extrato (que antes fazia 1 POST por lançamento e estourava o rate-limit) e
// pela recorrência de lançamentos. Opcionalmente registra o ofx_import junto.
app.post('/api/transactions/bulk', authenticateToken, validateBody(transactionBulkSchema), async (req, res) => {
    const { ofxImport, transactions } = req.body;

    // valida ownership do conjunto distinto de bancos/categorias/cartões (anti-IDOR)
    const bankIds = new Set(transactions.map(t => t.bankId).filter(Boolean));
    if (ofxImport?.bankId) bankIds.add(ofxImport.bankId);
    const catIds = new Set(transactions.map(t => t.categoryId).filter(Boolean));
    const cardIds = new Set(transactions.map(t => t.creditCardId).filter(Boolean));
    for (const bankId of bankIds) {
        const owned = await assertUserOwns(req.userId, { bankId });
        if (!owned.ok) return res.status(400).json({ error: owned.error });
    }
    for (const categoryId of catIds) {
        const owned = await assertUserOwns(req.userId, { categoryId });
        if (!owned.ok) return res.status(400).json({ error: owned.error });
    }
    for (const creditCardId of cardIds) {
        const owned = await assertUserOwns(req.userId, { creditCardId });
        if (!owned.ok) return res.status(400).json({ error: owned.error });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let importId = null;
        if (ofxImport) {
            const imp = await client.query(
                `INSERT INTO ofx_imports (user_id, file_name, import_date, bank_id, transaction_count, content)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [req.userId, ofxImport.fileName || null, ofxImport.importDate || new Date().toISOString(),
                 ofxImport.bankId || null, transactions.length, ofxImport.content || '']);
            importId = imp.rows[0].id;
        }

        // uma linha por lançamento via json_to_recordset (sem estourar o limite de parâmetros)
        const payload = JSON.stringify(transactions.map(t => ({
            date: t.date, description: t.description || '', value: Number(t.value) || 0, type: t.type,
            category_id: t.categoryId || null, bank_id: t.bankId || null,
            credit_card_id: t.creditCardId || null, reconciled: t.reconciled ? 1 : 0,
        })));
        const ins = await client.query(
            `INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, credit_card_id, reconciled, ofx_import_id)
             SELECT $1, x.date, x.description, x.value, x.type, x.category_id, x.bank_id, x.credit_card_id, x.reconciled, $2
             FROM json_to_recordset($3::json) AS x(
                 date text, description text, value numeric, type text,
                 category_id int, bank_id int, credit_card_id int, reconciled int
             )
             RETURNING id`,
            [req.userId, importId, payload]);

        // ajusta o saldo de cada banco afetado (só lançamentos sem cartão)
        const affectedBanks = [...bankIds];
        for (const bankId of affectedBanks) {
            await client.query(
                `UPDATE banks SET balance = COALESCE((
                     SELECT SUM(CASE WHEN type = 'credito' THEN value ELSE -value END)
                     FROM transactions WHERE bank_id = $1 AND credit_card_id IS NULL
                 ), 0) WHERE id = $1 AND user_id = $2`,
                [bankId, req.userId]);
        }

        await client.query('COMMIT');
        res.json({ inserted: ins.rows.length, ids: ins.rows.map(r => r.id), importId });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('POST /transactions/bulk error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
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
// Edição em lote — categoria / descrição (definir ou localizar-substituir) /
// data / valor / tipo / conciliação, num conjunto de ids de QUALQUER mês.
// 1 requisição, 1 transação de banco, saldos recalculados uma vez.
app.patch('/api/transactions/batch', authenticateToken, validateBody(transactionBatchSchema), async (req, res) => {
    const { ids, set } = req.body;

    const { rows: owned } = await pool.query(
        `SELECT id, bank_id, credit_card_id FROM transactions WHERE id = ANY($1::int[]) AND user_id = $2`,
        [ids, req.userId]);
    if (owned.length !== ids.length) return res.status(403).json({ error: 'Um ou mais lançamentos não são seus.' });

    if (set.categoryId) {
        const o = await assertUserOwns(req.userId, { categoryId: set.categoryId });
        if (!o.ok) return res.status(400).json({ error: o.error });
    }

    // colunas dinâmicas — só o que veio em `set`
    const cols = [];
    const params = [];
    const add = (frag, val) => { params.push(val); cols.push(frag.replace('$?', `$${params.length}`)); };
    if (set.categoryId !== undefined) add('category_id = $?', set.categoryId || null);
    if (set.description !== undefined) add('description = $?', set.description);
    else if (set.descriptionReplace) {
        params.push(set.descriptionReplace.from); const a = params.length;
        params.push(set.descriptionReplace.to); const b = params.length;
        cols.push(`description = replace(description, $${a}, $${b})`);
    }
    if (set.date !== undefined) add('date = $?', set.date);
    if (set.value !== undefined) add('value = $?', set.value);
    if (set.type !== undefined) add('type = $?', set.type);
    if (set.reconciled !== undefined) add('reconciled = $?', set.reconciled ? 1 : 0);
    if (cols.length === 0) return res.status(400).json({ error: 'Nada para alterar.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        params.push(ids); const idsIdx = params.length;
        params.push(req.userId); const uidIdx = params.length;
        const upd = await client.query(
            `UPDATE transactions SET ${cols.join(', ')}
             WHERE id = ANY($${idsIdx}::int[]) AND user_id = $${uidIdx} RETURNING id`,
            params);

        // valor/tipo mudaram → recomputa o saldo de cada banco afetado (sem cartão)
        if (set.value !== undefined || set.type !== undefined) {
            const bankIds = [...new Set(owned.filter(r => !r.credit_card_id && r.bank_id).map(r => r.bank_id))];
            for (const bankId of bankIds) {
                await client.query(
                    `UPDATE banks SET balance = COALESCE((
                         SELECT SUM(CASE WHEN type = 'credito' THEN value ELSE -value END)
                         FROM transactions WHERE bank_id = $1 AND credit_card_id IS NULL
                     ), 0) WHERE id = $1 AND user_id = $2`,
                    [bankId, req.userId]);
            }
        }
        await client.query('COMMIT');
        res.json({ updated: upd.rows.length });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('PATCH /transactions/batch error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});
}
