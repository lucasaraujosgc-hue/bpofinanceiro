import 'dotenv/config';
import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

const { Pool, types } = pkg;
types.setTypeParser(1700, function(val) {
  return parseFloat(val);
});


// --- CONFIGURAÇÃO DE SEGURANÇA E AMBIENTE ---
const IS_PROD = process.env.NODE_ENV === 'production';

// Em produção os segredos são OBRIGATÓRIOS: o boot aborta se faltarem.
// Em dev, cai para um valor efêmero (com aviso) para não travar o setup local.
function requireSecret(name) {
    const raw = (process.env[name] || '').trim();
    if (!raw) {
        if (IS_PROD) {
            console.error(`FATAL: variável de ambiente ${name} é obrigatória em produção.`);
            process.exit(1);
        }
        console.warn(`⚠️  ${name} não definida — usando valor efêmero (apenas dev; dados cifrados NÃO sobrevivem a restart).`);
        return null;
    }
    return raw;
}

const JWT_SECRET = requireSecret('JWT_SECRET') || crypto.randomBytes(64).toString('hex');


// Credenciais de Admin
const ADMIN_EMAIL = (process.env.MAIL_ADMIN || process.env.EMAIL_ADMIN || '').trim();
const ADMIN_PASSWORD = (process.env.PASSWORD_ADMIN || '').trim();

if (!ADMIN_EMAIL) console.warn("⚠️  Admin Email não configurado (.env)");

// Criptografia para dados sensíveis (LGPD)
let keyBuffer;
const rawEncryptionKey = requireSecret('ENCRYPTION_KEY');
if (!rawEncryptionKey) {
    keyBuffer = crypto.randomBytes(32);
} else if (/^[0-9a-fA-F]{64}$/.test(rawEncryptionKey)) {
    keyBuffer = Buffer.from(rawEncryptionKey, 'hex');
} else {
    console.warn('⚠️  ENCRYPTION_KEY não está em hex de 32 bytes (64 chars). Derivando via sha256. '
        + 'Recomendado: ENCRYPTION_KEY = $(openssl rand -hex 32), chave dedicada e distinta do JWT_SECRET. '
        + 'Trocar a chave depois torna ilegíveis os dados já cifrados.');
    keyBuffer = crypto.createHash('sha256').update(String(rawEncryptionKey)).digest();
}
if (rawEncryptionKey && rawEncryptionKey === (process.env.JWT_SECRET || '').trim()) {
    console.warn('⚠️  ENCRYPTION_KEY == JWT_SECRET. Use segredos distintos e dedicados.');
}
const ENCRYPTION_KEY = keyBuffer;
const GCM_IV_LEN = 12;

// Formato novo:  v2:<iv hex>:<authTag hex>:<ciphertext hex>   (AES-256-GCM, autenticado)
// Formato legado: <iv hex>:<ciphertext hex>                   (AES-256-CBC, ainda lido)
function encrypt(text) {
    if (text === null || text === undefined || text === '') return text;
    try {
        const iv = crypto.randomBytes(GCM_IV_LEN);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
    } catch (e) {
        console.error('encrypt error:', e.message);
        return null;
    }
}

function decrypt(text) {
    if (text === null || text === undefined || text === '') return text;
    if (typeof text !== 'string' || !text.includes(':')) return text; // valor em texto plano (legado)
    try {
        if (text.startsWith('v2:')) {
            const [, ivHex, tagHex, ctHex] = text.split(':');
            const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
            decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
            return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
        }
        // legado: AES-256-CBC, formato iv:ct
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const ct = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch (e) {
        // Não vaza o ciphertext de volta para o cliente.
        console.warn('decrypt: valor não pôde ser decifrado — retornando null');
        return null;
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_LOGO_DIR = path.join(__dirname, 'logo');
if (!fs.existsSync(LOCAL_LOGO_DIR)) fs.mkdirSync(LOCAL_LOGO_DIR, { recursive: true });

// 'vite' só é carregado no modo dev (import dinâmico em startServer) — em
// produção o server serve dist/ estático e não deve depender de devDependencies.

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
// CSP: só em produção (o dev server do Vite usa inline script + eval).
// O SPA buildado carrega JS/CSS próprios; fontes vêm do Google Fonts;
// favicon e logos podem ser data: URIs; recharts usa style="" inline.
app.use(helmet({
    contentSecurityPolicy: IS_PROD ? {
        useDefaults: true,
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'"],
            'object-src': ["'none'"],
            'frame-ancestors': ["'self'"],
        },
    } : false,
    crossOriginEmbedderPolicy: false,
}));

// CORS: allowlist explícita via CORS_ORIGINS (lista separada por vírgula).
// Sem a env: em produção nega qualquer Origin cross-site; em dev libera geral.
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin(origin, cb) {
        if (!origin) return cb(null, true);              // apps nativas / curl / same-origin
        if (!IS_PROD && corsOrigins.length === 0) return cb(null, true);
        return cb(null, corsOrigins.includes(origin));
    },
}));
app.use(express.json({ limit: '10mb' }));

// URL base da aplicação para montar links de e-mail (reset de senha, ativação).
// NUNCA usar req.get('host') — o cliente controla o header Host (poisoning).
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
if (IS_PROD && !APP_URL && corsOrigins.length === 0) {
    console.warn('⚠️  APP_URL não definida — links de e-mail vão usar o header Host (inseguro).');
}
const appBaseUrl = (req) => APP_URL || corsOrigins[0] || `${req.protocol}://${req.get('host')}`;

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente mais tarde." },
});
app.use('/api/', apiLimiter);

// Limites mais apertados nos endpoints sensíveis (brute force / bombardeio de e-mail).
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
});
const flowLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 15,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas solicitações. Tente novamente mais tarde." },
});
app.use('/api/login', loginLimiter);
app.use(['/api/recover-password', '/api/reset-password-confirm'], loginLimiter);
app.use(['/api/request-signup', '/api/complete-signup', '/api/validate-signup-token'], flowLimiter);

// --- DATABASE SETUP ---
const PERSISTENT_LOGO_DIR = fs.existsSync('/backup') ? '/backup/logos' : './backup/logos';
if (!fs.existsSync(PERSISTENT_LOGO_DIR)) fs.mkdirSync(PERSISTENT_LOGO_DIR, { recursive: true });

// Grava um logo enviado como data URI. Só bitmap (SVG seria XSS armazenado),
// valida magic bytes, cap de 512 KB, nome 100% aleatório. Retorna /logo/<nome>
// ou null se inválido.
const LOGO_MAGIC = {
    png: [0x89, 0x50, 0x4e, 0x47],
    jpg: [0xff, 0xd8, 0xff],
    webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" (+ "WEBP" no offset 8)
};
function saveBankLogo(logoData) {
    if (typeof logoData !== 'string') return null;
    const m = logoData.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return null;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    let buf;
    try { buf = Buffer.from(m[2], 'base64'); } catch { return null; }
    if (buf.length === 0 || buf.length > 512 * 1024) return null;
    const magic = LOGO_MAGIC[ext];
    if (!magic.every((b, i) => buf[i] === b)) return null;
    if (ext === 'webp' && buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const fileName = `bank_${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(PERSISTENT_LOGO_DIR, fileName), buf);
    return `/logo/${fileName}`;
}

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error("Unexpected error on Postgres idle client", err.stack);
});
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error("Database connection problem:", err.message);
    else console.log("Database connected to Postgres.");
});

// Postgres mock for SQLite db interface to minimize file rewrites
const db = {
  _convertQuery: function(sql) {
    let i = 1;
    let converted = sql.replace(/\?/g, () => '$' + (i++));
    converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    converted = converted.replace(/\bINTEGER\b/g, 'INT');
    converted = converted.replace(/\bREAL\b/g, 'NUMERIC(15,2)');
    return converted;
  },
  run: function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    let pgSql = this._convertQuery(sql);
    let isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING') && !pgSql.includes('pending_signups')) {
        pgSql += ' RETURNING id';
    }

    pool.query(pgSql, params || [])
      .then(res => {
         let context = { changes: res.rowCount || 0 };
         if (isInsert && res.rows && res.rows.length > 0 && res.rows[0].id) {
             context.lastID = res.rows[0].id;
         }
         if (callback) callback.call(context, null);
      })
      .catch(err => {
         console.error("DB Run Error:", err.code || err.message, "|", pgSql.slice(0, 120));
         if (callback) callback(err);
      });
  },
  all: function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(this._convertQuery(sql), params || [])
      .then(res => callback && callback(null, res.rows))
      .catch(err => {
          console.error("DB All Error:", err.code || err.message, "|", this._convertQuery(sql).slice(0, 120));
          if(callback) callback(err, null);
      });
  },
  get: function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(this._convertQuery(sql), params || [])
      .then(res => {
         let row = res.rows[0];
         if (row && row.count !== undefined && typeof row.count === 'string') row.count = parseInt(row.count, 10);
         if (callback) callback(null, row);
      })
      .catch(err => {
         console.error("DB Get Error:", err.code || err.message, "|", this._convertQuery(sql).slice(0, 120));
         if(callback) callback(err, null);
      });
  },
  serialize: function(fn) {
    // Deprecated adapter flow, bypassed by direct BEGIN/COMMIT logic below where critical.
    fn();
  },
  prepare: function(sql) {
    let pgSql = this._convertQuery(sql);
    let isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING') && !pgSql.includes('pending_signups')) pgSql += ' RETURNING id';
    return {
      run: function(...args) { 
        let params = args;
        let callback = null;
        if(args.length > 0 && typeof args[args.length - 1] === 'function') {
             callback = params.pop();
        }
        pool.query(pgSql, params)
         .then(res => {
            let context = { changes: res.rowCount || 0 };
            if (isInsert && res.rows && res.rows.length > 0 && res.rows[0].id) context.lastID = res.rows[0].id;
            if (callback) callback.call(context, null);
         })
         .catch(err => {
            console.error("DB Prepare Error:", err.code || err.message, "|", pgSql.slice(0, 120));
            if(callback) callback(err);
         });
      },
      finalize: function(cb) { if(cb) cb(); }
    };
  }
};

const ensureColumn = async (table, column, definition) => {
    try {
        let pgDef = definition.replace(/INTEGER/g, 'INT').replace(/REAL/g, 'NUMERIC(15,2)');
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${pgDef}`);
    } catch (e) {
        console.error("Error adding column", e.message);
    }
};

