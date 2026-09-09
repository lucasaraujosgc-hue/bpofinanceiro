import { pool } from '../db.js';

// ---------------------------------------------------------------------------
// Orçamento — carga, dados de realizado e geradores.
// Itens do orçamento são por categoria/mês; group_type do item = grupo da
// categoria (permite somar por grupo do DRE depois).
// ---------------------------------------------------------------------------

export async function getOrCreateBudget(userId, year, name) {
    await pool.query(
        `INSERT INTO budgets (user_id, year, name) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, year) DO NOTHING`,
        [userId, year, name || `Orçamento ${year}`],
    );
    const { rows: [budget] } = await pool.query(
        `SELECT * FROM budgets WHERE user_id = $1 AND year = $2`, [userId, year]);
    return budget;
}

export async function loadBudget(userId, year) {
    const { rows: [budget] } = await pool.query(
        `SELECT * FROM budgets WHERE user_id = $1 AND year = $2`, [userId, year]);
    if (!budget) return { budget: null, items: [] };
    const { rows: items } = await pool.query(
        `SELECT id, month, category_id, group_type, kind, amount, quantity
         FROM budget_items WHERE budget_id = $1 ORDER BY month`, [budget.id]);
    return {
        budget,
        items: items.map(r => ({
            id: r.id, month: r.month, categoryId: r.category_id, groupType: r.group_type,
            kind: r.kind, amount: Number(r.amount), quantity: r.quantity != null ? Number(r.quantity) : null,
        })),
    };
}

// { [categoryId]: { m: amount(abs), meta: {type, group_type, name} } } no ano.
export async function realizedByCategory(userId, year) {
    const { rows } = await pool.query(
        `SELECT t.category_id,
                EXTRACT(MONTH FROM t.date::date)::int AS m,
                SUM(t.value)::float AS total,
                c.type AS ctype, c.group_type, c.name
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND EXTRACT(YEAR FROM t.date::date) = $2
         GROUP BY t.category_id, m, c.type, c.group_type, c.name`,
        [userId, year]);
    const out = {};
    for (const r of rows) {
        if (!out[r.category_id]) out[r.category_id] = { byMonth: {}, meta: { type: r.ctype, groupType: r.group_type, name: r.name } };
        out[r.category_id].byMonth[r.m] = Math.abs(Number(r.total) || 0);
    }
    return out;
}

// média dos últimos `months` meses (terminando em dez/year-1) por categoria.
export async function historicalAvgByCategory(userId, year, months) {
    const end = `${year}-01-01`;
    const start = new Date(Date.UTC(year - 1, 12 - months, 1)).toISOString().slice(0, 10);
    const { rows } = await pool.query(
        `SELECT t.category_id, SUM(t.value)::float AS total, COUNT(DISTINCT to_char(t.date::date,'YYYY-MM')) AS nmeses,
                c.type AS ctype, c.group_type, c.name
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND t.date::date >= $2::date AND t.date::date < $3::date
         GROUP BY t.category_id, c.type, c.group_type, c.name`,
        [userId, start, end]);
    const out = {};
    for (const r of rows) {
        const media = Math.abs(Number(r.total) || 0) / months; // média sobre a janela cheia
        out[r.category_id] = { media, meta: { type: r.ctype, groupType: r.group_type, name: r.name } };
    }
    return out;
}

const inScope = (type, scope) =>
    scope === 'all' || (scope === 'receitas' && type === 'receita') || (scope === 'despesas' && type === 'despesa');

// Retorna a lista de itens (por categoria/mês) para um método de geração.
export async function generateItems(userId, year, { method, months, growthPct, fromYear, scope }) {
    const f = 1 + (Number(growthPct) || 0) / 100;
    const items = [];

    if (method === 'prev_year') {
        const real = await realizedByCategory(userId, year - 1);
        for (const [catId, data] of Object.entries(real)) {
            if (!inScope(data.meta.type, scope)) continue;
            for (let m = 1; m <= 12; m++) {
                const base = data.byMonth[m] || 0;
                if (base <= 0) continue;
                items.push({ month: m, categoryId: Number(catId), groupType: data.meta.groupType, kind: data.meta.type, amount: Math.round(base * f * 100) / 100 });
            }
        }
    } else if (method === 'history_avg') {
        const avg = await historicalAvgByCategory(userId, year, months);
        for (const [catId, data] of Object.entries(avg)) {
            if (!inScope(data.meta.type, scope)) continue;
            const val = Math.round(data.media * f * 100) / 100;
            if (val <= 0) continue;
            for (let m = 1; m <= 12; m++) {
                items.push({ month: m, categoryId: Number(catId), groupType: data.meta.groupType, kind: data.meta.type, amount: val });
            }
        }
    } else if (method === 'copy') {
        const src = await loadBudget(userId, fromYear);
        for (const it of src.items) {
            if (!it.categoryId) continue;
            // precisa do kind/group — vem do próprio item
            if (!inScope(it.kind, scope)) continue;
            const val = Math.round(it.amount * f * 100) / 100;
            if (val <= 0) continue;
            items.push({ month: it.month, categoryId: it.categoryId, groupType: it.groupType, kind: it.kind, amount: val });
        }
    }
    return items;
}

// Upsert em lote (uma transação). `items` já validados pelo zod.
// Se `replaceScope` for passado ('receitas'|'despesas'|'all'), apaga primeiro
// os itens desse escopo (usado pelos geradores).
export async function upsertItems(budgetId, userId, items, replaceScope) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (replaceScope) {
            const kinds = replaceScope === 'all' ? ['receita', 'despesa']
                : replaceScope === 'receitas' ? ['receita'] : ['despesa'];
            await client.query(`DELETE FROM budget_items WHERE budget_id = $1 AND kind = ANY($2::text[])`, [budgetId, kinds]);
        }
        for (const it of items) {
            const amount = Number(it.amount) || 0;
            const catId = it.categoryId || null;
            const grp = catId ? (it.groupType || null) : (it.groupType || null);
            if (catId) {
                await client.query(
                    `INSERT INTO budget_items (budget_id, user_id, month, category_id, group_type, kind, amount, quantity)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     ON CONFLICT (budget_id, month, category_id) WHERE category_id IS NOT NULL
                     DO UPDATE SET amount = EXCLUDED.amount, quantity = EXCLUDED.quantity, group_type = EXCLUDED.group_type, kind = EXCLUDED.kind`,
                    [budgetId, userId, it.month, catId, grp, it.kind, amount, it.quantity ?? null]);
            } else if (grp) {
                await client.query(
                    `INSERT INTO budget_items (budget_id, user_id, month, category_id, group_type, kind, amount, quantity)
                     VALUES ($1,$2,$3,NULL,$4,$5,$6,$7)
                     ON CONFLICT (budget_id, month, group_type) WHERE category_id IS NULL AND group_type IS NOT NULL
                     DO UPDATE SET amount = EXCLUDED.amount, quantity = EXCLUDED.quantity, kind = EXCLUDED.kind`,
                    [budgetId, userId, it.month, grp, it.kind, amount, it.quantity ?? null]);
            }
        }
        await client.query(`UPDATE budgets SET updated_at = now() WHERE id = $1`, [budgetId]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}
