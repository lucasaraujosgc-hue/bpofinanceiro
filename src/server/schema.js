import { pool, ensureColumn } from './db.js';

// --- DATA SEEDS ---
export const INITIAL_BANKS_SEED = [
  { name: 'Nubank', logo: '/logo/nubank.jpg' },
  { name: 'Itaú', logo: '/logo/itau.png' },
  { name: 'Bradesco', logo: '/logo/bradesco.jpg' },
  { name: 'Caixa Econômica', logo: '/logo/caixa.png' },
  { name: 'Banco do Brasil', logo: '/logo/bb.png' },
  { name: 'Santander', logo: '/logo/santander.png' },
  { name: 'Inter', logo: '/logo/inter.png' },
  { name: 'BTG Pactual', logo: '/logo/btg_pactual.png' },
  { name: 'C6 Bank', logo: '/logo/c6_bank.png' },
  { name: 'Sicredi', logo: '/logo/sicredi.png' },
  { name: 'Sicoob', logo: '/logo/sicoob.png' },
  { name: 'Mercado Pago', logo: '/logo/mercado_pago.png' },
  { name: 'PagBank', logo: '/logo/pagbank.png' },
  { name: 'Stone', logo: '/logo/stone.png' },
  { name: 'Banco Safra', logo: '/logo/safra.png' },
  { name: 'Banco Pan', logo: '/logo/banco_pan.png' },
  { name: 'Banrisul', logo: '/logo/banrisul.png' },
  { name: 'Neon', logo: '/logo/neon.png' },
  { name: 'Caixa Registradora', logo: '/logo/caixaf.png' },
];

