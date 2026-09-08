import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, encrypt, decrypt, sha256, appBaseUrl } from '../config.js';
import { logAudit } from '../services/audit.js';
import { sendEmail } from '../services/mailer.js';
import { INITIAL_CATEGORIES_SEED } from '../schema.js';
import {
    createSession,
    rotateSession,
    revokeSessionByRefreshToken,
    revokeAllSessionsForUser,
    RefreshError,
} from '../services/session.js';

const uaOf = (req) => String(req.headers['user-agent'] || '').slice(0, 400);

export default function register(app) {
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const inputEmail = (email || '').trim();
    const inputPass = (password || '').trim();

    if (ADMIN_EMAIL && ADMIN_PASSWORD && inputEmail === ADMIN_EMAIL && inputPass === ADMIN_PASSWORD) {
        logAudit('0', 'LOGIN_ADMIN', 'Acesso Admin', req.ip);
        return createSession({ id: 0, email: inputEmail, role: 'admin' }, { userAgent: uaOf(req), ip: req.ip })
            .then(({ token, refreshToken, expiresIn }) => res.json({
                token, refreshToken, expiresIn,
                user: { id: 0, email: inputEmail, razaoSocial: 'Administrador', role: 'admin' },
            }))
            .catch((e) => { console.error('login admin session error:', e.message); res.status(500).json({ error: 'Erro ao iniciar sessão.' }); });
    }

    db.get('SELECT * FROM users WHERE email = ?', [inputEmail], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Credenciais inválidas" });
        if (!bcrypt.compareSync(inputPass, user.password)) return res.status(401).json({ error: "Credenciais inválidas" });

        try {
            const { token, refreshToken, expiresIn } = await createSession(
                { id: user.id, email: user.email, role: user.role || 'user' },
                { userAgent: uaOf(req), ip: req.ip },
            );
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
            console.error('login session error:', e.message);
            res.status(500).json({ error: 'Erro ao iniciar sessão.' });
        }
    });
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
            [bcrypt.hashSync(newPassword, 10), user.id], () => {
                // Senha trocada: derruba todas as sessões existentes desse usuário.
                revokeAllSessionsForUser(user.id).catch(e => console.error('revoke on reset:', e.message));
                res.json({ success: true });
            });
    });
});
}