// Serve Logos
app.use('/logo', (req, res, next) => {
    const persistentFile = path.join(PERSISTENT_LOGO_DIR, req.path);
    if (fs.existsSync(persistentFile)) return res.sendFile(persistentFile);
    next();
});
app.use('/logo', express.static(LOCAL_LOGO_DIR));

// Logger
function logAudit(userId, action, details, ip) {
    db.run(`INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)`,
        [String(userId), action, String(details || '').slice(0, 500), ip, new Date().toISOString()]);
}
// Identifica quem fez a ação (admin = id 0 + e-mail; usuário comum = id).
const getAuditActor = (req) => (req.user?.role === 'admin' ? `admin:${req.user.email || 0}` : String(req.userId));

// Middleware Auth
// Cache curto do status de bloqueio para não bater no banco a cada request.
const blockedCache = new Map(); // userId -> { blocked: boolean, exp: number }
const BLOCKED_TTL_MS = 30_000;

async function isUserBlocked(userId) {
    const now = Date.now();
    const hit = blockedCache.get(userId);
    if (hit && hit.exp > now) return hit.blocked;
    const { rows } = await pool.query('SELECT blocked FROM users WHERE id = $1', [userId]);
    const blocked = rows.length === 0 ? true : !!rows[0].blocked; // usuário sumido = sem acesso
    blockedCache.set(userId, { blocked, exp: now + BLOCKED_TTL_MS });
    return blocked;
}
function invalidateBlockedCache(userId) {
    blockedCache.delete(Number(userId));
    blockedCache.delete(String(userId));
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token não fornecido." });

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ error: "Sessão expirada." });
        req.user = decoded;
        req.userId = decoded.id;

        // Admin (conta única) não passa pela tabela users.
        if (decoded.role === 'admin') return next();

        try {
            if (await isUserBlocked(decoded.id)) {
                return res.status(403).json({ error: "Conta bloqueada.", blocked: true });
            }
        } catch (e) {
            console.error("Erro ao verificar bloqueio do usuário:", e.message);
            return res.status(503).json({ error: "Serviço indisponível." });
        }
        next();
    });
};

const checkAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado." });
    next();
};

// Email Setup
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_SERVER,
    port: Number(process.env.MAIL_PORT) || 587,
    secure: Number(process.env.MAIL_PORT) === 465, 
    auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
});

const sendEmail = async (to, subject, htmlContent) => {
  if (!process.env.MAIL_SERVER) return true;
  try {
      await transporter.sendMail({
          from: `"${process.env.MAIL_FROM_NAME || 'Virgula'}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME}>`,
          to, subject, html: htmlContent
      });
      return true;
  } catch (error) { return false; }
};

// --- DATA SEEDS ---
const INITIAL_BANKS_SEED = [
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

const INITIAL_CATEGORIES_SEED = [
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

// ---------------------------------------------------------------------------
// Plano de contas gerencial — fonte única da verdade.
// Cada group_type de uma categoria mapeia para uma linha do DRE.
// `dre: null` => movimento patrimonial/interno: NÃO entra no DRE.
// ---------------------------------------------------------------------------
const ACCOUNTING_GROUPS = {
  // receitas
  receita_bruta:            { type: 'receita', label: 'Receita Bruta',                       dre: 'receita_bruta' },
  outras_receitas:          { type: 'receita', label: 'Outras Receitas Operacionais',        dre: 'outras_receitas_op' },
  receita_financeira:       { type: 'receita', label: 'Receitas Financeiras',                dre: 'receita_financeira' },
  receita_nao_operacional:  { type: 'receita', label: 'Receitas Não Operacionais',           dre: 'receita_nao_op' },
  // despesas
  impostos:                 { type: 'despesa', label: 'Impostos sobre Vendas',               dre: 'deducoes' },
  custo_operacional:        { type: 'despesa', label: 'Custos (CMV / CPV / CSP)',             dre: 'cmv' },
  despesa_com_vendas:       { type: 'despesa', label: 'Despesas com Vendas',                 dre: 'desp_vendas' },
  despesa_pessoal:          { type: 'despesa', label: 'Despesas com Pessoal',                dre: 'desp_pessoal' },
  despesa_administrativa:   { type: 'despesa', label: 'Despesas Administrativas',            dre: 'desp_admin' },
  despesa_operacional:      { type: 'despesa', label: 'Despesas Gerais e Operacionais',      dre: 'desp_gerais' },
  despesa_financeira:       { type: 'despesa', label: 'Despesas Financeiras',                dre: 'despesa_financeira' },
  despesa_nao_operacional:  { type: 'despesa', label: 'Despesas Não Operacionais',           dre: 'despesa_nao_op' },
  impostos_sobre_lucro:     { type: 'despesa', label: 'IRPJ e CSLL',                         dre: 'irpj_csll' },
  // patrimonial / interno — fora do DRE
  nao_operacional:          { type: 'ambos',   label: 'Movimentações Patrimoniais / Internas', dre: null },
};

// Resolve o "bucket" de DRE de uma linha de transação a partir do group_type.
// Sem categoria/grupo: receita entra em receita_bruta, despesa em desp_gerais
// (mantém o comportamento anterior de não "sumir" com lançamentos soltos).
function dreBucketFor(row) {
  const g = ACCOUNTING_GROUPS[row.group_type];
  if (g) return g.dre; // pode ser null (fora do DRE)
  return row.type === 'credito' ? 'receita_bruta' : 'desp_gerais';
}

const db_init = async () => {
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
db_init();

// --- ROTAS PÚBLICAS ---
app.get('/api/global-banks', (req, res) => {
    db.all('SELECT * FROM global_banks ORDER BY name', [], (err, rows) => res.json(rows || []));
});

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const inputEmail = (email || '').trim();
    const inputPass = (password || '').trim();

    if (ADMIN_EMAIL && ADMIN_PASSWORD && inputEmail === ADMIN_EMAIL && inputPass === ADMIN_PASSWORD) {
        const token = jwt.sign({ id: 0, email: inputEmail, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
        logAudit('0', 'LOGIN_ADMIN', 'Acesso Admin', req.ip);
        return res.json({ 
            token, 
            user: { id: 0, email: inputEmail, razaoSocial: 'Administrador', role: 'admin' } 
        });
    }

    db.get('SELECT * FROM users WHERE email = ?', [inputEmail], (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Credenciais inválidas" });
        if (!bcrypt.compareSync(inputPass, user.password)) return res.status(401).json({ error: "Credenciais inválidas" });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '24h' });
        logAudit(user.id, 'LOGIN', 'Sucesso', req.ip);
        res.json({ 
            token, 
            user: { 
                id: user.id, 
                email: user.email, 
                razaoSocial: decrypt(user.razao_social), 
                cnpj: decrypt(user.cnpj), 
                role: user.role,
                blocked: user.blocked
            } 
        });
    });
});

app.post('/api/request-signup', (req, res) => {
    const { email, cnpj, razaoSocial, phone, businessType } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    
    db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
        if(row) return res.status(400).json({ error: "Email já cadastrado." });
        
        const safeCnpj = encrypt(cnpj);
        const safeRazao = encrypt(razaoSocial);
        const safePhone = encrypt(phone);
        const safeBusinessType = businessType || 'servico';

        db.run(`INSERT INTO pending_signups (email, token, cnpj, razao_social, phone, business_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET token=EXCLUDED.token, cnpj=EXCLUDED.cnpj, razao_social=EXCLUDED.razao_social, phone=EXCLUDED.phone, business_type=EXCLUDED.business_type, created_at=EXCLUDED.created_at`,
            [email, token, safeCnpj, safeRazao, safePhone, safeBusinessType, Date.now()],
            async function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                const link = `${appBaseUrl(req)}/?action=finalize&token=${token}`;
                const html = `
                <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
                    <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                        <h1 style="color: #10b981; margin: 0 0 20px 0;">Definir Senha de Acesso</h1>
                        <p style="color: #334155; font-size: 16px; margin-bottom: 30px;">
                            Olá, <strong>${razaoSocial}</strong>. Seus dados foram recebidos.
                            <br>Clique no botão abaixo para definir sua senha e ativar sua conta.
                        </p>
                        <a href="${link}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            Definir Minha Senha
                        </a>
                    </div>
                </div>
                `;
                
                await sendEmail(email, "Ative sua conta - Virgula Contábil", html);
                res.json({ message: "Link enviado" });
            }
        );
    });
});

// Link de ativação expira em 72h.
const SIGNUP_TTL_MS = 72 * 60 * 60 * 1000;

app.get('/api/validate-signup-token/:token', (req, res) => {
    db.get("SELECT * FROM pending_signups WHERE token = ? AND created_at > ?",
        [req.params.token, Date.now() - SIGNUP_TTL_MS], (err, row) => {
        if (!row) return res.status(404).json({ error: "Link inválido ou expirado." });
        res.json({ email: row.email, razaoSocial: decrypt(row.razao_social) });
    });
});

