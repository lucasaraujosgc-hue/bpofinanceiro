import { pool } from '../db.js';

export function recalculateBankBalance(bankId) {
    if (!bankId) return;
    pool.query(`SELECT SUM(CASE WHEN type = 'credito' THEN value ELSE -value END) as balance FROM transactions WHERE bank_id = $1 AND credit_card_id IS NULL`, [bankId])
    .then(res => {
        let bal = res.rows[0]?.balance || 0;
        pool.query(`UPDATE banks SET balance = $1 WHERE id = $2`, [bal, bankId]).catch(e => console.error("Update balance DB error:", e.message));
    })
    .catch(e => {
        console.error("Balance recalculate DB error:", e.message);
    });
}
