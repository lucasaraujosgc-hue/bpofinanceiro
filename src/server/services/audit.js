import { db } from '../db.js';

// Trilha de auditoria
export function logAudit(userId, action, details, ip) {
    db.run(`INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)`,
        [String(userId), action, String(details || '').slice(0, 500), ip, new Date().toISOString()]);
}
// Identifica quem fez a ação (admin = id 0 + e-mail; usuário comum = id).
export const getAuditActor = (req) => (req.user?.role === 'admin' ? `admin:${req.user.email || 0}` : String(req.userId));
