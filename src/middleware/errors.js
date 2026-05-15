// 404 for unknown routes
function notFound(req, res) {
  res.status(404).json({ message: 'Not Found' });
}

// Catch-all error handler. Async route errors hit this via `next(err)`.
function errorHandler(err, req, res, _next) {
  // Postgres unique violation
  if (err && err.code === '23505') {
    return res.status(409).json({ message: 'Resource already exists' });
  }
  // Postgres invalid UUID
  if (err && err.code === '22P02') {
    return res.status(400).json({ message: 'Invalid id format' });
  }
  // JSON parse error from express.json()
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
}

// Async route wrapper so we don't need try/catch in every handler
function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { notFound, errorHandler, asyncH };
