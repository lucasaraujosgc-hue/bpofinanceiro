import pkg from 'pg';

const { Pool, types } = pkg;
// NUMERIC (oid 1700) volta como string por padrão — parseia p/ number.
types.setTypeParser(1700, (val) => parseFloat(val));

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error("Unexpected error on Postgres idle client", err.stack);
});
pool.query('SELECT NOW()', (err) => {
    if (err) console.error("Database connection problem:", err.message);
    else console.log("Database connected to Postgres.");
});