export const INITIAL_CATEGORIES_SEED = [
  // ---- Receitas -------------------------------------------------------
  { name: 'Vendas de Mercadorias', type: 'receita', group: 'receita_bruta', behavior: 'variavel' },
  { name: 'Prestação de Serviços', type: 'receita', group: 'receita_bruta', behavior: 'variavel' },
  { name: 'Comissões Recebidas', type: 'receita', group: 'receita_bruta', behavior: 'variavel' },
  { name: 'Receita de Aluguel', type: 'receita', group: 'outras_receitas', behavior: 'fixa' },
  { name: 'Outras Receitas Operacionais', type: 'receita', group: 'outras_receitas', behavior: 'variavel' },
  { name: 'Reembolsos de Clientes', type: 'receita', group: 'outras_receitas', behavior: 'variavel' },
  { name: 'Receitas Financeiras (juros, rendimentos)', type: 'receita', group: 'receita_financeira', behavior: 'variavel' },
  { name: 'Venda de Ativo Imobilizado', type: 'receita', group: 'receita_nao_operacional', behavior: 'variavel' },
  { name: 'Aportes de Sócios / Investimentos', type: 'receita', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Empréstimos Recebidos', type: 'receita', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Transferências entre Contas (Entrada)', type: 'receita', group: 'nao_operacional', behavior: 'variavel' },
  // ---- Custos (CMV / CPV / CSP) --------------------------------------
  { name: 'Compra de Mercadorias', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  { name: 'Custos de Serviços Prestados', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  { name: 'Insumos e Matéria-Prima', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  { name: 'Frete sobre Compras', type: 'despesa', group: 'custo_operacional', behavior: 'variavel' },
  // ---- Despesas com Vendas -----------------------------------------
  { name: 'Comissões sobre Vendas', type: 'despesa', group: 'despesa_com_vendas', behavior: 'variavel' },
  { name: 'Marketing e Publicidade', type: 'despesa', group: 'despesa_com_vendas', behavior: 'variavel' },
  { name: 'Frete sobre Vendas', type: 'despesa', group: 'despesa_com_vendas', behavior: 'variavel' },
  // ---- Despesas com Pessoal ---------------------------------------
  { name: 'Salários e Ordenados', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  { name: 'Pró-Labore', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  { name: 'Encargos (FGTS, INSS, IRRF)', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  { name: 'Benefícios (VT, VR, Plano de Saúde)', type: 'despesa', group: 'despesa_pessoal', behavior: 'fixa' },
  // ---- Despesas Administrativas ----------------------------------
  { name: 'Aluguel e Condomínio', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Energia, Água e Internet', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Material de Escritório e Limpeza', type: 'despesa', group: 'despesa_administrativa', behavior: 'variavel' },
  { name: 'Seguros', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Sistemas e Softwares (assinaturas)', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  { name: 'Serviços de Terceiros (Contabilidade, Jurídico)', type: 'despesa', group: 'despesa_administrativa', behavior: 'fixa' },
  // ---- Despesas Gerais / Operacionais ---------------------------
  { name: 'Combustível e Deslocamento', type: 'despesa', group: 'despesa_operacional', behavior: 'variavel' },
  { name: 'Manutenção e Reparos', type: 'despesa', group: 'despesa_operacional', behavior: 'variavel' },
  // ---- Deduções e Tributos -------------------------------------
  { name: 'Impostos sobre Vendas (DAS, ISS, ICMS, PIS/COFINS)', type: 'despesa', group: 'impostos', behavior: 'variavel' },
  { name: 'IRPJ e CSLL', type: 'despesa', group: 'impostos_sobre_lucro', behavior: 'variavel' },
  // ---- Resultado Financeiro -----------------------------------
  { name: 'Tarifas Bancárias', type: 'despesa', group: 'despesa_financeira', behavior: 'fixa' },
  { name: 'Juros e Multas Pagos', type: 'despesa', group: 'despesa_financeira', behavior: 'variavel' },
  // ---- Não operacional / patrimonial (fora do DRE) ------------
  { name: 'Distribuição de Lucros', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Pagamento de Empréstimos', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Compra de Ativo Imobilizado', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' },
  { name: 'Transferências entre Contas (Saída)', type: 'despesa', group: 'nao_operacional', behavior: 'variavel' }
];

// Cria/atualiza o schema no boot. O ideal seria migrations versionadas
// (ver SECURITY_AUDIT.md §10); por ora replica o db_init histórico.
export const initSchema = async () => {
  try {
      await pool.query(`CREATE TABLE IF NOT EXISTS global_banks (id SERIAL PRIMARY KEY, name TEXT, logo TEXT)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE, password TEXT, cnpj TEXT, razao_social TEXT, phone TEXT, reset_token TEXT, reset_token_expires BIGINT, role TEXT DEFAULT 'user', created_at TEXT, blocked INT DEFAULT 0)`);
      await ensureColumn('users', 'role', "TEXT DEFAULT 'user'");
      await ensureColumn('users', 'created_at', "TEXT");
      await ensureColumn('users', 'blocked', "INT DEFAULT 0");
      await ensureColumn('users', 'business_type', "TEXT DEFAULT 'servico'");

      await pool.query(`CREATE TABLE IF NOT EXISTS pending_signups (email TEXT PRIMARY KEY, token TEXT, cnpj TEXT, razao_social TEXT, phone TEXT, created_at BIGINT)`);
      await ensureColumn('pending_signups', 'business_type', "TEXT DEFAULT 'servico'");
      await pool.query(`CREATE TABLE IF NOT EXISTS banks (id SERIAL PRIMARY KEY, user_id INT, name TEXT, account_number TEXT, nickname TEXT, logo TEXT, active INT DEFAULT 1, balance NUMERIC(15,2) DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS credit_cards (id SERIAL PRIMARY KEY, user_id INT, bank_id INT, name TEXT, closing_day INT, due_day INT, limit_value NUMERIC(15,2), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(bank_id) REFERENCES banks(id))`);
      
      await pool.query(`CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, user_id INT, name TEXT, type TEXT, group_type TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
      await ensureColumn('categories', 'group_type', 'TEXT');
      await ensureColumn('categories', 'main_group', 'TEXT');
      await ensureColumn('categories', 'sub_group', 'TEXT');
      await ensureColumn('categories', 'nature', 'TEXT');
      await ensureColumn('categories', 'affects_dre', 'BOOLEAN DEFAULT true');
      await ensureColumn('categories', 'affects_cashflow', 'BOOLEAN DEFAULT true');
      await ensureColumn('categories', 'affects_balance', 'BOOLEAN DEFAULT false');
      await ensureColumn('categories', 'cost_classification', 'TEXT');
      await ensureColumn('categories', 'behavior_type', 'TEXT');

      await ensureColumn('users', 'business_type', "TEXT DEFAULT 'servico'");

      await pool.query(`CREATE TABLE IF NOT EXISTS ofx_imports (id SERIAL PRIMARY KEY, user_id INT, file_name TEXT, import_date TEXT, bank_id INT, transaction_count INT, content TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
      
      await pool.query(`CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, user_id INT, date TEXT, description TEXT, value NUMERIC(15,2), type TEXT, category_id INT, bank_id INT, credit_card_id INT, reconciled INT, ofx_import_id INT, FOREIGN KEY(user_id) REFERENCES users(id))`);
      await ensureColumn('transactions', 'credit_card_id', 'INT');

      await pool.query(`CREATE TABLE IF NOT EXISTS forecasts (id SERIAL PRIMARY KEY, user_id INT, date TEXT, description TEXT, value NUMERIC(15,2), type TEXT, category_id INT, bank_id INT, credit_card_id INT, realized INT, installment_current INT, installment_total INT, group_id TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
      await ensureColumn('forecasts', 'credit_card_id', 'INT');

      await pool.query(`CREATE TABLE IF NOT EXISTS keyword_rules (id SERIAL PRIMARY KEY, user_id INT, keyword TEXT, type TEXT, category_id INT, bank_id INT, FOREIGN KEY(user_id) REFERENCES users(id))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, user_id TEXT, action TEXT, details TEXT, ip_address TEXT, created_at TEXT)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS integration_settings (user_id INT PRIMARY KEY, token TEXT, start_date TEXT, target_type TEXT, category_in_id INT, category_out_id INT, total_imported INT DEFAULT 0, last_sync TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
      await ensureColumn('integration_settings', 'bank_in_id', 'INT');
      await ensureColumn('integration_settings', 'bank_out_id', 'INT');

      // Integração Pluggy foi removida — limpa a tabela órfã se existir.
      await pool.query(`DROP TABLE IF EXISTS pluggy_connections`);

      // Automate Indexes Creation
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_bank ON transactions(bank_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_forecasts_user_date ON forecasts(user_id, date)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_keyword_rules_user ON keyword_rules(user_id)`);
      console.log("Database tables and indexes verified.");

      // Seed Bancos Globais
      const { rows } = await pool.query("SELECT COUNT(*) as count FROM global_banks");
      if (rows && rows.length > 0 && Number(rows[0].count) === 0) {
          for (const b of INITIAL_BANKS_SEED) {
              await pool.query("INSERT INTO global_banks (name, logo) VALUES ($1, $2)", [b.name, b.logo]);
          }
      }
  } catch(e) {
      console.error("Database initialization error:", e.message);
  }
};