app.post('/api/complete-signup', (req, res) => {
    const { token, password } = req.body;
    if (!password || String(password).length < 8) {
        return res.status(400).json({ error: "A senha precisa ter ao menos 8 caracteres." });
    }
    db.get("SELECT * FROM pending_signups WHERE token = ? AND created_at > ?",
        [token, Date.now() - SIGNUP_TTL_MS], (err, pending) => {
        if (!pending) return res.status(400).json({ error: "Link inválido ou expirado." });

        const hash = bcrypt.hashSync(password, 10);
        db.run(`INSERT INTO users (email, password, cnpj, razao_social, phone, business_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [pending.email, hash, pending.cnpj, pending.razao_social, pending.phone, pending.business_type || 'servico', new Date().toISOString()],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const userId = this.lastID;
                
                const stmtCat = db.prepare("INSERT INTO categories (user_id, name, type, group_type, behavior_type, affects_dre, affects_cashflow, affects_balance) VALUES (?, ?, ?, ?, ?, true, true, false)");
                INITIAL_CATEGORIES_SEED.forEach(c => stmtCat.run(userId, c.name, c.type, c.group, c.behavior || 'variavel'));
                stmtCat.finalize();

                db.run("DELETE FROM pending_signups WHERE email = ?", [pending.email]);
                logAudit(userId, 'SIGNUP', 'Completo', req.ip);
                res.json({ success: true });
            }
        );
    });
});

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

app.post('/api/recover-password', (req, res) => {
    const { email } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    // Guarda só o hash do token — vazamento de DB não permite tomar contas.
    db.run("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?",
        [sha256(token), Date.now() + 3600000, email], function(err) {
        if(this.changes && this.changes > 0) {
            const link = `${appBaseUrl(req)}/?action=reset&token=${token}`;
            const html = `<p>Recebemos um pedido para redefinir sua senha.</p>
                <p><a href="${link}">Clique aqui para criar uma nova senha</a> (o link vale 1 hora).</p>
                <p>Se não foi você, ignore este e-mail.</p>`;
            sendEmail(email, "Recuperação de Senha - Vírgula Contábil", html);
        }
        res.json({ message: "Enviado se existir." });
    });
});

app.post('/api/reset-password-confirm', (req, res) => {
    const { token, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
        return res.status(400).json({ error: "A senha precisa ter ao menos 8 caracteres." });
    }
    db.get("SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?",
        [sha256(token), Date.now()], (err, user) => {
        if(!user) return res.status(400).json({ error: "Link inválido ou expirado." });
        db.run("UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
            [bcrypt.hashSync(newPassword, 10), user.id], () => res.json({ success: true }));
    });
});

// --- ROTAS GERAIS (PROTEGIDAS) ---

// Bancos
app.get('/api/banks', authenticateToken, (req, res) => {
    db.all('SELECT * FROM banks WHERE user_id = ? ORDER BY active DESC, name', [req.userId], (err, rows) => res.json(rows || []));
});
app.post('/api/banks', authenticateToken, (req, res) => {
    const { name, accountNumber, nickname, logo } = req.body;
    db.run(`INSERT INTO banks (user_id, name, account_number, nickname, logo) VALUES (?, ?, ?, ?, ?)`, 
        [req.userId, name, accountNumber, nickname, logo], function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({id: this.lastID});
    });
});
app.put('/api/banks/:id', authenticateToken, (req, res) => {
    const { nickname, active } = req.body;
    db.run(`UPDATE banks SET nickname = COALESCE(?, nickname), active = COALESCE(?, active) WHERE id = ? AND user_id = ?`,
        [nickname, active, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/banks/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM transactions WHERE bank_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM forecasts WHERE bank_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM credit_cards WHERE bank_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM banks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('COMMIT');
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Bank delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});

// Cartões de Crédito
app.get('/api/credit-cards', authenticateToken, (req, res) => {
    db.all('SELECT * FROM credit_cards WHERE user_id = ? ORDER BY name', [req.userId], (err, rows) => {
        res.json((rows || []).map(r => ({
            id: r.id, bankId: r.bank_id, name: r.name,
            closingDay: r.closing_day, dueDay: r.due_day, limitValue: r.limit_value
        })));
    });
});
app.post('/api/credit-cards', authenticateToken, async (req, res) => {
    const { bankId, name, closingDay, dueDay, limitValue } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO credit_cards (user_id, bank_id, name, closing_day, due_day, limit_value)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [req.userId, bankId || null, name, closingDay || null, dueDay || null, limitValue || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /credit-cards error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/credit-cards/:id', authenticateToken, (req, res) => {
    const { name, closingDay, dueDay, limitValue } = req.body;
    db.run(`UPDATE credit_cards SET name = ?, closing_day = ?, due_day = ?, limit_value = ? WHERE id = ? AND user_id = ?`,
        [name, closingDay, dueDay, limitValue, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/credit-cards/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM transactions WHERE credit_card_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM credit_cards WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('COMMIT');
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Credit card delete delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});

// Categorias
app.get('/api/categories', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM categories WHERE user_id = ? ORDER BY name`, [req.userId], (err, rows) => {
        if(rows && rows.length === 0) {
            const stmt = db.prepare("INSERT INTO categories (user_id, name, type, group_type, behavior_type, affects_dre, affects_cashflow, affects_balance) VALUES (?, ?, ?, ?, ?, true, true, false)");
            INITIAL_CATEGORIES_SEED.forEach(c => stmt.run(req.userId, c.name, c.type, c.group, c.behavior || 'variavel'));
            stmt.finalize(() => {
                db.all(`SELECT * FROM categories WHERE user_id = ?`, [req.userId], (err, newRows) => {
                    res.json((newRows || []).map(r => ({ ...r, groupType: r.group_type, mainGroup: r.main_group, subGroup: r.sub_group, costClassification: r.cost_classification, behaviorType: r.behavior_type, affectsDre: r.affects_dre, affectsCashflow: r.affects_cashflow, affectsBalance: r.affects_balance })));
                });
            });
        } else {
            res.json((rows || []).map(r => ({ ...r, groupType: r.group_type, mainGroup: r.main_group, subGroup: r.sub_group, costClassification: r.cost_classification, behaviorType: r.behavior_type, affectsDre: r.affects_dre, affectsCashflow: r.affects_cashflow, affectsBalance: r.affects_balance })));
        }
    });
});
app.post('/api/categories', authenticateToken, (req, res) => {
    const { name, type, groupType, mainGroup, subGroup, nature, affectsDre, affectsCashflow, affectsBalance, costClassification, behaviorType } = req.body;
    db.run(`INSERT INTO categories (user_id, name, type, group_type, main_group, sub_group, nature, affects_dre, affects_cashflow, affects_balance, cost_classification, behavior_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [req.userId, name, type, groupType, mainGroup, subGroup, nature, affectsDre !== undefined ? affectsDre : true, affectsCashflow !== undefined ? affectsCashflow : true, affectsBalance || false, costClassification, behaviorType], function(err) {
        res.json({ id: this.lastID });
    });
});
app.put('/api/categories/:id', authenticateToken, (req, res) => {
    const { name, type, groupType, mainGroup, subGroup, nature, affectsDre, affectsCashflow, affectsBalance, costClassification, behaviorType } = req.body;
    db.run(`UPDATE categories SET name = ?, type = ?, group_type = ?, main_group = ?, sub_group = ?, nature = ?, affects_dre = ?, affects_cashflow = ?, affects_balance = ?, cost_classification = ?, behavior_type = ? WHERE id = ? AND user_id = ?`, 
    [name, type, groupType, mainGroup, subGroup, nature, affectsDre !== undefined ? affectsDre : true, affectsCashflow !== undefined ? affectsCashflow : true, affectsBalance || false, costClassification, behaviorType, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM categories WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err) => res.json({success: !err}));
});

// Confere que cada FK (banco / categoria / cartão) referenciada pertence ao
// próprio usuário. `table` vem de uma lista fixa — nunca do request.
async function assertUserOwns(userId, { bankId, categoryId, creditCardId }) {
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

// Transações
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC LIMIT 5000`, [req.userId]);
        res.json(rows.map(r => ({...r, reconciled: !!r.reconciled, categoryId: r.category_id, bankId: r.bank_id, creditCardId: r.credit_card_id})));
    } catch(err) {
        console.error("GET /transactions error:", err.message);
        res.status(500).json({error: "Server Error"});
    }
});
app.post('/api/transactions', authenticateToken, async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, reconciled, ofxImportId } = req.body;
    try {
        // 400 (não 403): é validação de payload. O apiFetch do frontend desloga
        // em 401/403, e um id de categoria/banco obsoleto não deve derrubar a sessão.
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(400).json({ error: owned.error });

        const ins = await pool.query(
            `INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, credit_card_id, reconciled, ofx_import_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [req.userId, date, description, value, type, categoryId || null, bankId || null, creditCardId || null, reconciled ? 1 : 0, ofxImportId || null]
        );

        if (!creditCardId && bankId) {
            const modifier = type === 'credito' ? 1 : -1;
            await pool.query(`UPDATE banks SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
                [Number(value) * modifier, bankId, req.userId]);
        }
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error("POST /transactions error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, reconciled } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const { rows: [oldTx] } = await pool.query(
            `SELECT * FROM transactions WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        if (!oldTx) return res.status(404).json({ error: "Não encontrado" });
        await pool.query(
            `UPDATE transactions SET date=$1, description=$2, value=$3, type=$4, category_id=$5, bank_id=$6, credit_card_id=$7, reconciled=$8 WHERE id=$9 AND user_id=$10`,
            [date, description, value, type, categoryId || null, bankId || null, creditCardId || null, reconciled ? 1 : 0, req.params.id, req.userId]);
        if (!oldTx.credit_card_id) recalculateBankBalance(oldTx.bank_id);
        if (!creditCardId && bankId) recalculateBankBalance(bankId);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /transactions error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
    db.get(`SELECT bank_id, credit_card_id FROM transactions WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err, row) => {
        if(!row) return res.json({success:false});
        db.run(`DELETE FROM transactions WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err) => {
            if (!row.credit_card_id) recalculateBankBalance(row.bank_id);
            res.json({success: true});
        });
    });
});
app.patch('/api/transactions/:id/reconcile', authenticateToken, (req, res) => {
    const { reconciled } = req.body;
    db.run(`UPDATE transactions SET reconciled = ? WHERE id = ? AND user_id = ?`, [reconciled?1:0, req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.patch('/api/transactions/batch-update', authenticateToken, async (req, res) => {
    const { transactionIds, categoryId } = req.body;
    if(!Array.isArray(transactionIds) || transactionIds.length === 0) return res.json({success: true});
    try {
        await pool.query(
            `UPDATE transactions SET category_id = $1, reconciled = 1 WHERE id = ANY($2::int[]) AND user_id = $3`,
            [categoryId, transactionIds, req.userId]
        );
        res.json({success: true});
    } catch(e) {
        console.error("Batch update error:", e.message);
        res.status(500).json({success: false});
    }
});

function recalculateBankBalance(bankId) {
    if (!bankId) return;
    pool.query(`SELECT SUM(CASE WHEN type = 'credito' THEN value ELSE -value END) as balance FROM transactions WHERE bank_id = $1 AND credit_card_id IS NULL`, [bankId])
    .then(res => {
        let bal = res.rows[0]?.balance || 0;
        pool.query(`UPDATE banks SET balance = $1 WHERE id = $2`, [bal, bankId]).catch(e => console.error("Update balance DB error:", e.message));
    })
    .catch(e => {
        console.error("Balance recalculate DB error:", e.message);
    });
}

// Previsões
app.get('/api/forecasts', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM forecasts WHERE user_id = ? ORDER BY date`, [req.userId], (err, rows) => {
        res.json((rows || []).map(r => ({...r, realized: !!r.realized, categoryId: r.category_id, bankId: r.bank_id, creditCardId: r.credit_card_id, installmentCurrent: r.installment_current, installmentTotal: r.installment_total, groupId: r.group_id})));
    });
});
app.post('/api/forecasts', authenticateToken, async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId, realized, installmentCurrent, installmentTotal, groupId } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO forecasts (user_id, date, description, value, type, category_id, bank_id, credit_card_id, realized, installment_current, installment_total, group_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [req.userId, date, description, value, type, categoryId || null, bankId || null, creditCardId || null, realized ? 1 : 0, installmentCurrent || null, installmentTotal || null, groupId || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /forecasts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/forecasts/:id', authenticateToken, async (req, res) => {
    const { date, description, value, type, categoryId, bankId, creditCardId } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId, creditCardId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        await pool.query(
            `UPDATE forecasts SET date=$1, description=$2, value=$3, type=$4, category_id=$5, bank_id=$6, credit_card_id=$7 WHERE id=$8 AND user_id=$9`,
            [date, description, value, type, categoryId || null, bankId || null, creditCardId || null, req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /forecasts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.patch('/api/forecasts/:id/realize', authenticateToken, (req, res) => {
    db.run(`UPDATE forecasts SET realized = 1 WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err) => res.json({success: !err}));
});
app.delete('/api/forecasts/:id', authenticateToken, (req, res) => {
    const mode = req.query.mode || 'single';
    if (mode === 'single') {
        db.run(`DELETE FROM forecasts WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err) => res.json({success: !err}));
    } else {
        db.get(`SELECT group_id, date FROM forecasts WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err, current) => {
            if(!current) return res.status(404).json({ success: false, error: "Não encontrado" });
            if(!current.group_id) return db.run(`DELETE FROM forecasts WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], () => res.json({success:true}));
            let sql = `DELETE FROM forecasts WHERE group_id = ? AND user_id = ?`;
            const params = [current.group_id, req.userId];
            if (mode === 'future') { sql += ` AND date >= ?`; params.push(current.date); }
            db.run(sql, params, (err) => res.json({success: !err}));
        });
    }
});

