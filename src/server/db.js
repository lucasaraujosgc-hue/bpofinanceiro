import pkg from 'pg';

const { Pool, types } = pkg;
types.setTypeParser(1700, function(val) {
  return parseFloat(val);
});

// --- DATABASE SETUP ---
export const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error("Unexpected error on Postgres idle client", err.stack);
});
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error("Database connection problem:", err.message);
    else console.log("Database connected to Postgres.");
});

// Postgres mock for SQLite db interface to minimize file rewrites
export const db = {
  _convertQuery: function(sql) {
    let i = 1;
    let converted = sql.replace(/\?/g, () => '$' + (i++));
    converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    converted = converted.replace(/\bINTEGER\b/g, 'INT');
    converted = converted.replace(/\bREAL\b/g, 'NUMERIC(15,2)');
    return converted;
  },
  run: function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    let pgSql = this._convertQuery(sql);
    let isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING') && !pgSql.includes('pending_signups')) {
        pgSql += ' RETURNING id';
    }

    pool.query(pgSql, params || [])
      .then(res => {
         let context = { changes: res.rowCount || 0 };
         if (isInsert && res.rows && res.rows.length > 0 && res.rows[0].id) {
             context.lastID = res.rows[0].id;
         }
         if (callback) callback.call(context, null);
      })
      .catch(err => {
         console.error("DB Run Error:", err.code || err.message, "|", pgSql.slice(0, 120));
         if (callback) callback(err);
      });
  },
  all: function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(this._convertQuery(sql), params || [])
      .then(res => callback && callback(null, res.rows))
      .catch(err => {
          console.error("DB All Error:", err.code || err.message, "|", this._convertQuery(sql).slice(0, 120));
          if(callback) callback(err, null);
      });
  },
  get: function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(this._convertQuery(sql), params || [])
      .then(res => {
         let row = res.rows[0];
         if (row && row.count !== undefined && typeof row.count === 'string') row.count = parseInt(row.count, 10);
         if (callback) callback(null, row);
      })
      .catch(err => {
         console.error("DB Get Error:", err.code || err.message, "|", this._convertQuery(sql).slice(0, 120));
         if(callback) callback(err, null);
      });
  },
  serialize: function(fn) {
    // Deprecated adapter flow, bypassed by direct BEGIN/COMMIT logic below where critical.
    fn();
  },
  prepare: function(sql) {
    let pgSql = this._convertQuery(sql);
    let isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING') && !pgSql.includes('pending_signups')) pgSql += ' RETURNING id';
    return {
      run: function(...args) { 
        let params = args;
        let callback = null;
        if(args.length > 0 && typeof args[args.length - 1] === 'function') {
             callback = params.pop();
        }
        pool.query(pgSql, params)
         .then(res => {
            let context = { changes: res.rowCount || 0 };
            if (isInsert && res.rows && res.rows.length > 0 && res.rows[0].id) context.lastID = res.rows[0].id;
            if (callback) callback.call(context, null);
         })
         .catch(err => {
            console.error("DB Prepare Error:", err.code || err.message, "|", pgSql.slice(0, 120));
            if(callback) callback(err);
         });
      },
      finalize: function(cb) { if(cb) cb(); }
    };
  }
};
