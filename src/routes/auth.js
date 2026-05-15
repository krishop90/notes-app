const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign } = require('../middleware/auth');
const { asyncH } = require('../middleware/errors');

const router = express.Router();

// Simple email regex - good enough for validation, not for verification.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body) {
  if (!body || typeof body !== 'object') return 'Missing JSON body';
  const { email, password } = body;
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'Invalid email';
  }
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > 200) return 'Password too long';
  return null;
}

// POST /register
router.post(
  '/register',
  asyncH(async (req, res) => {
    const err = validateCredentials(req.body);
    if (err) return res.status(400).json({ message: err });

    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const existing = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = $1',
      [email]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email, hash]
    );

    res.status(201).json({ message: 'User registered successfully' });
  })
);

// POST /login
router.post(
  '/login',
  asyncH(async (req, res) => {
    const err = validateCredentials(req.body);
    // For login we always return generic 401 to avoid leaking which field is wrong.
    if (err) return res.status(401).json({ message: 'Invalid email or password' });

    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const result = await db.query(
      'SELECT id, email, password_hash FROM users WHERE LOWER(email) = $1',
      [email]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = sign({ sub: user.id, email: user.email });
    res.status(200).json({ access_token: token });
  })
);

module.exports = router;