// OFX
app.get('/api/ofx-imports', authenticateToken, (req, res) => {
    db.all(`SELECT id, file_name, import_date, bank_id, transaction_count FROM ofx_imports WHERE user_id = ? ORDER BY import_date DESC`, [req.userId], (err, rows) => {
        res.json((rows || []).map(r => ({...r, fileName: r.file_name, importDate: r.import_date, bankId: r.bank_id, transactionCount: r.transaction_count})));
    });
});
app.post('/api/ofx-imports', authenticateToken, (req, res) => {
    const { fileName, importDate, bankId, transactionCount, content } = req.body;
    db.run(`INSERT INTO ofx_imports (user_id, file_name, import_date, bank_id, transaction_count, content) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId, fileName, importDate, bankId, transactionCount, content], function(err) { res.json({id: this.lastID}); });
});
app.delete('/api/ofx-imports/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM transactions WHERE ofx_import_id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('DELETE FROM ofx_imports WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        await client.query('COMMIT');
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("OFX delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});
app.get('/api/keyword-rules', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM keyword_rules WHERE user_id = ?`, [req.userId], (err, rows) => res.json((rows || []).map(r => ({...r, categoryId: r.category_id, bankId: r.bank_id}))));
});
app.post('/api/keyword-rules', authenticateToken, async (req, res) => {
    const { keyword, type, categoryId, bankId } = req.body;
    try {
        const owned = await assertUserOwns(req.userId, { bankId, categoryId });
        if (!owned.ok) return res.status(403).json({ error: owned.error });
        const ins = await pool.query(
            `INSERT INTO keyword_rules (user_id, keyword, type, category_id, bank_id)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [req.userId, keyword, type, categoryId || null, bankId || null]);
        res.json({ id: ins.rows[0].id });
    } catch (err) {
        console.error('POST /keyword-rules error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/keyword-rules/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM keyword_rules WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], (err) => res.json({success: !err}));
});

// Integration NFe
app.get('/api/integration/settings', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT token, start_date, target_type, category_in_id, category_out_id,
                    bank_in_id, bank_out_id, total_imported, last_sync
             FROM integration_settings WHERE user_id = $1`, [req.userId]);
        if (rows.length === 0) return res.json({ target_type: 'transaction', total_imported: 0 });
        const s = rows[0];
        res.json({ ...s, token: decrypt(s.token) }); // token cifrado em repouso
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/integration/settings', authenticateToken, async (req, res) => {
    const { token, start_date, target_type, category_in_id, category_out_id, bank_in_id, bank_out_id } = req.body;
    try {
        await pool.query(
            `INSERT INTO integration_settings (user_id, token, start_date, target_type, category_in_id, category_out_id, bank_in_id, bank_out_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (user_id) DO UPDATE SET
            token = EXCLUDED.token, start_date = EXCLUDED.start_date, target_type = EXCLUDED.target_type,
            category_in_id = EXCLUDED.category_in_id, category_out_id = EXCLUDED.category_out_id,
            bank_in_id = EXCLUDED.bank_in_id, bank_out_id = EXCLUDED.bank_out_id`,
            [req.userId, encrypt(token), start_date, target_type, category_in_id, category_out_id, bank_in_id, bank_out_id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/integration/sync', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM integration_settings WHERE user_id = $1', [req.userId]);
        if (rows.length === 0 || !rows[0].token) return res.status(400).json({ error: 'Token não configurado.' });

        const settings = { ...rows[0], token: decrypt(rows[0].token) };
        let url = `https://nfe.virgulacontabil.com.br/api/v1/export/notas/${encodeURIComponent(settings.token)}`;
        if (settings.start_date) {
            url += `?data_inicio=${settings.start_date}`;
        }

        const fetchObj = await fetch(url);
        if (!fetchObj.ok) {
            return res.status(400).json({ error: 'Erro ao buscar notas. Token pode estar inválido.' });
        }
        const json = await fetchObj.json();
        if (!json.success || !json.notas) {
            return res.status(400).json({ error: 'Formato de resposta inválido da API ou sem notas.' });
        }

        let importedCount = 0;
        const totalNotas = json.notas.length;
        
        for (const nota of json.notas) {
            const rawDate = nota.data_emissao || '';
            const dataV = rawDate.split(' ')[0]; // Convert YYYY-MM-DD HH:MM:SS to YYYY-MM-DD
            
            const isNfeEntrada = String(nota.tipo).toLowerCase() === 'entrada'; // NFe Entrada = Compra = Debito
            const desc = isNfeEntrada ? `Compra ${nota.fornecedor}` : `Venda ${nota.fornecedor}`;
            const val = parseFloat(nota.valor_total);
            
            const catId = isNfeEntrada ? settings.category_in_id : settings.category_out_id;
            const bankId = isNfeEntrada ? settings.bank_out_id : settings.bank_in_id;
            const opType = isNfeEntrada ? 'debito' : 'credito';

            if (settings.target_type === 'forecast') {
                await pool.query(
                    'INSERT INTO forecasts (user_id, date, description, value, type, category_id, bank_id, realized) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)',
                    [req.userId, dataV, desc, val, opType, catId || null, bankId || null]
                );
            } else {
                await pool.query(
                    'INSERT INTO transactions (user_id, date, description, value, type, category_id, bank_id, reconciled) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
                    [req.userId, dataV, desc, val, opType, catId || null, bankId || null]
                );
            }
            importedCount++;
        }

        await pool.query('UPDATE integration_settings SET total_imported = COALESCE(total_imported, 0) + $1, last_sync = $2 WHERE user_id = $3', [importedCount, new Date().toISOString(), req.userId]);

        res.json({ success: true, count: importedCount, total: totalNotas });
    } catch(err) {
        console.error("Sync error:", err);
        res.status(500).json({ error: 'Erro ao processar sincronização: ' + err.message });
    }
});

// --- RELATÓRIOS ---

app.get('/api/reports/cash-flow', authenticateToken, async (req, res) => {
    const { year, month } = req.query;
    const y = parseInt(year);
    const m = month ? parseInt(month) : null;
    const userId = req.userId;

    try {
        let startDate, endDate;
        if (m !== null) {
            startDate = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0];
            endDate = new Date(Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1)).toISOString().split('T')[0];
        } else {
            startDate = new Date(Date.UTC(y, 0, 1)).toISOString().split('T')[0];
            endDate = new Date(Date.UTC(y + 1, 0, 1)).toISOString().split('T')[0];
        }

        const balancePromise = pool.query(`SELECT SUM(CASE WHEN type = 'credito' THEN value ELSE -value END) as balance FROM transactions WHERE user_id = $1 AND date < $2`, [userId, startDate]);
        const startBalanceRes = await balancePromise;
        const startBalance = Number(startBalanceRes.rows[0]?.balance || 0);

        const { rows } = await pool.query(
            `SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = $1 AND t.date >= $2 AND t.date < $3`,
            [userId, startDate, endDate]
        );

        const totalReceitas = rows.filter(r => r.type === 'credito').reduce((sum, r) => sum + Number(r.value), 0);
        const totalDespesas = rows.filter(r => r.type === 'debito').reduce((sum, r) => sum + Number(r.value), 0);
        
        const receitasCat = {};
        const despesasCat = {};

        rows.forEach(r => {
            const catName = r.category_name || 'Sem Categoria';
            const value = Number(r.value);
            if (r.type === 'credito') receitasCat[catName] = (receitasCat[catName] || 0) + value;
            else despesasCat[catName] = (despesasCat[catName] || 0) + value;
        });

        res.json({
            startBalance,
            totalReceitas,
            totalDespesas,
            endBalance: startBalance + totalReceitas - totalDespesas,
            receitasByCategory: Object.entries(receitasCat).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
            despesasByCategory: Object.entries(despesasCat).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value)
        });
            
    } catch (e) {
        console.error("Cashflow Report Error:", e.stack);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/reports/daily-flow', authenticateToken, async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Datas necessárias' });

    try {
        // Saldo de abertura: tudo que entrou/saiu ANTES de startDate.
        const openRes = await pool.query(
            `SELECT COALESCE(SUM(CASE WHEN type = 'credito' THEN value ELSE -value END), 0) AS saldo
             FROM transactions WHERE user_id = $1 AND date::date < $2::date`,
            [req.userId, startDate]
        );
        const openingBalance = Number(openRes.rows[0].saldo || 0);

        // ::date normaliza lançamentos que vierem com hora (ex.: import de NFe).
        const { rows } = await pool.query(
            `SELECT (date::date)::text AS d, type, SUM(value) AS total
             FROM transactions
             WHERE user_id = $1 AND date::date >= $2::date AND date::date <= $3::date
             GROUP BY date::date, type`,
            [req.userId, startDate, endDate]
        );
        const byDay = {};
        rows.forEach(r => {
            if (!byDay[r.d]) byDay[r.d] = { income: 0, expense: 0 };
            if (r.type === 'credito') byDay[r.d].income += Number(r.total);
            else byDay[r.d].expense += Number(r.total);
        });

        // Série contínua (todos os dias) para a linha de saldo acumulado não ter buracos.
        const series = [];
        let running = openingBalance;
        let minSaldo = openingBalance, minDate = startDate;
        const cur = new Date(startDate + 'T00:00:00Z');
        const end = new Date(endDate + 'T00:00:00Z');
        let guard = 0;
        while (cur <= end && guard++ < 1100) {
            const key = cur.toISOString().split('T')[0];
            const d = byDay[key] || { income: 0, expense: 0 };
            const net = d.income - d.expense;
            running += net;
            if (running < minSaldo) { minSaldo = running; minDate = key; }
            series.push({ date: key, income: d.income, expense: d.expense, net, saldo: running });
            cur.setUTCDate(cur.getUTCDate() + 1);
        }

        res.json({ openingBalance, closingBalance: running, minSaldo, minDate, series });
    } catch (err) {
        console.error("Daily Flow Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
});

