import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

// Chave do rate-limit global: por USUÁRIO autenticado, não por IP.
// Motivo: atrás de NAT corporativo / CGNAT de operadora, vários usuários dividem
// o mesmo IP. Com chave por IP, um único usuário fazendo uma rajada (ex.: uma
// importação de extrato antiga, 1 request por lançamento) estourava a cota e
// derrubava todo mundo daquele IP — inclusive o /api/login. Com chave por
// usuário, cada conta tem seu próprio balde; sem token válido, cai no IP.
function userOrIp(req) {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (token) {
        try {
            const d = jwt.verify(token, JWT_SECRET);
            if (d && d.id != null) return `u:${d.id}`;
        } catch { /* token inválido/expirado → cai no IP */ }
    }
    return `ip:${req.ip}`;
}

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1200,                 // folgado: uso normal fica em dezenas; operações em massa usam endpoints /bulk
    keyGenerator: userOrIp,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente mais tarde." },
});

// Limites mais apertados nos endpoints sensíveis (brute force / bombardeio de e-mail).
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
});
export const flowLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 15,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas solicitações. Tente novamente mais tarde." },
});

// Rotação de sessão: legítimo é ~1 a cada 15 min por aba. Folga para várias
// abas, apertado o bastante contra quem martela refresh tokens roubados.
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 40,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Muitas renovações de sessão. Aguarde alguns minutos." },
});
