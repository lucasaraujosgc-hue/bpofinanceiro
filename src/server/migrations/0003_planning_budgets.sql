-- 0003_planning_budgets — orçamento financeiro (área Planejamento, Fase 2).
--
-- Um orçamento por usuário por ano. Itens = valor por mês por categoria OU por
-- grupo do DRE (quando category_id é nulo, group_type diz o grupo). `kind`
-- (receita/despesa) é redundante mas evita join na agregação.

CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    year INT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_year ON budgets(user_id, year);

CREATE TABLE IF NOT EXISTS budget_items (
    id SERIAL PRIMARY KEY,
    budget_id INT NOT NULL,
    user_id INT NOT NULL,
    month INT NOT NULL,
    category_id INT,
    group_type TEXT,
    kind TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    quantity NUMERIC(15,2),
    FOREIGN KEY(budget_id) REFERENCES budgets(id),
    FOREIGN KEY(category_id) REFERENCES categories(id)
);
CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON budget_items(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_user ON budget_items(user_id);
-- Uma linha por (orçamento, mês, categoria) e uma por (orçamento, mês, grupo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_items_cat
    ON budget_items(budget_id, month, category_id) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_items_grp
    ON budget_items(budget_id, month, group_type) WHERE category_id IS NULL AND group_type IS NOT NULL;
