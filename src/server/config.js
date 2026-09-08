import crypto from 'crypto';

// --- CONFIGURAÇÃO DE SEGURANÇA E AMBIENTE ---
export const IS_PROD = process.env.NODE_ENV === 'production';

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

export const JWT_SECRET = requireSecret('JWT_SECRET') || crypto.randomBytes(64).toString('hex');


// Credenciais de Admin
export const ADMIN_EMAIL = (process.env.MAIL_ADMIN || process.env.EMAIL_ADMIN || '').trim();
export const ADMIN_PASSWORD = (process.env.PASSWORD_ADMIN || '').trim();

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
export function encrypt(text) {
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

export function decrypt(text) {
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

export const PORT = process.env.PORT || 3000;

// CORS: allowlist explícita via CORS_ORIGINS (lista separada por vírgula).
export const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

// URL base da aplicação para montar links de e-mail (reset de senha, ativação).
// NUNCA usar req.get('host') — o cliente controla o header Host (poisoning).
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
if (IS_PROD && !APP_URL && corsOrigins.length === 0) {
    console.warn('⚠️  APP_URL não definida — links de e-mail vão usar o header Host (inseguro).');
}
export const appBaseUrl = (req) => APP_URL || corsOrigins[0] || `${req.protocol}://${req.get('host')}`;

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
