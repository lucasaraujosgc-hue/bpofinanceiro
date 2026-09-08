import { rateLimit } from 'express-rate-limit';

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
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
