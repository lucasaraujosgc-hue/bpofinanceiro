import { pool } from '../db.js';
import { INITIAL_CATEGORIES_SEED } from '../schema.js';

// Insere o plano de contas inicial de um usuário — um único INSERT multi-linha.
export async function seedUserCategories(userId) {
    const values = [];
    const tuples = INITIAL_CATEGORIES_SEED.map((c, i) => {
        const b = i * 5;
        values.push(userId, c.name, c.type, c.group, c.behavior || 'variavel');
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, true, true, false)`;
    });
    await pool.query(
        `INSERT INTO categories (user_id, name, type, group_type, behavior_type, affects_dre, affects_cashflow, affects_balance)
         VALUES ${tuples.join(', ')}`,
        values,
    );
}
