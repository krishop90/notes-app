require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { notFound, errorHandler } = require('./src/middleware/errors');
const authRoutes = require('./src/routes/auth');
const notesRoutes = require('./src/routes/notes');
const metaRoutes = require('./src/routes/meta');
const openapi = require('./src/openapi');

const app = express();

// Trust proxy so rate limiting + IPs work behind Render/Railway/Fly
app.set('trust proxy', 1);

// ---------- middleware ----------
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '256kb' }));

// Rate limit auth endpoints to slow down brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, try again later' },
});
app.use(['/login', '/register'], authLimiter);

// ---------- routes ----------
app.use('/', authRoutes);
app.use('/notes', notesRoutes);
app.use('/', metaRoutes);

app.get('/openapi.json', (req, res) => res.json(openapi));

// ---------- static frontend ----------
// Serve the SPA from /public. The frontend talks to the same origin,
// so no extra deploy is needed.
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 404 + errors ----------
app.use(notFound);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = app.listen(PORT, () => {
  console.log(`Notes app listening on :${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
