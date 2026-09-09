-- 0001_baseline — schema completo (idempotente).
--
-- Reproduz exatamente o que o antigo db_init()/initSchema() criava no boot,
-- para poder ser "aplicada" tanto num banco vazio quanto num banco de produção
-- que já tem todas as tabelas (por isso IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- em tudo). As migrations seguintes (0002+) são normais.

CREATE TABLE IF NOT EXISTS global_banks (
    id SERIAL PRIMARY KEY,
    name TEXT,
    logo TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    cnpj TEXT,
    razao_social TEXT,
    phone TEXT,
    reset_token TEXT,
    reset_token_expires BIGINT,
    role TEXT DEFAULT 'user',
    created_at TEXT,
    blocked INT DEFAULT 0,
    business_type TEXT DEFAULT 'servico'
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'servico';

CREATE TABLE IF NOT EXISTS pending_signups (
    email TEXT PRIMARY KEY,
    token TEXT,
    cnpj TEXT,
    razao_social TEXT,
    phone TEXT,
    created_at BIGINT,
    business_type TEXT DEFAULT 'servico'
);
ALTER TABLE pending_signups ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'servico';

CREATE TABLE IF NOT EXISTS banks (
    id SERIAL PRIMARY KEY,
    user_id INT,
    name TEXT,
    account_number TEXT,
    nickname TEXT,
    logo TEXT,
    active INT DEFAULT 1,
    balance NUMERIC(15,2) DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS credit_cards (
    id SERIAL PRIMARY KEY,
    user_id INT,
    bank_id INT,
    name TEXT,
    closing_day INT,
    due_day INT,
    limit_value NUMERIC(15,2),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(bank_id) REFERENCES banks(id)
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    user_id INT,
    name TEXT,
    type TEXT,
    group_type TEXT,
    main_group TEXT,
    sub_group TEXT,
    nature TEXT,
    affects_dre BOOLEAN DEFAULT true,
    affects_cashflow BOOLEAN DEFAULT true,
    affects_balance BOOLEAN DEFAULT false,
    cost_classification TEXT,
    behavior_type TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_type TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS main_group TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sub_group TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS nature TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS affects_dre BOOLEAN DEFAULT true;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS affects_cashflow BOOLEAN DEFAULT true;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS affects_balance BOOLEAN DEFAULT false;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS cost_classification TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS behavior_type TEXT;

CREATE TABLE IF NOT EXISTS ofx_imports (
    id SERIAL PRIMARY KEY,
    user_id INT,
    file_name TEXT,
    import_date TEXT,
    bank_id INT,
    transaction_count INT,
    content TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INT,
    date TEXT,
    description TEXT,
    value NUMERIC(15,2),
    type TEXT,
    category_id INT,
    bank_id INT,
    credit_card_id INT,
    reconciled INT,
    ofx_import_id INT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS credit_card_id INT;

CREATE TABLE IF NOT EXISTS forecasts (
    id SERIAL PRIMARY KEY,
    user_id INT,
    date TEXT,
    description TEXT,
    value NUMERIC(15,2),
    type TEXT,
    category_id INT,
    bank_id INT,
    credit_card_id INT,
    realized INT,
    installment_current INT,
    installment_total INT,
    group_id TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS credit_card_id INT;

CREATE TABLE IF NOT EXISTS keyword_rules (
    id SERIAL PRIMARY KEY,
    user_id INT,
    keyword TEXT,
    type TEXT,
    category_id INT,
    bank_id INT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    action TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    email TEXT,
    refresh_hash TEXT NOT NULL UNIQUE,
    previous_refresh_hash TEXT,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_prev ON auth_sessions(previous_refresh_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS integration_settings (
    user_id INT PRIMARY KEY,
    token TEXT,
    start_date TEXT,
    target_type TEXT,
    category_in_id INT,
    category_out_id INT,
    total_imported INT DEFAULT 0,
    last_sync TEXT,
    bank_in_id INT,
    bank_out_id INT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS bank_in_id INT;
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS bank_out_id INT;

-- Integração Pluggy foi removida — limpa a tabela órfã se ainda existir.
DROP TABLE IF EXISTS pluggy_connections;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_bank ON transactions(bank_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_user_date ON forecasts(user_id, date);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rules_user ON keyword_rules(user_id);

-- Seed de bancos globais — só quando a tabela está vazia (banco novo).
INSERT INTO global_banks (name, logo)
SELECT v.name, v.logo FROM (VALUES
    ('Nubank', '/logo/nubank.jpg'),
    ('Itaú', '/logo/itau.png'),
    ('Bradesco', '/logo/bradesco.jpg'),
    ('Caixa Econômica', '/logo/caixa.png'),
    ('Banco do Brasil', '/logo/bb.png'),
    ('Santander', '/logo/santander.png'),
    ('Inter', '/logo/inter.png'),
    ('BTG Pactual', '/logo/btg_pactual.png'),
    ('C6 Bank', '/logo/c6_bank.png'),
    ('Sicredi', '/logo/sicredi.png'),
    ('Sicoob', '/logo/sicoob.png'),
    ('Mercado Pago', '/logo/mercado_pago.png'),
    ('PagBank', '/logo/pagbank.png'),
    ('Stone', '/logo/stone.png'),
    ('Banco Safra', '/logo/safra.png'),
    ('Banco Pan', '/logo/banco_pan.png'),
    ('Banrisul', '/logo/banrisul.png'),
    ('Neon', '/logo/neon.png'),
    ('Caixa Registradora', '/logo/caixaf.png')
) AS v(name, logo)
WHERE NOT EXISTS (SELECT 1 FROM global_banks);
