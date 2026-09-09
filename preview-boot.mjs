/* DEV — sobe a app com dados simulados sobre PGlite (Postgres WASM), sem DB real.
   Uso:  npm i -D @electric-sql/pglite   (uma vez)
         node --import ./preview-boot.mjs
   NÃO usar em produção. Troca node_modules/pg pelo shim PGlite (faz backup e
   restaura com `npm ci`). */
import 'dotenv/config';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// ---- aplica o shim de `pg` -> PGlite (idempotente) -----------------------
const require = createRequire(import.meta.url);
const PG_MAIN = require.resolve('pg');
const SHIM_MARK = 'DEV SHIM — PGlite';
if (!fs.readFileSync(PG_MAIN, 'utf8').includes(SHIM_MARK)) {
  if (!fs.existsSync(PG_MAIN + '.real.bak')) fs.copyFileSync(PG_MAIN, PG_MAIN + '.real.bak');
  fs.writeFileSync(PG_MAIN, `'use strict'
/* ${SHIM_MARK} — restaure com: cp "${PG_MAIN}.real.bak" "${PG_MAIN}"  (ou npm ci) */
const EventEmitter = require('events')
const { PGlite } = require('@electric-sql/pglite')
let _db = null
const db = () => (_db ||= PGlite.create({
  dataDir: process.env.PGLITE_DATA_DIR || undefined,
  parsers: { 1700: v => v == null ? v : parseFloat(v), 20: v => v == null ? v : parseInt(v, 10) },
}))
const norm = r => ({ rows: r.rows || [], rowCount: r.affectedRows != null ? r.affectedRows : (r.rows ? r.rows.length : 0), fields: r.fields || [] })
class Pool extends EventEmitter {
  async query(text, params, cb) {
    if (typeof params === 'function') { cb = params; params = undefined }
    const sql = typeof text === 'string' ? text : text.text
    const vals = params || (text && text.values) || []
    try { const out = norm(await (await db()).query(sql, vals)); if (cb) { cb(null, out); return } return out }
    catch (e) { if (cb) { cb(e); return } throw e }
  }
  async connect(cb) {
    const self = this
    const client = { query: (t, p, c) => self.query(t, p, c), release: () => {}, on: () => {} }
    if (cb) { cb(null, client, () => {}); return }
    return client
  }
  end() { return Promise.resolve() }
}
class Client extends Pool {}
module.exports = { Pool, Client, types: { setTypeParser: () => {}, getTypeParser: () => v => v, builtins: {} }, defaults: {}, Connection: class {}, escapeLiteral: s => s, escapeIdentifier: s => s }
`);
  console.log('[preview] shim de `pg` -> PGlite aplicado (backup em pg/lib/index.js.real.bak)');
}

const pgpkg = require('pg');
const bcrypt = require('bcryptjs');

const pool = new pgpkg.Pool();
const q = (sql, params) => pool.query(sql, params);

// ---- schema: roda as migrations reais (fica sempre em sincronia) ----------
const { runMigrations } = await import('./src/server/migrate.js');
await runMigrations({ silent: true });

