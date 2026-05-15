const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}

// Supabase requires SSL. The pooled connection string handles it,
// but we set rejectUnauthorized:false so self-signed certs in some
// Supabase environments don't blow up.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
