import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';

import { IS_PROD, PORT, ADMIN_EMAIL, corsOrigins } from './src/server/config.js';
import { runMigrations } from './src/server/migrate.js';
import { mountLogos } from './src/server/services/logo.js';
import { purgeExpiredSessions } from './src/server/services/session.js';
import { apiLimiter, loginLimiter, flowLimiter, refreshLimiter } from './src/server/middleware/rateLimit.js';

import registerAuthRoutes from './src/server/routes/auth.routes.js';
import registerBankRoutes from './src/server/routes/banks.routes.js';
import registerCategoryRoutes from './src/server/routes/categories.routes.js';
import registerTransactionRoutes from './src/server/routes/transactions.routes.js';
import registerForecastRoutes from './src/server/routes/forecasts.routes.js';
import registerOfxRoutes from './src/server/routes/ofx.routes.js';
import registerKeywordRuleRoutes from './src/server/routes/keywordRules.routes.js';
import registerIntegrationRoutes from './src/server/routes/integration.routes.js';
import registerReportRoutes from './src/server/routes/reports.routes.js';
import registerPlanningRoutes from './src/server/routes/planning.routes.js';
import registerBudgetRoutes from './src/server/routes/budgets.routes.js';
import registerAdminRoutes from './src/server/routes/admin.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);

// CSP: só em produção (o dev server do Vite usa inline script + eval).
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

// Sem CORS_ORIGINS: em produção nega qualquer Origin cross-site; em dev libera geral.
app.use(cors({
    origin(origin, cb) {
        if (!origin) return cb(null, true);              // apps nativas / curl / same-origin
        if (!IS_PROD && corsOrigins.length === 0) return cb(null, true);
        return cb(null, corsOrigins.includes(origin));
    },
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/', apiLimiter);
app.use('/api/login', loginLimiter);
app.use('/api/auth/refresh', refreshLimiter);
app.use(['/api/recover-password', '/api/reset-password-confirm'], loginLimiter);
app.use(['/api/request-signup', '/api/complete-signup', '/api/validate-signup-token'], flowLimiter);

mountLogos(app);

// --- ROTAS ---
registerAuthRoutes(app);
registerBankRoutes(app);
registerCategoryRoutes(app);
registerTransactionRoutes(app);
registerForecastRoutes(app);
registerOfxRoutes(app);
registerKeywordRuleRoutes(app);
registerIntegrationRoutes(app);
registerReportRoutes(app);
registerPlanningRoutes(app);
registerBudgetRoutes(app);
registerAdminRoutes(app);

// START
async function startServer() {
    // Migrations versionadas (src/server/migrations/*.sql). Idempotente e
    // serializado por advisory lock — seguro rodar aqui mesmo que o hook
    // `prestart` já tenha rodado. Em produção, falha = não sobe.
    try {
        await runMigrations();
    } catch (e) {
        console.error('[migrate] falha ao aplicar migrations:', e.message);
        if (IS_PROD) process.exit(1);
        console.warn('[migrate] seguindo mesmo assim (dev)');
    }
    purgeExpiredSessions();

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
