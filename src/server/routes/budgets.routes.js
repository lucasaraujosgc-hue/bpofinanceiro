import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
    budgetCreateSchema, budgetItemsSchema, budgetClearLineSchema, budgetGenerateSchema,
} from '../schemas.js';
import {
    getOrCreateBudget, loadBudget, realizedByCategory, generateItems, upsertItems,
} from '../lib/budget.js';
import { budgetVsActual } from '../lib/budgetVsActual.js';

// Confere que o orçamento pertence ao usuário. `id` vem do frontend — nunca confiar.
async function ownedBudget(id, userId) {
    const { rows: [b] } = await pool.query(
        `SELECT * FROM budgets WHERE id = $1 AND user_id = $2`, [id, userId]);
    return b || null;
}

const parseYear = (q) => {
    const y = parseInt(q.year, 10);
    return (Number.isInteger(y) && y >= 2000 && y <= 2100) ? y : null;
};

export default function register(app) {
// Orçamento do ano + itens + realizado por categoria/mês (para a grade).
app.get('/api/planning/budgets', authenticateToken, async (req, res) => {
    const year = parseYear(req.query);
    if (!year) return res.status(400).json({ error: 'ano inválido' });
    try {
        const [{ budget, items }, realized] = await Promise.all([
            loadBudget(req.userId, year),
            realizedByCategory(req.userId, year),
        ]);
        const realizedByCat = {};
        for (const [catId, d] of Object.entries(realized)) realizedByCat[catId] = d.byMonth;
        res.json({ budget, items, realized: realizedByCat, year });
    } catch (err) {
        console.error('GET /planning/budgets error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Cria (ou devolve) o orçamento do ano.
app.post('/api/planning/budgets', authenticateToken, validateBody(budgetCreateSchema), async (req, res) => {
    const { year, name } = req.body;
    try {
        const budget = await getOrCreateBudget(req.userId, year, name);
        res.json({ budget });
    } catch (err) {
        console.error('POST /planning/budgets error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Upsert em lote dos itens (edição manual da grade).
app.put('/api/planning/budgets/:id/items', authenticateToken, validateBody(budgetItemsSchema), async (req, res) => {
    try {
        const budget = await ownedBudget(req.params.id, req.userId);
        if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
        await upsertItems(budget.id, req.userId, req.body.items);
        const { items } = await loadBudget(req.userId, budget.year);
        res.json({ items });
    } catch (err) {
        console.error('PUT /planning/budgets/:id/items error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Gera os itens a partir de histórico / ano anterior / cópia.
app.post('/api/planning/budgets/:id/generate', authenticateToken, validateBody(budgetGenerateSchema), async (req, res) => {
    const { method, months, growthPct, fromYear, scope } = req.body;
    try {
        const budget = await ownedBudget(req.params.id, req.userId);
        if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
        if (method === 'copy' && !fromYear) return res.status(400).json({ error: 'informe o ano de origem' });

        const gen = await generateItems(req.userId, budget.year, { method, months, growthPct, fromYear, scope });
        await upsertItems(budget.id, req.userId, gen, scope);
        const { items } = await loadBudget(req.userId, budget.year);
        res.json({ items, generated: gen.length });
    } catch (err) {
        console.error('POST /planning/budgets/:id/generate error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Zera uma linha (todos os 12 meses de uma categoria ou grupo).
app.delete('/api/planning/budgets/:id/items', authenticateToken, validateBody(budgetClearLineSchema), async (req, res) => {
    const { categoryId, groupType } = req.body;
    try {
        const budget = await ownedBudget(req.params.id, req.userId);
        if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
        if (categoryId) {
            await pool.query(`DELETE FROM budget_items WHERE budget_id = $1 AND category_id = $2`, [budget.id, categoryId]);
        } else if (groupType) {
            await pool.query(`DELETE FROM budget_items WHERE budget_id = $1 AND category_id IS NULL AND group_type = $2`, [budget.id, groupType]);
        }
        const { items } = await loadBudget(req.userId, budget.year);
        res.json({ items });
    } catch (err) {
        console.error('DELETE /planning/budgets/:id/items error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Orçado × Realizado do período. period: 'month' (usa month, 0-11), 'ytd', 'year'.
app.get('/api/planning/budget-vs-actual', authenticateToken, async (req, res) => {
    const year = parseYear(req.query);
    if (!year) return res.status(400).json({ error: 'ano inválido' });
    const period = ['month', 'ytd', 'year'].includes(req.query.period) ? req.query.period : 'ytd';
    let fromMonth = 1, toMonth = 12;
    if (period === 'month') {
        const m = parseInt(req.query.month, 10);
        if (!Number.isInteger(m) || m < 0 || m > 11) return res.status(400).json({ error: 'mês inválido' });
        fromMonth = toMonth = m + 1;
    } else if (period === 'ytd') {
        const now = new Date();
        toMonth = (now.getFullYear() === year) ? now.getMonth() + 1 : 12;
    }
    try {
        const data = await budgetVsActual(req.userId, year, fromMonth, toMonth);
        res.json({ ...data, period });
    } catch (err) {
        console.error('GET /planning/budget-vs-actual error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/planning/budgets/:id', authenticateToken, async (req, res) => {
    try {
        const budget = await ownedBudget(req.params.id, req.userId);
        if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
        await pool.query(`DELETE FROM budget_items WHERE budget_id = $1`, [budget.id]);
        await pool.query(`DELETE FROM budgets WHERE id = $1 AND user_id = $2`, [budget.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /planning/budgets/:id error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
}
