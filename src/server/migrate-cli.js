// CLI de migrations — usado por `npm run migrate` e pelos hooks pre(start|dev).
// Aplica tudo que estiver pendente e sai. Falha → exit 1 (aborta o deploy).
import 'dotenv/config';
import { runMigrations } from './migrate.js';
import { pool } from './db.js';

try {
    const { applied } = await runMigrations();
    await pool.end();
    process.exit(0);
    void applied;
} catch (e) {
    console.error('[migrate] ERRO:', e.message);
    await pool.end().catch(() => {});
    process.exit(1);
}