const seeded = await q(`SELECT COUNT(*)::int AS n FROM users`);
if (seeded.rows[0].n === 0) {
  console.log('[preview] semeando dados simulados…');
  const hash = bcrypt.hashSync('demo1234', 10);
  const u = await q(
    `INSERT INTO users (email, password, cnpj, razao_social, phone, role, created_at, blocked, business_type)
     VALUES ($1,$2,$3,$4,$5,'user',$6,0,'comercio') RETURNING id`,
    ['demo@virgula.com.br', hash, '11222333000181', 'Comércio Vale Verde Ltda', '11 98888-7777', new Date().toISOString()]
  );
  const uid = u.rows[0].id;

  // ---- bancos ----
  const svg = (t, c) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='9' fill='${encodeURIComponent(c)}'/%3E%3Ctext x='20' y='27' font-family='Arial,sans-serif' font-size='19' font-weight='700' fill='white' text-anchor='middle'%3E${t}%3C/text%3E%3C/svg%3E`;
  const banks = [
    ['Itaú', 'Conta Movimento', svg('I', '#EC7000'), 1],
    ['Banco Inter', 'Reserva de Emergência', svg('i', '#FF7A00'), 1],
    ['Caixa Econômica', 'Conta antiga', svg('C', '#0064A2'), 0],
  ];
  const bankIds = {};
  for (const [name, nick, logo, active] of banks) {
    const r = await q(`INSERT INTO banks (user_id,name,account_number,nickname,logo,active,balance) VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING id`,
      [uid, name, `00${1 + Math.floor(Math.random() * 8)} / ${10000 + Math.floor(Math.random() * 89999)}-${Math.floor(Math.random() * 9)}`, nick, logo, active]);
    bankIds[name] = r.rows[0].id;
  }

  // ---- categorias (plano de contas) ----
  const cats = [
    ['Vendas de Mercadorias', 'receita', 'receita_bruta', 'variavel'],
    ['Prestação de Serviços', 'receita', 'receita_bruta', 'variavel'],
    ['Receita de Aluguel', 'receita', 'outras_receitas', 'fixa'],
    ['Rendimentos de Aplicação', 'receita', 'receita_financeira', 'variavel'],
    ['Venda de Equipamento Usado', 'receita', 'receita_nao_operacional', 'variavel'],
    ['Aporte de Sócio', 'receita', 'nao_operacional', 'variavel'],
    ['Empréstimo Bancário (entrada)', 'receita', 'nao_operacional', 'variavel'],
    ['Transferência entre Contas (Entrada)', 'receita', 'nao_operacional', 'variavel'],
    ['Compra de Mercadorias', 'despesa', 'custo_operacional', 'variavel'],
    ['Frete sobre Compras', 'despesa', 'custo_operacional', 'variavel'],
    ['Comissões sobre Vendas', 'despesa', 'despesa_com_vendas', 'variavel'],
    ['Marketing e Publicidade', 'despesa', 'despesa_com_vendas', 'variavel'],
    ['Salários e Ordenados', 'despesa', 'despesa_pessoal', 'fixa'],
    ['Pró-Labore', 'despesa', 'despesa_pessoal', 'fixa'],
    ['Encargos (FGTS, INSS)', 'despesa', 'despesa_pessoal', 'fixa'],
    ['Aluguel e Condomínio', 'despesa', 'despesa_administrativa', 'fixa'],
    ['Energia, Água e Internet', 'despesa', 'despesa_administrativa', 'fixa'],
    ['Sistemas e Softwares', 'despesa', 'despesa_administrativa', 'fixa'],
    ['Contabilidade', 'despesa', 'despesa_administrativa', 'fixa'],
    ['Combustível e Deslocamento', 'despesa', 'despesa_operacional', 'variavel'],
    ['Manutenção e Reparos', 'despesa', 'despesa_operacional', 'variavel'],
    ['Impostos sobre Vendas (DAS)', 'despesa', 'impostos', 'variavel'],
    ['Tarifas Bancárias', 'despesa', 'despesa_financeira', 'fixa'],
    ['Juros e Multas Pagos', 'despesa', 'despesa_financeira', 'variavel'],
    ['Distribuição de Lucros', 'despesa', 'nao_operacional', 'variavel'],
    ['Compra de Equipamento', 'despesa', 'nao_operacional', 'variavel'],
    ['Transferência entre Contas (Saída)', 'despesa', 'nao_operacional', 'variavel'],
  ];
  const catId = {};
  for (const [name, type, group, beh] of cats) {
    const r = await q(`INSERT INTO categories (user_id,name,type,group_type,behavior_type,affects_dre,affects_cashflow) VALUES ($1,$2,$3,$4,$5,true,true) RETURNING id`,
      [uid, name, type, group, beh]);
    catId[name] = r.rows[0].id;
  }

  // ---- transações: jun, jul, ago, set/2026 ----
  const tx = [];
  const push = (date, desc, value, type, cat, bank, reconciled = 1, accrual = null) =>
    tx.push([uid, date, desc, value, type, catId[cat], bankIds[bank], reconciled, accrual]);
  const rnd = (base, spread) => Math.round((base + (Math.random() - 0.5) * spread) * 100) / 100;
  const minusDays = (dateStr, n) => new Date(Date.parse(dateStr) - n * 86400000).toISOString().slice(0, 10);

  const OP = 'Itaú';           // conta operacional principal
  const RES = 'Banco Inter';   // reserva
  const TODAY = 22;             // "hoje" ~ meados de set/2026 — não gera lançamento futuro no mês corrente
  // capital de constituição
  push('2024-10-05', 'Integralização de capital dos sócios', 34200, 'credito', 'Aporte de Sócio', OP);
  push('2024-10-05', 'Integralização de capital dos sócios', 11500, 'credito', 'Aporte de Sócio', RES);
  // 24 meses de histórico: out/2024 → set/2026 (mês corrente parcial), com
  // tendência de alta + sazonalidade (dez forte, jan/fev fracos).
  const SEAS = [0.86, 0.80, 1.02, 0.98, 1.06, 1.12, 0.90, 0.84, 1.08, 1.16, 1.14, 1.34];
  const months = [];
  for (let ym = 2024 * 12 + 9; ym <= 2026 * 12 + 8; ym++) {
    const y = Math.floor(ym / 12), m = (ym % 12) + 1;
    const t = ym - (2024 * 12 + 9); // 0..23
    const growth = Math.round((0.62 + t * 0.021 + (Math.random() - 0.5) * 0.07) * SEAS[m - 1] * 1000) / 1000;
    months.push({ y, m, growth });
  }
  for (const { y, m, growth } of months) {
    const M = String(m).padStart(2, '0');
    const partial = (y === 2026 && m === 9);
    const dim = new Date(y, m, 0).getDate();                 // dias no mês (clampa 30/31 em fev)
    const d = (day) => `${y}-${M}-${String(Math.min(day, dim)).padStart(2, '0')}`;
    const push2 = (day, ...rest) => { if (!(partial && Math.min(day, dim) > TODAY)) push(d(day), ...rest); };
    // recebe com competência = venda alguns dias antes (gera PMR ~22-30 dias)
    const pushRecebe = (day, desc, val, cat, prazo) => { if (!(partial && Math.min(day, dim) > TODAY)) push(d(day), desc, val, 'credito', cat, OP, 1, minusDays(d(day), prazo)); };
    // paga com competência = compra alguns dias antes (gera PMP ~28-38 dias)
    const pushPaga = (day, desc, val, cat, prazo) => { if (!(partial && Math.min(day, dim) > TODAY)) push(d(day), desc, val, 'debito', cat, OP, 1, minusDays(d(day), prazo)); };
    // receitas
    for (let i = 0; i < 7; i++) pushRecebe(3 + i * 3, `Venda no PDV — lote #${m}${1000 + i}`, rnd(7300 * growth, 1400), 'Vendas de Mercadorias', Math.round(rnd(24, 12)));
    pushRecebe(10, 'NF-e serviço — contrato mensal', rnd(10200 * growth, 900), 'Prestação de Serviços', Math.round(rnd(30, 8)));
    pushRecebe(21, 'NF-e serviço — projeto pontual', rnd(4600 * growth, 700), 'Prestação de Serviços', Math.round(rnd(35, 14)));
    push2(5, 'Aluguel da sala 2 (recebido)', 1200, 'credito', 'Receita de Aluguel', OP);
    push2(28, 'Rendimento do CDB', rnd(300 * growth, 60), 'credito', 'Rendimentos de Aplicação', RES);
    // custos
    pushPaga(6, 'Fornecedor Atacado — reposição de estoque', rnd(13200 * growth, 1600), 'Compra de Mercadorias', Math.round(rnd(33, 12)));
    pushPaga(17, 'Distribuidora — pedido complementar', rnd(6400 * growth, 1000), 'Compra de Mercadorias', Math.round(rnd(30, 10)));
    push2(6, 'Transportadora — frete sobre compras', rnd(600, 120), 'debito', 'Frete sobre Compras', OP);
    // despesas com vendas
    push2(30, 'Comissão dos vendedores', rnd(1850 * growth, 300), 'debito', 'Comissões sobre Vendas', OP);
    push2(12, 'Tráfego pago + criação de anúncios', rnd(1300, 250), 'debito', 'Marketing e Publicidade', OP);
    // pessoal
    push2(5, 'Folha de pagamento', 9200, 'debito', 'Salários e Ordenados', OP);
    push2(5, 'Pró-labore dos sócios', 5000, 'debito', 'Pró-Labore', OP);
    push2(7, 'FGTS + INSS', 2650, 'debito', 'Encargos (FGTS, INSS)', OP);
    // administrativas
    push2(10, 'Aluguel da loja + condomínio', 3500, 'debito', 'Aluguel e Condomínio', OP);
    push2(15, 'Energia + internet + água', rnd(910, 160), 'debito', 'Energia, Água e Internet', OP);
    push2(2, 'Assinaturas (ERP, e-mail, nuvem)', 430, 'debito', 'Sistemas e Softwares', OP);
    push2(10, 'Honorários contábeis', 690, 'debito', 'Contabilidade', OP);
    // gerais
    push2(18, 'Combustível + deslocamentos', rnd(540, 180), 'debito', 'Combustível e Deslocamento', OP);
    if (m % 2 === 0) push2(23, 'Manutenção do ar-condicionado', rnd(460, 180), 'debito', 'Manutenção e Reparos', OP);
    // impostos
    push2(20, 'DAS — Simples Nacional', rnd(4550 * growth, 400), 'debito', 'Impostos sobre Vendas (DAS)', OP);
    // financeiras
    push2(1, 'Tarifas de conta + taxa da maquininha', rnd(370, 80), 'debito', 'Tarifas Bancárias', OP);
    if (m === 7) push2(14, 'Juros do cheque especial', 210, 'debito', 'Juros e Multas Pagos', OP);
  }
  // não operacionais / patrimoniais
  push('2026-06-12', 'Aporte de capital — sócio', 15000, 'credito', 'Aporte de Sócio', RES);
  push('2026-08-25', 'Distribuição de lucros aos sócios', 9000, 'debito', 'Distribuição de Lucros', OP);
  push('2026-07-04', 'Compra de balcão refrigerado', 5400, 'debito', 'Compra de Equipamento', RES);
  push('2026-07-04', 'Venda do balcão antigo (usado)', 1500, 'credito', 'Venda de Equipamento Usado', OP);
  push('2026-08-14', 'Transferência para a reserva', 5000, 'debito', 'Transferência entre Contas (Saída)', OP);
  push('2026-08-14', 'Transferência recebida da conta movimento', 5000, 'credito', 'Transferência entre Contas (Entrada)', RES);

  for (const row of tx) {
    await q(`INSERT INTO transactions (user_id,date,description,value,type,category_id,bank_id,reconciled,accrual_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, row);
  }
  // ajusta saldos dos bancos a partir das transações
  await q(`UPDATE banks b SET balance = COALESCE((SELECT SUM(CASE WHEN t.type='credito' THEN t.value ELSE -t.value END) FROM transactions t WHERE t.bank_id=b.id),0) WHERE b.user_id=$1`, [uid]);

  // ---- previsões (mês corrente) ----
  const fc = [
    ['2026-09-05', 'Folha de pagamento', 9200, 'debito', 'Salários e Ordenados', 1],
    ['2026-09-10', 'Aluguel da loja + condomínio', 3500, 'debito', 'Aluguel e Condomínio', 0],
    ['2026-09-11', 'Vendas da semana (previsão)', 14500, 'credito', 'Vendas de Mercadorias', 0],
    ['2026-09-12', 'NF-e serviço — contrato mensal', 8800, 'credito', 'Prestação de Serviços', 0],
    ['2026-09-15', 'Fornecedor — reposição de estoque', 12000, 'debito', 'Compra de Mercadorias', 0],
    ['2026-09-18', 'Vendas da semana (previsão)', 13800, 'credito', 'Vendas de Mercadorias', 0],
    ['2026-09-20', 'DAS — Simples Nacional', 4400, 'debito', 'Impostos sobre Vendas (DAS)', 0],
    ['2026-09-25', 'Comissão dos vendedores', 2200, 'debito', 'Comissões sobre Vendas', 0],
    ['2026-09-26', 'Vendas da semana (previsão)', 12600, 'credito', 'Vendas de Mercadorias', 0],
    ['2026-09-28', 'Rendimento do CDB', 340, 'credito', 'Rendimentos de Aplicação', 0],
    // meses futuros — alimentam o Forecast (previsão > projeção estatística)
    ['2026-10-10', 'NF-e serviço — contrato anual fechado', 12000, 'credito', 'Prestação de Serviços', 0],
    ['2026-10-15', 'Fornecedor — pedido grande de fim de ano', 22000, 'debito', 'Compra de Mercadorias', 0],
    ['2026-11-20', 'Compra de equipamento (planejada)', 9000, 'debito', 'Compra de Equipamento', 0],
    ['2026-12-18', '13º salário', 9200, 'debito', 'Salários e Ordenados', 0],
    ['2026-12-20', 'Distribuição de lucros (planejada)', 12000, 'debito', 'Distribuição de Lucros', 0],
  ];
  for (const [date, desc, value, type, cat, realized] of fc) {
    await q(`INSERT INTO forecasts (user_id,date,description,value,type,category_id,bank_id,realized) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [uid, date, desc, value, type, catId[cat], bankIds['Itaú'], realized]);
  }

  // ---- ofx imports (só metadados p/ a tela) ----
  await q(`INSERT INTO ofx_imports (user_id,file_name,import_date,bank_id,transaction_count,content) VALUES ($1,$2,$3,$4,$5,'')`,
    [uid, 'extrato_itau_ago2026.ofx', '2026-09-01T10:12:00Z', bankIds['Itaú'], 34]);
  await q(`INSERT INTO ofx_imports (user_id,file_name,import_date,bank_id,transaction_count,content) VALUES ($1,$2,$3,$4,$5,'')`,
    [uid, 'extrato_inter_ago2026.ofx', '2026-09-01T10:14:00Z', bankIds['Banco Inter'], 12]);

  // ---- orçamento 2026 (área Planejamento / Orçado × Realizado) ----
  const bud = await q(`INSERT INTO budgets (user_id, year, name) VALUES ($1, 2026, 'Orçamento 2026') RETURNING id`, [uid]);
  const budId = bud.rows[0].id;
  const budLines = [
    ['Vendas de Mercadorias', 'receita', 'receita_bruta', 51000],
    ['Prestação de Serviços', 'receita', 'receita_bruta', 14500],
    ['Compra de Mercadorias', 'despesa', 'custo_operacional', 18500],
    ['Salários e Ordenados', 'despesa', 'despesa_pessoal', 9200],
    ['Pró-Labore', 'despesa', 'despesa_pessoal', 5000],
    ['Aluguel e Condomínio', 'despesa', 'despesa_administrativa', 3500],
    ['Impostos sobre Vendas (DAS)', 'despesa', 'impostos', 4200],
    ['Marketing e Publicidade', 'despesa', 'despesa_com_vendas', 1300],
    ['Comissões sobre Vendas', 'despesa', 'despesa_com_vendas', 1900],
    ['Encargos (FGTS, INSS)', 'despesa', 'despesa_pessoal', 2650],
    ['Energia, Água e Internet', 'despesa', 'despesa_administrativa', 900],
  ];
  for (const [name, kind, grp, base] of budLines) {
    for (let mo = 1; mo <= 12; mo++) {
      const seas = kind === 'receita' ? SEAS[mo - 1] : (0.97 + mo * 0.005);
      const v = Math.round(base * seas * 100) / 100;
      await q(`INSERT INTO budget_items (budget_id, user_id, month, category_id, group_type, kind, amount) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [budId, uid, mo, catId[name], grp, kind, v]);
    }
  }

  const n = await q(`SELECT COUNT(*)::int AS n FROM transactions`);
  console.log(`[preview] pronto — ${n.rows[0].n} lançamentos. Login: demo@virgula.com.br / demo1234`);
}

// sobe a app
await import('./server.js');
