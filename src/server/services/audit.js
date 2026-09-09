import { pool } from '../db.js';

// Trilha de auditoria. Fire-and-forget — nunca deixa o log derrubar a request.
export function logAudit(userId, action, details, ip) {
    pool.query(
        `INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [String(userId), action, String(details || '').slice(0, 500), ip, new Date().toISOString()],
    ).catch((e) => console.error('logAudit:', e.message));
}
// Identifica quem fez a ação (admin = id 0 + e-mail; usuário comum = id).
export const getAuditActor = (req) => (req.user?.role === 'admin' ? `admin:${req.user.email || 0}` : String(req.userId));
