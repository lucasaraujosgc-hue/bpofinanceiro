-- 0004_planning_scenarios — cenários financeiros (área Planejamento, Fase 5).
--
-- Um cenário = um conjunto de premissas aplicado sobre uma base (média
-- histórica por categoria) para gerar DRE projetada, fluxo de caixa projetado
-- e indicadores (ponto de equilíbrio, caixa final, NCG).
--
-- planning_assumptions é 1:1 com planning_scenarios (scenario_id é PK). Tabela
-- larga (uma coluna por premissa) — o conjunto de premissas é fixo e pequeno,
-- fica mais simples de validar/consultar que um par chave/valor.

CREATE TABLE IF NOT EXISTS planning_scenarios (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'custom',
    base_year INT NOT NULL,
    horizon_months INT NOT NULL DEFAULT 12,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_scenarios_user_name ON planning_scenarios(user_id, name);
CREATE INDEX IF NOT EXISTS idx_planning_scenarios_user ON planning_scenarios(user_id);

CREATE TABLE IF NOT EXISTS planning_assumptions (
    scenario_id INT PRIMARY KEY,
    user_id INT NOT NULL,
    receita_crescimento_pct NUMERIC(9,2) NOT NULL DEFAULT 0,
    custos_variaveis_delta_pct NUMERIC(9,2) NOT NULL DEFAULT 0,
    custos_fixos_delta_pct NUMERIC(9,2) NOT NULL DEFAULT 0,
    margem_bruta_alvo_pct NUMERIC(9,2),
    inadimplencia_pct NUMERIC(9,2) NOT NULL DEFAULT 0,
    pmr_dias INT,
    pmp_dias INT,
    investimentos_mensais NUMERIC(15,2) NOT NULL DEFAULT 0,
    aportes_mensais NUMERIC(15,2) NOT NULL DEFAULT 0,
    emprestimo_valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    emprestimo_juros_mes_pct NUMERIC(9,2) NOT NULL DEFAULT 0,
    emprestimo_amortizacao_meses INT NOT NULL DEFAULT 0,
    distribuicao_lucros_pct NUMERIC(9,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(scenario_id) REFERENCES planning_scenarios(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_planning_assumptions_user ON planning_assumptions(user_id);