// DRE CORRIGIDO COM LÓGICA CONTÁBIL E POSTGRES SQL
app.get('/api/reports/dre', authenticateToken, async (req, res) => {
    const { year, month } = req.query;
    const userId = req.userId;
    const y = parseInt(year);
    const m = month ? parseInt(month) : null;

    let query = `SELECT t.*, c.name as category_name, c.group_type FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = $1 AND EXTRACT(YEAR FROM t.date::date) = $2`;
    const params = [userId, y];
    if (m !== null) { 
        query += ` AND EXTRACT(MONTH FROM t.date::date) = $3`; 
        params.push(m + 1); 
    }

    try {
        const { rows } = await pool.query(query, params);

        let dre = { 
            receitaBruta: 0, 
            deducoes: 0, 
            cmv: 0, 
            outrasReceitas: 0,
            despesasOperacionais: 0, 
            resultadoFinanceiro: 0, 
            receitaNaoOperacional: 0, 
            despesaNaoOperacional: 0, 
            impostos: 0 
        };

        rows.forEach(t => {
            const group = t.group_type || '';
            const val = Number(t.value);
            const isCredit = t.type === 'credito';

            // Agrupamento
            if (group === 'receita_bruta') dre.receitaBruta += val;
            else if (group === 'impostos') { 
                if(!isCredit) {
                    dre.deducoes += val; 
                    dre.impostos += val;
                }
            }
            else if (group === 'custo_operacional') dre.cmv += val;
            else if (group === 'outras_receitas') dre.outrasReceitas += val;
            else if (group === 'receita_financeira') dre.resultadoFinanceiro += val;
            else if (group === 'despesa_financeira') dre.resultadoFinanceiro -= val;
            else if (group === 'receita_nao_operacional') dre.receitaNaoOperacional += val;
            else if (group === 'despesa_nao_operacional') dre.despesaNaoOperacional += val;
            else if (['despesa_operacional', 'despesa_pessoal', 'despesa_administrativa'].includes(group)) dre.despesasOperacionais += val;
            else if (group === 'nao_operacional') { /* Ignora */ }
            else { 
                const cat = (t.category_name || '').toLowerCase();
                if (!isCredit) dre.despesasOperacionais += val; 
                else if(cat.includes('venda') || cat.includes('serviço')) dre.receitaBruta += val;
                else dre.outrasReceitas += val;
            }
        });

        const receitaLiquida = dre.receitaBruta - dre.deducoes;
        const resultadoBruto = receitaLiquida - dre.cmv;
        const resultadoOperacional = resultadoBruto - dre.despesasOperacionais;
        const resultadoAntesNaoOperacional = resultadoOperacional + dre.resultadoFinanceiro + dre.outrasReceitas;
        const resultadoNaoOperacionalTotal = dre.receitaNaoOperacional - dre.despesaNaoOperacional;
        const lucroLiquido = resultadoAntesNaoOperacional + resultadoNaoOperacionalTotal;

        res.json({
            receitaBruta: dre.receitaBruta, 
            deducoes: dre.deducoes, 
            receitaLiquida, 
            cmv: dre.cmv, 
            resultadoBruto,
            despesasOperacionais: dre.despesasOperacionais, 
            resultadoOperacional, 
            resultadoFinanceiro: dre.resultadoFinanceiro,
            outrasReceitas: dre.outrasReceitas,
            resultadoNaoOperacional: resultadoNaoOperacionalTotal, 
            resultadoAntesNaoOperacional,
            lucroLiquido
        });
    } catch (err) {
        console.error("DRE Report Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
});

// DRE gerencial — estrutura do art. 187 da Lei 6.404/76 adaptada ao regime de
// caixa (o sistema só conhece lançamentos realizados). Base da análise
// vertical (AV): Receita Operacional Líquida.
app.get('/api/reports/dre-hierarchical', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const y = parseInt(req.query.year);
    const m = req.query.month !== undefined && req.query.month !== '' && req.query.month !== 'null'
        ? parseInt(req.query.month) : null;

    let query = `SELECT t.type, t.value, c.name AS category_name, c.group_type
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND EXTRACT(YEAR FROM t.date::date) = $2`;
    const params = [userId, y];
    if (m !== null) { query += ` AND EXTRACT(MONTH FROM t.date::date) = $3`; params.push(m + 1); }

    try {
        const { rows } = await pool.query(query, params);

        const buckets = {};
        const add = (bk, cat, val) => {
            if (!buckets[bk]) buckets[bk] = { total: 0, children: {} };
            buckets[bk].total += val;
            buckets[bk].children[cat] = (buckets[bk].children[cat] || 0) + val;
        };
        rows.forEach(r => {
            const bk = dreBucketFor(r);
            if (!bk) return; // movimento patrimonial/interno — fora do DRE
            add(bk, r.category_name || 'Sem categoria', Number(r.value) || 0);
        });
        const B = k => (buckets[k] ? buckets[k].total : 0);
        const kids = (k, mult = 1) => Object.entries(buckets[k] ? buckets[k].children : {})
            .map(([label, value]) => ({ label, value: value * mult }))
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        const receitaBruta = B('receita_bruta');
        const deducoes = B('deducoes');
        const receitaLiquida = receitaBruta - deducoes;
        const cmv = B('cmv');
        const lucroBruto = receitaLiquida - cmv;
        const dVendas = B('desp_vendas');
        const dPessoal = B('desp_pessoal');
        const dAdmin = B('desp_admin');
        const dGerais = B('desp_gerais');
        const outrasRecOp = B('outras_receitas_op');
        const despesasOperacionais = dVendas + dPessoal + dAdmin + dGerais;
        const resultadoOperacional = lucroBruto - despesasOperacionais + outrasRecOp;
        const recFin = B('receita_financeira');
        const despFin = B('despesa_financeira');
        const resultadoFinanceiro = recFin - despFin;
        const resultadoAntesTributos = resultadoOperacional + resultadoFinanceiro;
        const recNaoOp = B('receita_nao_op');
        const despNaoOp = B('despesa_nao_op');
        const resultadoNaoOperacional = recNaoOp - despNaoOp;
        const irpjCsll = B('irpj_csll');
        const lucroLiquido = resultadoAntesTributos + resultadoNaoOperacional - irpjCsll;

        const base = receitaLiquida !== 0 ? Math.abs(receitaLiquida) : 1;
        const pct = v => (v / base) * 100;

        const lines = [
            { key: 'rb', kind: 'group', label: 'Receita Operacional Bruta', value: receitaBruta, pct: pct(receitaBruta), children: kids('receita_bruta') },
            { key: 'ded', kind: 'group', label: '(-) Impostos e Deduções sobre Vendas', value: -deducoes, pct: pct(-deducoes), children: kids('deducoes', -1) },
            { key: 'rl', kind: 'subtotal', label: '= Receita Operacional Líquida', value: receitaLiquida, pct: pct(receitaLiquida) },
            { key: 'cmv', kind: 'group', label: '(-) Custos (CMV / CPV / CSP)', value: -cmv, pct: pct(-cmv), children: kids('cmv', -1) },
            { key: 'lb', kind: 'subtotal', label: '= Lucro Bruto', value: lucroBruto, pct: pct(lucroBruto) },
            { key: 'dv', kind: 'group', label: '(-) Despesas com Vendas', value: -dVendas, pct: pct(-dVendas), children: kids('desp_vendas', -1) },
            { key: 'dp', kind: 'group', label: '(-) Despesas com Pessoal', value: -dPessoal, pct: pct(-dPessoal), children: kids('desp_pessoal', -1) },
            { key: 'da', kind: 'group', label: '(-) Despesas Administrativas', value: -dAdmin, pct: pct(-dAdmin), children: kids('desp_admin', -1) },
            { key: 'dg', kind: 'group', label: '(-) Despesas Gerais e Operacionais', value: -dGerais, pct: pct(-dGerais), children: kids('desp_gerais', -1) },
        ];
        if (outrasRecOp) lines.push({ key: 'oro', kind: 'group', label: '(+) Outras Receitas Operacionais', value: outrasRecOp, pct: pct(outrasRecOp), children: kids('outras_receitas_op') });
        lines.push({ key: 'ebit', kind: 'subtotal', label: '= Resultado Operacional (EBIT)', value: resultadoOperacional, pct: pct(resultadoOperacional) });
        lines.push({
            key: 'rf', kind: 'group', label: '(+/-) Resultado Financeiro', value: resultadoFinanceiro, pct: pct(resultadoFinanceiro),
            children: [...kids('receita_financeira'), ...kids('despesa_financeira', -1)],
        });
        lines.push({ key: 'rat', kind: 'subtotal', label: '= Resultado Antes dos Tributos', value: resultadoAntesTributos, pct: pct(resultadoAntesTributos) });
        if (recNaoOp || despNaoOp) lines.push({
            key: 'rno', kind: 'group', label: '(+/-) Outras Receitas e Despesas Não Operacionais', value: resultadoNaoOperacional, pct: pct(resultadoNaoOperacional),
            children: [...kids('receita_nao_op'), ...kids('despesa_nao_op', -1)],
        });
        if (irpjCsll) lines.push({ key: 'ir', kind: 'group', label: '(-) IRPJ e CSLL', value: -irpjCsll, pct: pct(-irpjCsll), children: kids('irpj_csll', -1) });
        lines.push({ key: 'll', kind: 'total', label: '= Lucro / Prejuízo Líquido do Exercício', value: lucroLiquido, pct: pct(lucroLiquido) });

        res.json({
            meta: { regime: 'caixa', baseAV: 'Receita Operacional Líquida', ano: y, mes: m !== null ? m + 1 : null },
            indicadores: {
                receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto,
                margemBrutaPct: receitaLiquida ? (lucroBruto / receitaLiquida) * 100 : 0,
                despesasOperacionais, outrasReceitasOperacionais: outrasRecOp,
                resultadoOperacional, margemOperacionalPct: receitaLiquida ? (resultadoOperacional / receitaLiquida) * 100 : 0,
                resultadoFinanceiro, resultadoAntesTributos, resultadoNaoOperacional, irpjCsll,
                lucroLiquido, margemLiquidaPct: receitaLiquida ? (lucroLiquido / receitaLiquida) * 100 : 0,
            },
            lines,
        });
    } catch (err) {
        console.error('DRE Report Error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/analysis', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const y = parseInt(req.query.year);
    const m = req.query.month !== undefined && req.query.month !== '' && req.query.month !== 'null'
        ? parseInt(req.query.month) : null;

    const targetYear = y;
    const targetMonth = m !== null ? m + 1 : null;
    const prevYear = targetMonth ? (targetMonth === 1 ? y - 1 : y) : y - 1;
    const prevMonth = targetMonth ? (targetMonth === 1 ? 12 : targetMonth - 1) : null;

    let q = `SELECT t.type, t.value, t.date,
                    c.name AS category_name, c.group_type, c.behavior_type
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND (`;
    const params = [userId];
    if (targetMonth !== null) {
        q += `(EXTRACT(YEAR FROM t.date::date) = $2 AND EXTRACT(MONTH FROM t.date::date) = $3)
              OR (EXTRACT(YEAR FROM t.date::date) = $4 AND EXTRACT(MONTH FROM t.date::date) = $5))`;
        params.push(targetYear, targetMonth, prevYear, prevMonth);
    } else {
        q += `EXTRACT(YEAR FROM t.date::date) = $2 OR EXTRACT(YEAR FROM t.date::date) = $3)`;
        params.push(targetYear, prevYear);
    }

    // Custos/despesas operacionais que entram no cálculo de fixo x variável.
    const OPERACIONAIS = new Set(['cmv', 'desp_vendas', 'desp_pessoal', 'desp_admin', 'desp_gerais']);

    // Reduz um conjunto de linhas ao DRE + composição fixo/variável + Pareto.
    function computeDre(rows) {
        const B = {};                // bucket -> soma
        const catDespesa = {};       // categoria -> soma (só despesas que afetam o DRE)
        const catReceita = {};       // categoria -> soma (só receitas operacionais)
        let custosFixos = 0, custosVariaveis = 0;
        let nReceitaBruta = 0;
        let entradasCaixa = 0, saidasCaixa = 0;   // movimento real de caixa (tudo)

        rows.forEach(r => {
            const val = Number(r.value) || 0;
            if (r.type === 'credito') entradasCaixa += val; else saidasCaixa += val;

            const bk = dreBucketFor(r);
            if (!bk) return; // patrimonial/interno — fora do DRE
            B[bk] = (B[bk] || 0) + val;

            const cat = r.category_name || 'Sem categoria';
            if (r.type === 'credito') {
                if (bk === 'receita_bruta') { nReceitaBruta += 1; catReceita[cat] = (catReceita[cat] || 0) + val; }
                if (bk === 'outras_receitas_op') catReceita[cat] = (catReceita[cat] || 0) + val;
            } else {
                if (OPERACIONAIS.has(bk)) {
                    catDespesa[cat] = (catDespesa[cat] || 0) + val;
                    if (r.behavior_type === 'fixa') custosFixos += val;
                    else custosVariaveis += val;
                }
            }
        });
        const g = k => B[k] || 0;

        const receitaBruta = g('receita_bruta');
        const deducoes = g('deducoes');
        const receitaLiquida = receitaBruta - deducoes;
        const cmv = g('cmv');
        const lucroBruto = receitaLiquida - cmv;
        const despVendas = g('desp_vendas'), despPessoal = g('desp_pessoal'),
              despAdmin = g('desp_admin'), despGerais = g('desp_gerais');
        const despesasOperacionais = despVendas + despPessoal + despAdmin + despGerais;
        const outrasRecOp = g('outras_receitas_op');
        const resultadoOperacional = lucroBruto - despesasOperacionais + outrasRecOp;
        const resultadoFinanceiro = g('receita_financeira') - g('despesa_financeira');
        const despesasFinanceiras = g('despesa_financeira');
        const resultadoAntesTributos = resultadoOperacional + resultadoFinanceiro;
        const resultadoNaoOperacional = g('receita_nao_op') - g('despesa_nao_op');
        const irpjCsll = g('irpj_csll');
        const lucroLiquido = resultadoAntesTributos + resultadoNaoOperacional - irpjCsll;

        // Margem de contribuição = RL − (custos e despesas VARIÁVEIS)
        const custosDespVariaveis = custosVariaveis;
        const margemContribuicao = receitaLiquida - custosDespVariaveis;
        const margemContribuicaoPct = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0;
        const custosDespFixas = custosFixos;
        // Ponto de equilíbrio contábil (R$ de receita líquida)
        const pontoEquilibrio = margemContribuicaoPct > 0 ? custosDespFixas / (margemContribuicaoPct / 100) : null;
        const margemSegurancaPct = (pontoEquilibrio && receitaLiquida > 0)
            ? ((receitaLiquida - pontoEquilibrio) / receitaLiquida) * 100 : null;
        const grauAlavancagem = resultadoOperacional !== 0 ? margemContribuicao / resultadoOperacional : null;

        return {
            receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto,
            despVendas, despPessoal, despAdmin, despGerais, despesasOperacionais, outrasRecOp,
            resultadoOperacional, resultadoFinanceiro, despesasFinanceiras,
            resultadoAntesTributos, resultadoNaoOperacional, irpjCsll, lucroLiquido,
            margemBrutaPct: receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
            margemOperacionalPct: receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : 0,
            margemLiquidaPct: receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0,
            margemContribuicao, margemContribuicaoPct,
            custosDespFixas, custosDespVariaveis,
            pctCustoFixo: (custosFixos + custosVariaveis) > 0 ? (custosFixos / (custosFixos + custosVariaveis)) * 100 : 0,
            pontoEquilibrio, margemSegurancaPct, grauAlavancagem,
            nReceitaBruta, ticketMedio: nReceitaBruta > 0 ? receitaBruta / nReceitaBruta : 0,
            entradasCaixa, saidasCaixa, geracaoCaixa: entradasCaixa - saidasCaixa,
            catDespesa, catReceita,
        };
    }

    try {
        const { rows } = await pool.query(q, params);
        const inPeriod = (r, yy, mm) => {
            const d = new Date((r.date || '').slice(0, 10) + 'T00:00:00Z');
            if (isNaN(d)) return false;
            return d.getUTCFullYear() === yy && (mm === null || d.getUTCMonth() + 1 === mm);
        };
        const cur = computeDre(rows.filter(r => inPeriod(r, targetYear, targetMonth)));
        const prev = computeDre(rows.filter(r => inPeriod(r, prevYear, prevMonth)));

        // Análise vertical (% da Receita Líquida)
        const baseAV = cur.receitaLiquida > 0 ? cur.receitaLiquida : 1;
        const av = [
            ['Receita Operacional Bruta', cur.receitaBruta],
            ['(-) Deduções sobre Vendas', -cur.deducoes],
            ['= Receita Operacional Líquida', cur.receitaLiquida],
            ['(-) Custos (CMV/CPV/CSP)', -cur.cmv],
            ['= Lucro Bruto', cur.lucroBruto],
            ['(-) Despesas com Vendas', -cur.despVendas],
            ['(-) Despesas com Pessoal', -cur.despPessoal],
            ['(-) Despesas Administrativas', -cur.despAdmin],
            ['(-) Despesas Gerais', -cur.despGerais],
            ['(+/-) Resultado Financeiro', cur.resultadoFinanceiro],
            ['= Resultado Operacional', cur.resultadoOperacional],
            ['= Lucro Líquido', cur.lucroLiquido],
        ].map(([label, valor]) => ({ label, valor, pct: (valor / baseAV) * 100 }));

        // Análise horizontal (período atual x anterior)
        const ah = [
            ['Receita Bruta', cur.receitaBruta, prev.receitaBruta],
            ['Receita Líquida', cur.receitaLiquida, prev.receitaLiquida],
            ['Lucro Bruto', cur.lucroBruto, prev.lucroBruto],
            ['Despesas Operacionais', cur.despesasOperacionais, prev.despesasOperacionais],
            ['Resultado Operacional', cur.resultadoOperacional, prev.resultadoOperacional],
            ['Lucro Líquido', cur.lucroLiquido, prev.lucroLiquido],
        ].map(([label, atual, anterior]) => ({
            label, atual, anterior,
            varAbs: atual - anterior,
            varPct: anterior !== 0 ? ((atual - anterior) / Math.abs(anterior)) * 100 : null,
        }));

        // Composição das despesas operacionais
        const composicaoDespesas = [
            ['Custos (CMV/CPV/CSP)', cur.cmv],
            ['Despesas com Vendas', cur.despVendas],
            ['Despesas com Pessoal', cur.despPessoal],
            ['Despesas Administrativas', cur.despAdmin],
            ['Despesas Gerais', cur.despGerais],
        ].filter(([, v]) => v > 0);
        const totalComp = composicaoDespesas.reduce((s, [, v]) => s + v, 0) || 1;

        // Curva ABC (Pareto) por categoria
        const pareto = (obj) => {
            const total = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
            let acc = 0;
            return Object.entries(obj)
                .map(([nome, valor]) => ({ nome, valor, impacto: (valor / total) * 100 }))
                .sort((a, b) => b.valor - a.valor)
                .map(i => { acc += i.impacto; return { ...i, acumulado: acc }; });
        };
        const paretoDespesas = pareto(cur.catDespesa);
        const paretoReceitas = pareto(cur.catReceita);

        // MoM
        const momReceita = prev.receitaLiquida > 0
            ? ((cur.receitaLiquida - prev.receitaLiquida) / prev.receitaLiquida) * 100 : null;
        const momDespesa = prev.despesasOperacionais > 0
            ? ((cur.despesasOperacionais - prev.despesasOperacionais) / prev.despesasOperacionais) * 100 : null;

        const pctDespesasReceita = cur.receitaLiquida > 0
            ? ((cur.cmv + cur.despesasOperacionais + cur.despesasFinanceiras) / cur.receitaLiquida) * 100 : 0;

        // Score financeiro (0–100)
        let score = 100;
        const hasData = cur.receitaBruta > 0 || cur.saidasCaixa > 0;
        if (!hasData) score = 0;
        else {
            if (cur.margemLiquidaPct < 0) score -= 25;
            else if (cur.margemLiquidaPct < 5) score -= 10;
            if (cur.resultadoOperacional < 0) score -= 20;
            if (cur.receitaLiquida > 0 && cur.margemContribuicaoPct < 25) score -= 15;
            if (cur.margemContribuicaoPct > 0 && cur.custosDespFixas > cur.margemContribuicao) score -= 20;
            if (cur.receitaLiquida > 0 && cur.despesasFinanceiras > cur.receitaLiquida * 0.05) score -= 10;
            if (pctDespesasReceita > 90) score -= 10;
        }
        score = Math.max(0, Math.min(100, score));

        // Insights
        const insights = [];
        const p1 = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
        if (cur.lucroLiquido < 0) insights.push({ type: 'alerta', message: `Prejuízo de R$ ${Math.abs(cur.lucroLiquido).toFixed(2)} no período. Margem líquida de ${cur.margemLiquidaPct.toFixed(1)}%.` });
        if (cur.resultadoOperacional < 0) insights.push({ type: 'alerta', message: 'A operação em si (antes de juros e impostos) está no vermelho — o problema não é financeiro, é operacional.' });
        if (cur.margemContribuicaoPct > 0 && cur.margemContribuicaoPct < 25 && cur.receitaLiquida > 0) insights.push({ type: 'alerta', message: `Margem de contribuição de ${cur.margemContribuicaoPct.toFixed(1)}%: cada venda deixa pouco para cobrir os custos fixos.` });
        if (cur.pontoEquilibrio && cur.receitaLiquida > 0 && cur.receitaLiquida < cur.pontoEquilibrio) insights.push({ type: 'alerta', message: `Faturamento abaixo do ponto de equilíbrio (R$ ${cur.pontoEquilibrio.toFixed(2)}). Faltam R$ ${(cur.pontoEquilibrio - cur.receitaLiquida).toFixed(2)} de receita para empatar.` });
        else if (cur.margemSegurancaPct !== null && cur.margemSegurancaPct > 0) insights.push({ type: 'insight', message: `Margem de segurança de ${cur.margemSegurancaPct.toFixed(1)}%: a receita pode cair até esse ponto antes de dar prejuízo.` });
        if (cur.receitaLiquida > 0 && cur.despesasFinanceiras > cur.receitaLiquida * 0.08) insights.push({ type: 'recomendacao', message: 'Despesas financeiras acima de 8% da receita líquida. Vale renegociar dívidas, taxas de maquininha e tarifas.' });
        if (cur.pctCustoFixo > 65 && cur.custosDespFixas > 0) insights.push({ type: 'recomendacao', message: `${cur.pctCustoFixo.toFixed(0)}% dos custos são fixos. Estrutura pesada: uma queda de receita derruba o resultado rápido.` });
        if (momReceita !== null && momReceita < -10) insights.push({ type: 'alerta', message: `Receita líquida caiu ${p1(momReceita)} vs. período anterior.` });
        else if (momReceita !== null && momReceita > 10) insights.push({ type: 'insight', message: `Receita líquida cresceu ${p1(momReceita)} vs. período anterior.` });
        if (momDespesa !== null && momReceita !== null && momDespesa > momReceita + 10) insights.push({ type: 'alerta', message: `Despesas subindo (${p1(momDespesa)}) mais rápido que a receita (${p1(momReceita)}).` });
        if (cur.lucroLiquido > 0 && cur.geracaoCaixa < 0) insights.push({ type: 'alerta', message: 'DRE com lucro mas caixa negativo no período — dinheiro saiu para investimentos, empréstimos ou retiradas.' });
        if (cur.lucroLiquido < 0 && cur.geracaoCaixa > 0) insights.push({ type: 'insight', message: 'Caixa positivo apesar do prejuízo contábil — provavelmente entrou aporte ou empréstimo. Cuidado ao confundir com lucro.' });

        // Resumo executivo
        const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const resumo = [];
        if (cur.receitaBruta > 0) {
            resumo.push(`Receita líquida de ${fmt(cur.receitaLiquida)}${momReceita !== null ? ` (${p1(momReceita)} vs. período anterior)` : ''}.`);
            resumo.push(`Lucro bruto de ${fmt(cur.lucroBruto)} (${cur.margemBrutaPct.toFixed(1)}%) e resultado operacional de ${fmt(cur.resultadoOperacional)} (${cur.margemOperacionalPct.toFixed(1)}%).`);
            resumo.push(cur.lucroLiquido >= 0
                ? `A operação fechou com lucro líquido de ${fmt(cur.lucroLiquido)} — margem de ${cur.margemLiquidaPct.toFixed(1)}%.`
                : `A operação fechou com prejuízo de ${fmt(Math.abs(cur.lucroLiquido))}.`);
            if (cur.pontoEquilibrio) resumo.push(`Ponto de equilíbrio no período: ${fmt(cur.pontoEquilibrio)} de receita líquida.`);
        } else {
            resumo.push('Sem receita registrada no período — cadastre os lançamentos para gerar a análise gerencial.');
        }

        // Projeção linear (ritmo do mês)
        let projecao = null;
        const hoje = new Date();
        if (targetMonth && hoje.getFullYear() === targetYear && hoje.getMonth() + 1 === targetMonth) {
            const diaAtual = Math.max(1, hoje.getDate());
            const diasNoMes = new Date(targetYear, targetMonth, 0).getDate();
            if (diaAtual < diasNoMes) {
                const f = diasNoMes / diaAtual;
                projecao = {
                    receitaLiquida: cur.receitaLiquida * f,
                    despesas: (cur.cmv + cur.despesasOperacionais) * f,
                    resultadoOperacional: cur.resultadoOperacional * f,
                    lucroLiquido: cur.lucroLiquido * f,
                    diaAtual, diasNoMes,
                };
            }
        }

        res.json({
            periodo: { ano: targetYear, mes: targetMonth },
            dre: cur,
            kpis: {
                margemBrutaPct: cur.margemBrutaPct,
                margemOperacionalPct: cur.margemOperacionalPct,
                margemLiquidaPct: cur.margemLiquidaPct,
                margemContribuicaoPct: cur.margemContribuicaoPct,
                pontoEquilibrio: cur.pontoEquilibrio,
                margemSegurancaPct: cur.margemSegurancaPct,
                grauAlavancagem: cur.grauAlavancagem,
                ticketMedio: cur.ticketMedio,
                pctCustoFixo: cur.pctCustoFixo,
                pctDespesasReceita,
                financialHealthScore: score,
            },
            advanced: {
                verticalAnalysis: av,
                horizontalAnalysis: ah,
                composicaoDespesas: composicaoDespesas.map(([label, value]) => ({ label, value, pct: (value / totalComp) * 100 })),
                paretoDespesas: paretoDespesas.slice(0, 10),
                paretoReceitas: paretoReceitas.slice(0, 10),
                fixoVariavel: { fixo: cur.custosDespFixas, variavel: cur.custosDespVariaveis },
                geracaoCaixa: cur.geracaoCaixa,
                lucroLiquidoVal: cur.lucroLiquido,
                resultadoOperacional: cur.resultadoOperacional,
                momReceita, momDespesa,
                insights,
                resumoExecutivo: resumo.join(' '),
                projecao,
            },
        });
    } catch (err) {
        console.error('Analysis Report Error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/reports/forecasts', authenticateToken, async (req, res) => {
    const { year, month } = req.query;
    const userId = req.userId;
    const y = parseInt(year);
    const m = month ? parseInt(month) : null;

    let query = `SELECT f.*, c.name as category_name FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id WHERE f.user_id = $1 AND EXTRACT(YEAR FROM f.date::date) = $2`;
    const params = [userId, y];
    if (m !== null) { 
        query += ` AND EXTRACT(MONTH FROM f.date::date) = $3`; 
        params.push(m + 1); 
    }

    try {
        const { rows } = await pool.query(query, params);
        let summary = { predictedIncome: 0, predictedExpense: 0, realizedIncome: 0, realizedExpense: 0, pendingIncome: 0, pendingExpense: 0 };
        const items = rows.map(r => {
            const val = Number(r.value);
            const isCredit = r.type === 'credito';
            if (isCredit) summary.predictedIncome += val; else summary.predictedExpense += val;
            if (r.realized) {
                if (isCredit) summary.realizedIncome += val; else summary.realizedExpense += val;
            } else {
                if (isCredit) summary.pendingIncome += val; else summary.pendingExpense += val;
            }
            return { ...r, realized: !!r.realized };
        });
        res.json({ summary, items });
    } catch(err) {
        console.error("Forecasts Report Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
});

// Admin Routes (CORREÇÃO DE CRASH - VERSÃO ROBUSTA)
app.get('/api/admin/users', authenticateToken, checkAdmin, (req, res) => {
    db.all("SELECT id, email, cnpj, razao_social, phone, created_at, blocked FROM users ORDER BY created_at DESC", [], (err, rows) => {
        if (err) {
            console.error("DB Error /api/admin/users:", err);
            return res.status(500).json({ error: "Erro ao buscar usuários." });
        }
        try {
            const safeRows = rows || [];
            
            const processed = safeRows.map(r => {
                try {
                    return { 
                        ...r, 
                        cnpj: decrypt(r.cnpj) || r.cnpj, 
                        razao_social: decrypt(r.razao_social) || r.razao_social, 
                        phone: decrypt(r.phone) || r.phone,
                        blocked: !!r.blocked
                    };
                } catch (e) {
                    return r; 
                }
            });
            
            res.json(processed);
        } catch (processError) {
            console.error("Processing Error /api/admin/users:", processError);
            res.status(500).json({ error: "Erro ao processar dados de usuários." });
        }
    });
});
app.put('/api/admin/users/:id/block', authenticateToken, checkAdmin, (req, res) => {
    const { blocked } = req.body;
    db.run("UPDATE users SET blocked = ? WHERE id = ?", [blocked ? 1 : 0, req.params.id], function(err) {
        if(err) return res.status(500).json({error: err.message});
        invalidateBlockedCache(req.params.id);
        logAudit(getAuditActor(req), blocked ? 'ADMIN_USER_BLOCK' : 'ADMIN_USER_UNBLOCK', `user ${req.params.id}`, req.ip);
        res.json({success: true});
    });
});
// Trilha de auditoria (só admin). Ações sensíveis do contador + logins.
app.get('/api/admin/audit', authenticateToken, checkAdmin, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, action, details, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT $1 OFFSET $2`,
            [limit, offset]);
        const total = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_logs`);
        res.json({ data: rows, total: total.rows[0].n });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/admin/global-data', authenticateToken, checkAdmin, (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users', (err, u) => {
        db.get('SELECT COUNT(*) as count, SUM(value) as totalValue FROM transactions', (err, t) => {
            res.json({ users: u, transactions: t });
        });
    });
});
app.get('/api/admin/audit-signups', authenticateToken, checkAdmin, async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    try {
        const { rows } = await pool.query(`SELECT id, email, razao_social, created_at FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
        const totalRes = await pool.query(`SELECT COUNT(*) as total FROM users WHERE role != 'admin'`);
        
        const processed = rows.map(r => ({ ...r, razao_social: decrypt(r.razao_social) || r.razao_social }));
        res.json({ data: processed, total: Number(totalRes.rows[0].total) });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/admin/banks', authenticateToken, checkAdmin, (req, res) => {
    db.all('SELECT * FROM global_banks ORDER BY id DESC', [], (err, rows) => res.json(rows || []));
});
app.post('/api/admin/banks', authenticateToken, checkAdmin, (req, res) => {
    const { name, logoData } = req.body;
    let logoPath = '/logo/caixaf.png';
    if (logoData && logoData.startsWith('data:image')) {
        const saved = saveBankLogo(logoData);
        if (!saved) return res.status(400).json({ error: 'Logo inválido (use PNG, JPG ou WebP até 512 KB).' });
        logoPath = saved;
    } else if (typeof logoData === 'string' && /^\/logo\/[\w.-]+$/.test(logoData)) {
        logoPath = logoData;
    }
    db.run('INSERT INTO global_banks (name, logo) VALUES (?, ?)', [name, logoPath], function(err) {
        logAudit(getAuditActor(req), 'ADMIN_BANK_CREATE', name, req.ip);
        res.json({ id: this.lastID, name, logo: logoPath });
    });
});
app.put('/api/admin/banks/:id', authenticateToken, checkAdmin, (req, res) => {
    const { name, logoData } = req.body;
    db.get('SELECT * FROM global_banks WHERE id = ?', [req.params.id], (err, row) => {
        if(!row) return res.status(404).json({error: "Not found"});
        let logoPath = row.logo;
        if (logoData && logoData.startsWith('data:image')) {
            const saved = saveBankLogo(logoData);
            if (!saved) return res.status(400).json({ error: 'Logo inválido (use PNG, JPG ou WebP até 512 KB).' });
            logoPath = saved;
        }
        db.run('UPDATE global_banks SET name = ?, logo = ? WHERE id = ?', [name, logoPath, req.params.id], function(err) {
            db.run('UPDATE banks SET name = ?, logo = ? WHERE name = ?', [name, logoPath, row.name]);
            logAudit(getAuditActor(req), 'ADMIN_BANK_UPDATE', `${req.params.id} ${name}`, req.ip);
            res.json({ success: true });
        });
    });
});
app.delete('/api/admin/banks/:id', authenticateToken, checkAdmin, (req, res) => {
    db.run('DELETE FROM global_banks WHERE id = ?', [req.params.id], (err) => {
        logAudit(getAuditActor(req), 'ADMIN_BANK_DELETE', String(req.params.id), req.ip);
        res.json({ success: !err });
    });
});
app.get('/api/admin/users/:id/full-data', authenticateToken, checkAdmin, (req, res) => {
    const userId = req.params.id;
    const p1 = new Promise((resolve) => db.all(`SELECT t.*, c.name as category_name, b.name as bank_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN banks b ON t.bank_id = b.id WHERE t.user_id = ? ORDER BY t.date DESC`, [userId], (err, r) => resolve(r)));
    const p2 = new Promise((resolve) => db.all(`SELECT f.*, c.name as category_name FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id WHERE f.user_id = ?`, [userId], (err, r) => resolve(r)));
    const p3 = new Promise((resolve) => db.all(`SELECT * FROM ofx_imports WHERE user_id = ?`, [userId], (err, r) => resolve(r)));
    Promise.all([p1, p2, p3]).then(([transactions, forecasts, ofxImports]) => res.json({ transactions, forecasts, ofxImports }));
});
app.delete('/api/admin/users/:id', authenticateToken, checkAdmin, async (req, res) => {
    const id = req.params.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tables = ['transactions', 'forecasts', 'credit_cards', 'banks', 'categories', 'ofx_imports', 'keyword_rules'];
        for (const t of tables) {
            await client.query(`DELETE FROM ${t} WHERE user_id = $1`, [id]);
        }
        await client.query("DELETE FROM users WHERE id = $1", [id]);
        await client.query('COMMIT');
        invalidateBlockedCache(id);
        logAudit(getAuditActor(req), 'ADMIN_USER_DELETE', `user ${id} + todos os dados`, req.ip);
        res.json({success: true});
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Admin user delete error:", e.stack);
        res.status(500).json({success: false, error: e.message});
    } finally {
        client.release();
    }
});

// START
async function startServer() {
    if (!IS_PROD) {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa'
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        if (ADMIN_EMAIL) console.log(`Admin ativo para: ${ADMIN_EMAIL}`);
    });
}
startServer();
