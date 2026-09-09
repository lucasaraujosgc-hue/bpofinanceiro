import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, encrypt, decrypt, sha256, appBaseUrl } from '../config.js';
import { logAudit } from '../services/audit.js';
import { sendEmail } from '../services/mailer.js';
import { seedUserCategories } from '../lib/categorySeed.js';
import {
    createSession,
    rotateSession,
    revokeSessionByRefreshToken,
    revokeAllSessionsForUser,
    RefreshError,
} from '../services/session.js';
import { validateBody } from '../middleware/validate.js';
import {
    loginSchema,
    requestSignupSchema,
    completeSignupSchema,
    recoverPasswordSchema,
    resetPasswordConfirmSchema,
} from '../schemas.js';

const uaOf = (req) => String(req.headers['user-agent'] || '').slice(0, 400);
const SIGNUP_TTL_MS = 72 * 60 * 60 * 1000; // link de ativação expira em 72h

export default function register(app) {
app.post('/api/login', validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body;
    const inputEmail = (email || '').trim();
    const inputPass = (password || '').trim();

    try {
        if (ADMIN_EMAIL && ADMIN_PASSWORD && inputEmail === ADMIN_EMAIL && inputPass === ADMIN_PASSWORD) {
            logAudit('0', 'LOGIN_ADMIN', 'Acesso Admin', req.ip);
            const { token, refreshToken, expiresIn } = await createSession(
                { id: 0, email: inputEmail, role: 'admin' }, { userAgent: uaOf(req), ip: req.ip });
            return res.json({
                token, refreshToken, expiresIn,
                user: { id: 0, email: inputEmail, razaoSocial: 'Administrador', role: 'admin' },
            });
        }

        const { rows: [user] } = await pool.query('SELECT * FROM users WHERE email = $1', [inputEmail]);
        if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
        if (!bcrypt.compareSync(inputPass, user.password)) return res.status(401).json({ error: "Credenciais inválidas" });

        const { token, refreshToken, expiresIn } = await createSession(
            { id: user.id, email: user.email, role: user.role || 'user' },
            { userAgent: uaOf(req), ip: req.ip });
        logAudit(user.id, 'LOGIN', 'Sucesso', req.ip);
        res.json({
            token, refreshToken, expiresIn,
            user: {
                id: user.id,
                email: user.email,
                razaoSocial: decrypt(user.razao_social),
                cnpj: decrypt(user.cnpj),
                role: user.role,
                blocked: user.blocked,
            },
        });
    } catch (e) {
        console.error('login error:', e.message);
        res.status(500).json({ error: 'Erro ao iniciar sessão.' });
    }
});

// Renova o par access/refresh. Rotaciona o refresh e detecta reuso.
// Um único 401 genérico para toda falha (desconhecido / revogado / expirado / reuso).
app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = String(req.body?.refreshToken || '');
    if (!refreshToken) return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.', code: 'refresh_invalid' });
    try {
        const tokens = await rotateSession(refreshToken, { userAgent: uaOf(req), ip: req.ip });
        res.json(tokens);
    } catch (err) {
        if (err instanceof RefreshError) {
            return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.', code: 'refresh_invalid' });
        }
        console.error('refresh error:', err.message);
        res.status(500).json({ error: 'Erro ao renovar sessão.' });
    }
});

// Logout — revoga a sessão do refresh apresentado. Idempotente.
app.post('/api/auth/logout', async (req, res) => {
    const refreshToken = String(req.body?.refreshToken || '');
    if (refreshToken) {
        try { await revokeSessionByRefreshToken(refreshToken); }
        catch (err) { console.warn('logout: revoke falhou:', err.message); }
    }
    res.json({ success: true });
});

app.post('/api/request-signup', validateBody(requestSignupSchema), async (req, res) => {
    const { email, cnpj, razaoSocial, phone, businessType } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    try {
        const { rows: [existing] } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing) return res.status(400).json({ error: "Email já cadastrado." });

        await pool.query(
            `INSERT INTO pending_signups (email, token, cnpj, razao_social, phone, business_type, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (email) DO UPDATE SET token=EXCLUDED.token, cnpj=EXCLUDED.cnpj,
                razao_social=EXCLUDED.razao_social, phone=EXCLUDED.phone,
                business_type=EXCLUDED.business_type, created_at=EXCLUDED.created_at`,
            [email, token, encrypt(cnpj), encrypt(razaoSocial), encrypt(phone), businessType || 'servico', Date.now()],
        );

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
    } catch (err) {
        console.error('POST /request-signup error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/validate-signup-token/:token', async (req, res) => {
    try {
        const { rows: [row] } = await pool.query(
            "SELECT * FROM pending_signups WHERE token = $1 AND created_at > $2",
            [req.params.token, Date.now() - SIGNUP_TTL_MS]);
        if (!row) return res.status(404).json({ error: "Link inválido ou expirado." });
        res.json({ email: row.email, razaoSocial: decrypt(row.razao_social) });
    } catch (err) {
        console.error('GET /validate-signup-token error:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/api/complete-signup', validateBody(completeSignupSchema), async (req, res) => {
    const { token, password } = req.body;
    try {
        const { rows: [pending] } = await pool.query(
            "SELECT * FROM pending_signups WHERE token = $1 AND created_at > $2",
            [token, Date.now() - SIGNUP_TTL_MS]);
        if (!pending) return res.status(400).json({ error: "Link inválido ou expirado." });

        const hash = bcrypt.hashSync(password, 10);
        const { rows: [user] } = await pool.query(
            `INSERT INTO users (email, password, cnpj, razao_social, phone, business_type, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [pending.email, hash, pending.cnpj, pending.razao_social, pending.phone, pending.business_type || 'servico', new Date().toISOString()]);

        await seedUserCategories(user.id);
        await pool.query("DELETE FROM pending_signups WHERE email = $1", [pending.email]);
        logAudit(user.id, 'SIGNUP', 'Completo', req.ip);
        res.json({ success: true });
    } catch (err) {
        console.error('POST /complete-signup error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recover-password', validateBody(recoverPasswordSchema), async (req, res) => {
    const { email } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    try {
        // Guarda só o hash do token — vazamento de DB não permite tomar contas.
        const { rowCount } = await pool.query(
            "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3",
            [sha256(token), Date.now() + 3600000, email]);
        if (rowCount > 0) {
            const link = `${appBaseUrl(req)}/?action=reset&token=${token}`;
            const html = `<p>Recebemos um pedido para redefinir sua senha.</p>
                <p><a href="${link}">Clique aqui para criar uma nova senha</a> (o link vale 1 hora).</p>
                <p>Se não foi você, ignore este e-mail.</p>`;
            await sendEmail(email, "Recuperação de Senha - Vírgula Contábil", html);
        }
    } catch (err) {
        console.error('POST /recover-password error:', err.message);
    }
    // Resposta idêntica exista ou não a conta (não vaza enumeração de e-mail).
    res.json({ message: "Enviado se existir." });
});

app.post('/api/reset-password-confirm', validateBody(resetPasswordConfirmSchema), async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const { rows: [user] } = await pool.query(
            "SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > $2",
            [sha256(token), Date.now()]);
        if (!user) return res.status(400).json({ error: "Link inválido ou expirado." });

        await pool.query(
            "UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
            [bcrypt.hashSync(newPassword, 10), user.id]);
        // Senha trocada: derruba todas as sessões existentes desse usuário.
        revokeAllSessionsForUser(user.id).catch(e => console.error('revoke on reset:', e.message));
        res.json({ success: true });
    } catch (err) {
        console.error('POST /reset-password-confirm error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
}
