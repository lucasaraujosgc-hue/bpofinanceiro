import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { JWT_SECRET } from '../config.js';

// Middleware Auth
// Cache curto do status de bloqueio para não bater no banco a cada request.
const blockedCache = new Map(); // userId -> { blocked: boolean, exp: number }
const BLOCKED_TTL_MS = 30_000;

export async function isUserBlocked(userId) {
    const now = Date.now();
    const hit = blockedCache.get(userId);
    if (hit && hit.exp > now) return hit.blocked;
    const { rows } = await pool.query('SELECT blocked FROM users WHERE id = $1', [userId]);
    const blocked = rows.length === 0 ? true : !!rows[0].blocked; // usuário sumido = sem acesso
    blockedCache.set(userId, { blocked, exp: now + BLOCKED_TTL_MS });
    return blocked;
}
export function invalidateBlockedCache(userId) {
    blockedCache.delete(Number(userId));
    blockedCache.delete(String(userId));
}

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token não fornecido." });

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        // 401 (não 403) para o cliente saber que deve renovar via /api/auth/refresh.
        if (err) return res.status(401).json({ error: "Sessão expirada.", code: "token_expired" });
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

export const checkAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado." });
    next();
};
