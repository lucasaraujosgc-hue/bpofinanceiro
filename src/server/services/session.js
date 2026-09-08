import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { JWT_SECRET, sha256 } from '../config.js';

// ---------------------------------------------------------------------------
// Modelo de sessão: access token curto + refresh token rotativo.
//
// - Access token: JWT de vida curta (15 min por padrão). Stateless — o
//   middleware só confere a assinatura. Uma sessão revogada continua válida
//   até o access token expirar; essa janela de ~15 min é o preço de não bater
//   no banco a cada request.
// - Refresh token: string opaca de 256 bits, ~90 dias, guardada APENAS como
//   digest sha256 em auth_sessions. Rotacionado a cada uso: todo
//   /api/auth/refresh emite um refresh novo e lembra o hash do que substituiu.
//   Apresentar um refresh já rotacionado ("reuso") é sinal de roubo — a sessão
//   inteira é revogada.
// ---------------------------------------------------------------------------

// Permite encurtar em testes (ex.: ACCESS_TOKEN_TTL=2s).
export const ACCESS_TTL = (process.env.ACCESS_TOKEN_TTL || '15m').trim();
export const ACCESS_TTL_SECONDS = parseTtlSeconds(ACCESS_TTL);
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias

function parseTtlSeconds(ttl) {
    const m = String(ttl).match(/^(\d+)\s*([smhd])?$/);
    if (!m) return 15 * 60;
    const n = Number(m[1]);
    return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[m[2] || 's']);
}

const newRefreshToken = () => 'vrt_' + crypto.randomBytes(32).toString('base64url');
export const hashRefreshToken = (t) => sha256(String(t).trim());

export class RefreshError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RefreshError';
    }
}

function signAccessToken(subject, sid) {
    return jwt.sign(
        { id: subject.id, email: subject.email, role: subject.role || 'user', sid, typ: 'access' },
        JWT_SECRET,
        { expiresIn: ACCESS_TTL },
    );
}

// Login novo → linha de sessão nova → primeiro par access/refresh.
export async function createSession(subject, { userAgent, ip } = {}) {
    const refreshToken = newRefreshToken();
    const { rows } = await pool.query(
        `INSERT INTO auth_sessions (user_id, role, email, refresh_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
            String(subject.id),
            subject.role || 'user',
            subject.email || null,
            hashRefreshToken(refreshToken),
            (userAgent || '').slice(0, 400) || null,
            ip || null,
            new Date(Date.now() + REFRESH_TTL_MS),
        ],
    );
    return {
        token: signAccessToken(subject, String(rows[0].id)),
        refreshToken,
        expiresIn: ACCESS_TTL_SECONDS,
    };
}

// /api/auth/refresh: valida + rotaciona. Lança RefreshError em qualquer falha
// (a rota mapeia todo RefreshError para um 401 genérico).
export async function rotateSession(refreshToken, { userAgent, ip } = {}) {
    const presented = hashRefreshToken(refreshToken);

    // Detecção de reuso: esse token já foi rotacionado para fora de alguma sessão.
    const { rows: reused } = await pool.query(
        `SELECT id, revoked_at FROM auth_sessions WHERE previous_refresh_hash = $1 LIMIT 1`,
        [presented],
    );
    if (reused.length) {
        if (!reused[0].revoked_at) {
            await pool.query(`UPDATE auth_sessions SET revoked_at = now() WHERE id = $1`, [reused[0].id]);
        }
        throw new RefreshError('refresh token reuse detected');
    }

    const { rows } = await pool.query(
        `SELECT * FROM auth_sessions WHERE refresh_hash = $1 LIMIT 1`,
        [presented],
    );
    const session = rows[0];
    if (!session) throw new RefreshError('unknown refresh token');
    if (session.revoked_at) throw new RefreshError('session revoked');
    if (new Date(session.expires_at).getTime() < Date.now()) throw new RefreshError('session expired');

    const nextRefresh = newRefreshToken();
    await pool.query(
        `UPDATE auth_sessions
            SET refresh_hash = $1, previous_refresh_hash = $2, last_used_at = now(),
                user_agent = COALESCE($3, user_agent), ip_address = COALESCE($4, ip_address)
          WHERE id = $5`,
        [hashRefreshToken(nextRefresh), presented, (userAgent || '').slice(0, 400) || null, ip || null, session.id],
    );

    const subject = { id: session.user_id, email: session.email, role: session.role };
    return {
        token: signAccessToken(subject, String(session.id)),
        refreshToken: nextRefresh,
        expiresIn: ACCESS_TTL_SECONDS,
    };
}

// Idempotente — logout. Casa com o refresh atual ou com o que ele acabou de
// rotacionar, então um logout em corrida com um refresh ainda acerta.
export async function revokeSessionByRefreshToken(refreshToken) {
    const presented = hashRefreshToken(refreshToken);
    await pool.query(
        `UPDATE auth_sessions SET revoked_at = now()
          WHERE (refresh_hash = $1 OR previous_refresh_hash = $1) AND revoked_at IS NULL`,
        [presented],
    );
}

// Mata todas as sessões de um usuário — reset de senha, bloqueio, exclusão.
export async function revokeAllSessionsForUser(userId) {
    await pool.query(
        `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [String(userId)],
    );
}

// Limpeza oportunista de linhas velhas (chamada no boot).
export async function purgeExpiredSessions() {
    try {
        await pool.query(
            `DELETE FROM auth_sessions
              WHERE expires_at < now() - interval '7 days'
                 OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`,
        );
    } catch (e) {
        console.error('purgeExpiredSessions:', e.message);
    }
}
