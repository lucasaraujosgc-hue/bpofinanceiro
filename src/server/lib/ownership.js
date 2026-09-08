import { pool } from '../db.js';

// Confere que cada FK (banco / categoria / cartão) referenciada pertence ao
// próprio usuário. `table` vem de uma lista fixa — nunca do request.
export async function assertUserOwns(userId, { bankId, categoryId, creditCardId }) {
    const checks = [];
    if (bankId) checks.push(['banks', bankId]);
    if (categoryId) checks.push(['categories', categoryId]);
    if (creditCardId) checks.push(['credit_cards', creditCardId]);
    for (const [table, id] of checks) {
        const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (rows.length === 0) return { ok: false, error: `Registro inválido (${table}).` };
    }
    return { ok: true };
}
