import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { scenarioCreateSchema, scenarioUpdateSchema, simulateSchema } from '../schemas.js';
import { computeScenario, compareScenarios, normalizeAssumptions } from '../lib/scenario.js';

// ---------------------------------------------------------------------------
// Cenários — CRUD + projeção + comparação. Toda query é escopada por user_id;
// o :id vem do frontend e é sempre conferido contra o usuário (anti-IDOR).
// ---------------------------------------------------------------------------

const ASSUMPTION_COLS = [
    'receita_crescimento_pct', 'custos_variaveis_delta_pct', 'custos_fixos_delta_pct',
    'margem_bruta_alvo_pct', 'inadimplencia_pct', 'pmr_dias', 'pmp_dias',
    'investimentos_mensais', 'aportes_mensais', 'emprestimo_valor',
    'emprestimo_juros_mes_pct', 'emprestimo_amortizacao_meses', 'distribuicao_lucros_pct',
];

const scenarioDTO = (s, a) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    baseYear: s.base_year,
    horizonMonths: s.horizon_months,
    description: s.description || null,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    assumptions: normalizeAssumptions(a || {}),
});

async function loadScenario(id, userId) {
    const nid = parseInt(id, 10);
    if (!Number.isInteger(nid)) return null;
    const { rows: [s] } = await pool.query(
        `SELECT * FROM planning_scenarios WHERE id = $1 AND user_id = $2`, [nid, userId]);
    if (!s) return null;
    const { rows: [a] } = await pool.query(
        `SELECT * FROM planning_assumptions WHERE scenario_id = $1`, [s.id]);
    return { scenario: s, assumptions: a || {} };
}

// upsert das premissas (1:1 com o cenário)
async function saveAssumptions(scenarioId, userId, raw) {
    const A = normalizeAssumptions(raw || {});
    const vals = ASSUMPTION_COLS.map((c) => A[c]);
    const setList = ASSUMPTION_COLS.map((c, i) => `${c} = $${i + 3}`).join(', ');
    const insCols = ASSUMPTION_COLS.join(', ');
    const insPlace = ASSUMPTION_COLS.map((_, i) => `$${i + 3}`).join(', ');
    await pool.query(
        `INSERT INTO planning_assumptions (scenario_id, user_id, ${insCols})
         VALUES ($1, $2, ${insPlace})
         ON CONFLICT (scenario_id) DO UPDATE SET ${setList}, updated_at = now()`,
        [scenarioId, userId, ...vals],
    );
    return A;
}

const DEFAULT_PRESETS = [
    { name: 'Cenário Base', kind: 'base', assumptions: {} },
    {
        name: 'Cenário Otimista', kind: 'otimista',
        assumptions: { receita_crescimento_pct: 15, custos_variaveis_delta_pct: 8, custos_fixos_delta_pct: 3, inadimplencia_pct: 1 },
    },
    {
        name: 'Cenário Pessimista', kind: 'pessimista',
        assumptions: { receita_crescimento_pct: -10, custos_variaveis_delta_pct: -4, custos_fixos_delta_pct: 4, inadimplencia_pct: 5 },
    },
];

