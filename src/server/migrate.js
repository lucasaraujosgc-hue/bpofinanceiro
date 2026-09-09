import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

// ---------------------------------------------------------------------------
// Runner de migrations simples (sem ORM). Cada arquivo .sql em migrations/ é
// aplicado uma única vez, dentro de uma transação, e registrado em
// schema_migrations. Rodar de novo é no-op.
//
// Regras para escrever um .sql:
//   - um statement por `;` (o runner separa por `;`);
//   - nada de `;` dentro de string literal;
//   - nada de CREATE INDEX CONCURRENTLY (roda dentro de transação).
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const ADVISORY_LOCK_KEY = 4972113; // arbitrário — serializa runners concorrentes

// Divide um arquivo .sql em statements. Remove comentários de linha (-- ...).
function splitStatements(sql) {
    return sql
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter((line) => !/^\s*--/.test(line))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
}

function listMigrations() {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
}

export async function runMigrations({ silent = false } = {}) {
    const log = (...a) => { if (!silent) console.log('[migrate]', ...a); };
    const client = await pool.connect();
    let locked = false;
    try {
        try {
            await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
            locked = true;
        } catch {
            log('advisory lock indisponível — seguindo sem (ok em processo único)');
        }

        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);

        const { rows } = await client.query('SELECT id FROM schema_migrations');
        const done = new Set(rows.map((r) => r.id));
        const files = listMigrations();
        let applied = 0;

        for (const file of files) {
            const id = file.replace(/\.sql$/, '');
            if (done.has(id)) continue;

            const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
            const statements = splitStatements(raw);
            log(`aplicando ${id} (${statements.length} statements)`);
            try {
                await client.query('BEGIN');
                for (const stmt of statements) await client.query(stmt);
                await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
                await client.query('COMMIT');
                applied++;
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                throw new Error(`migration ${id} falhou: ${e.message}`);
            }
        }

        log(applied ? `${applied} migration(s) aplicada(s)` : 'schema já atualizado');
        return { applied, total: files.length };
    } finally {
        if (locked) await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
        client.release();
    }
}

// Lista os ids de migration ainda não aplicados (sem aplicar nada).
export async function pendingMigrations() {
    let done;
    try {
        const { rows } = await pool.query('SELECT id FROM schema_migrations');
        done = new Set(rows.map((r) => r.id));
    } catch {
        done = new Set(); // tabela ainda não existe → tudo pendente
    }
    return listMigrations()
        .map((f) => f.replace(/\.sql$/, ''))
        .filter((id) => !done.has(id));
}