export default function register(app) {
// ---- listar ----
app.get('/api/planning/scenarios', authenticateToken, async (req, res) => {
    try {
        const { rows: scen } = await pool.query(
            `SELECT * FROM planning_scenarios WHERE user_id = $1 ORDER BY
                 CASE kind WHEN 'base' THEN 0 WHEN 'otimista' THEN 1 WHEN 'pessimista' THEN 2 ELSE 3 END, id`,
            [req.userId]);
        const { rows: assum } = await pool.query(
            `SELECT * FROM planning_assumptions WHERE user_id = $1`, [req.userId]);
        const byScen = {};
        for (const a of assum) byScen[a.scenario_id] = a;
        res.json({ scenarios: scen.map((s) => scenarioDTO(s, byScen[s.id])) });
    } catch (err) {
        console.error('GET /planning/scenarios error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- comparar todos (antes de :id) ----
app.get('/api/planning/scenarios/compare', authenticateToken, async (req, res) => {
    const horizon = parseInt(req.query.horizon, 10);
    const history = parseInt(req.query.history, 10);
    try {
        const { rows: scen } = await pool.query(
            `SELECT * FROM planning_scenarios WHERE user_id = $1 ORDER BY
                 CASE kind WHEN 'base' THEN 0 WHEN 'otimista' THEN 1 WHEN 'pessimista' THEN 2 ELSE 3 END, id`,
            [req.userId]);
        if (scen.length === 0) return res.json({ scenarios: [] });
        const { rows: assum } = await pool.query(
            `SELECT * FROM planning_assumptions WHERE user_id = $1`, [req.userId]);
        const byScen = {};
        for (const a of assum) byScen[a.scenario_id] = normalizeAssumptions(a);
        const list = scen.map((s) => ({ id: s.id, name: s.name, kind: s.kind, horizon_months: s.horizon_months, assumptions: byScen[s.id] || {} }));
        const data = await compareScenarios(req.userId, list, {
            horizonMonths: Number.isInteger(horizon) ? horizon : undefined,
            historyMonths: Number.isInteger(history) ? history : undefined,
        });
        res.json({ scenarios: data });
    } catch (err) {
        console.error('GET /planning/scenarios/compare error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});

// ---- criar cenários padrão (Base / Otimista / Pessimista) ----
app.post('/api/planning/scenarios/defaults', authenticateToken, async (req, res) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    try {
        const { rows: [{ n }] } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM planning_scenarios WHERE user_id = $1`, [req.userId]);
        if (n > 0) return res.status(409).json({ error: 'Você já tem cenários. Exclua-os antes de recriar os padrões.' });
        const created = [];
        for (const preset of DEFAULT_PRESETS) {
            const { rows: [s] } = await pool.query(
                `INSERT INTO planning_scenarios (user_id, name, kind, base_year, horizon_months, description)
                 VALUES ($1, $2, $3, $4, 12, $5) RETURNING *`,
                [req.userId, preset.name, preset.kind, year,
                 preset.kind === 'base' ? 'Projeção pela média histórica, sem ajustes.' : null]);
            const A = await saveAssumptions(s.id, req.userId, preset.assumptions);
            created.push(scenarioDTO(s, A));
        }
        res.json({ scenarios: created });
    } catch (err) {
        console.error('POST /planning/scenarios/defaults error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- criar ----
app.post('/api/planning/scenarios', authenticateToken, validateBody(scenarioCreateSchema), async (req, res) => {
    const { name, kind, baseYear, horizonMonths, description, assumptions } = req.body;
    try {
        const dup = await pool.query(
            `SELECT 1 FROM planning_scenarios WHERE user_id = $1 AND lower(name) = lower($2)`, [req.userId, name]);
        if (dup.rows.length) return res.status(409).json({ error: 'Já existe um cenário com esse nome.' });
        const { rows: [s] } = await pool.query(
            `INSERT INTO planning_scenarios (user_id, name, kind, base_year, horizon_months, description)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.userId, name, kind, baseYear, horizonMonths, description || null]);
        const A = await saveAssumptions(s.id, req.userId, assumptions || {});
        res.json({ scenario: scenarioDTO(s, A) });
    } catch (err) {
        console.error('POST /planning/scenarios error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- atualizar ----
app.put('/api/planning/scenarios/:id', authenticateToken, validateBody(scenarioUpdateSchema), async (req, res) => {
    try {
        const found = await loadScenario(req.params.id, req.userId);
        if (!found) return res.status(404).json({ error: 'Cenário não encontrado' });
        const { name, kind, baseYear, horizonMonths, description, assumptions } = req.body;

        if (name && name.toLowerCase() !== found.scenario.name.toLowerCase()) {
            const dup = await pool.query(
                `SELECT 1 FROM planning_scenarios WHERE user_id = $1 AND lower(name) = lower($2) AND id <> $3`,
                [req.userId, name, found.scenario.id]);
            if (dup.rows.length) return res.status(409).json({ error: 'Já existe um cenário com esse nome.' });
        }

        const { rows: [s] } = await pool.query(
            `UPDATE planning_scenarios
             SET name = COALESCE($2, name), kind = COALESCE($3, kind),
                 base_year = COALESCE($4, base_year), horizon_months = COALESCE($5, horizon_months),
                 description = $6, updated_at = now()
             WHERE id = $1 AND user_id = $7 RETURNING *`,
            [found.scenario.id, name ?? null, kind ?? null, baseYear ?? null, horizonMonths ?? null,
             description === undefined ? found.scenario.description : (description || null), req.userId]);

        let A = normalizeAssumptions(found.assumptions);
        if (assumptions !== undefined) {
            A = await saveAssumptions(found.scenario.id, req.userId, { ...found.assumptions, ...assumptions });
        }
        res.json({ scenario: scenarioDTO(s, A) });
    } catch (err) {
        console.error('PUT /planning/scenarios/:id error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- excluir ----
app.delete('/api/planning/scenarios/:id', authenticateToken, async (req, res) => {
    try {
        const found = await loadScenario(req.params.id, req.userId);
        if (!found) return res.status(404).json({ error: 'Cenário não encontrado' });
        await pool.query(`DELETE FROM planning_assumptions WHERE scenario_id = $1`, [found.scenario.id]);
        await pool.query(`DELETE FROM planning_scenarios WHERE id = $1 AND user_id = $2`, [found.scenario.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /planning/scenarios/:id error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- projeção de um cenário ----
app.get('/api/planning/scenarios/:id/projection', authenticateToken, async (req, res) => {
    try {
        const found = await loadScenario(req.params.id, req.userId);
        if (!found) return res.status(404).json({ error: 'Cenário não encontrado' });
        const horizon = parseInt(req.query.horizon, 10);
        const history = parseInt(req.query.history, 10);
        const data = await computeScenario(req.userId, {
            assumptions: found.assumptions,
            horizonMonths: Number.isInteger(horizon) ? horizon : found.scenario.horizon_months,
            historyMonths: Number.isInteger(history) ? history : 12,
        });
        res.json({
            scenario: scenarioDTO(found.scenario, found.assumptions),
            ...data,
        });
    } catch (err) {
        console.error('GET /planning/scenarios/:id/projection error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});

// ---- projeção ad-hoc (premissas no corpo, sem salvar) ----
app.post('/api/planning/scenarios/preview', authenticateToken, validateBody(scenarioUpdateSchema), async (req, res) => {
    try {
        const data = await computeScenario(req.userId, {
            assumptions: req.body.assumptions || {},
            horizonMonths: req.body.horizonMonths || 12,
            historyMonths: 12,
        });
        res.json(data);
    } catch (err) {
        console.error('POST /planning/scenarios/preview error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});

// ---- Simulador: base × simulado numa chamada só, sem tocar em nada no banco ----
app.post('/api/planning/scenarios/simulate', authenticateToken, validateBody(simulateSchema), async (req, res) => {
    const horizonMonths = req.body.horizonMonths || 12;
    try {
        const [base, simulado] = await Promise.all([
            computeScenario(req.userId, { assumptions: req.body.baseAssumptions || {}, horizonMonths, historyMonths: 12 }),
            computeScenario(req.userId, { assumptions: req.body.assumptions || {}, horizonMonths, historyMonths: 12 }),
        ]);
        res.json({ base, simulado });
    } catch (err) {
        console.error('POST /planning/scenarios/simulate error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});
}
