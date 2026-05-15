const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncH } = require('../middleware/errors');
const llm = require('../llm');

const router = express.Router();

// All note routes require auth.
router.use(requireAuth);

// ---------- helpers ---------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => typeof v === 'string' && UUID_RE.test(v);

function validateNotePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return 'Missing JSON body';
  const { title, content } = body;
  if (!partial || title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return 'title is required and must be a non-empty string';
    }
    if (title.length > 200) return 'title too long (max 200 chars)';
  }
  if (content !== undefined) {
    if (typeof content !== 'string') return 'content must be a string';
    if (content.length > 50000) return 'content too long (max 50,000 chars)';
  }
  return null;
}

function hashContent(title, content) {
  return crypto
    .createHash('sha256')
    .update(`${title}\n---\n${content}`)
    .digest('hex');
}

// Fetch note if user owns it OR it's shared with them
async function findAccessibleNote(noteId, userId) {
  const result = await db.query(
    `SELECT n.*,
            (n.user_id = $2) AS is_owner,
            owner_user.email AS owner_email,
            (
              SELECT u2.email
                FROM note_shares ns2
                JOIN users u2 ON u2.id = ns2.shared_by_user_id
               WHERE ns2.note_id = n.id AND ns2.shared_with_user_id = $2
               LIMIT 1
            ) AS shared_by_email
       FROM notes n
       JOIN users owner_user ON owner_user.id = n.user_id
       LEFT JOIN note_shares s
         ON s.note_id = n.id AND s.shared_with_user_id = $2
      WHERE n.id = $1
        AND (n.user_id = $2 OR s.shared_with_user_id IS NOT NULL)
      LIMIT 1`,
    [noteId, userId]
  );
  return result.rows[0] || null;
}

async function loadTags(noteIds) {
  if (noteIds.length === 0) return new Map();
  const result = await db.query(
    `SELECT note_id, tag, source FROM note_tags WHERE note_id = ANY($1::uuid[])`,
    [noteIds]
  );
  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.note_id)) map.set(row.note_id, []);
    map.get(row.note_id).push(row.tag);
  }
  return map;
}

function serializeNote(row, tags = []) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags,
    ...(row.is_owner !== undefined ? { is_owner: row.is_owner } : {}),
    ...(row.owner_email !== undefined ? { owner_email: row.owner_email } : {}),
    ...(row.shared_by_email !== undefined ? { shared_by_email: row.shared_by_email } : {}),
  };
}

// ---------- routes ----------------------------------------------------

// GET /notes - all notes owned by OR shared with the user
router.get(
  '/',
  asyncH(async (req, res) => {
    // Optional pagination
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const result = await db.query(
      `SELECT n.*,
              (n.user_id = $1) AS is_owner,
              owner_user.email AS owner_email,
              (
                SELECT u2.email
                  FROM note_shares ns2
                  JOIN users u2 ON u2.id = ns2.shared_by_user_id
                WHERE ns2.note_id = n.id AND ns2.shared_with_user_id = $1
                LIMIT 1
              ) AS shared_by_email
        FROM notes n
        JOIN users owner_user ON owner_user.id = n.user_id
        LEFT JOIN note_shares s
          ON s.note_id = n.id AND s.shared_with_user_id = $1
        WHERE n.user_id = $1 OR s.shared_with_user_id = $1
        ORDER BY n.updated_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const ids = result.rows.map((r) => r.id);
    const tagMap = await loadTags(ids);
    res.json(result.rows.map((r) => serializeNote(r, tagMap.get(r.id) || [])));
  })
);

// GET /notes/:id
router.get(
  '/:id',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    const note = await findAccessibleNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    const tagMap = await loadTags([note.id]);
    res.json(serializeNote(note, tagMap.get(note.id) || []));
  })
);

// POST /notes
router.post(
  '/',
  asyncH(async (req, res) => {
    const err = validateNotePayload(req.body);
    if (err) return res.status(400).json({ message: err });

    const title = req.body.title.trim();
    const content = (req.body.content || '').toString();

    const result = await db.query(
      `INSERT INTO notes (user_id, title, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, title, content]
    );
    const note = result.rows[0];

    // Best-effort: kick off auto-tag generation. If the user wants
    // it inline we await, but cap it so a slow LLM doesn't stall
    // note creation. Errors are swallowed inside suggestTags().
    const tags = [];

    res.status(201).json(
      serializeNote(
        { ...note, is_owner: true, owner_email: req.user.email, shared_by_email: null },
        tags
      )
    );
  })
);

// PUT /notes/:id - only owner can update

router.put(
  '/:id',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    const err = validateNotePayload(req.body);
    if (err) return res.status(400).json({ message: err });

    const newTitle = req.body.title.trim();
    const newContent = (req.body.content || '').toString();

    const result = await db.query(
      `UPDATE notes
          SET title = $1, content = $2
        WHERE id = $3 AND user_id = $4
        RETURNING *`,
      [newTitle, newContent, req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const note = result.rows[0];

    // If this note has no AI tags yet AND now has substantial content,
    // generate tags. This way the FIRST meaningful save tags the note;
    // later edits don't burn tokens regenerating (use /retag for that).
    const existingTags = await db.query(
      `SELECT COUNT(*)::int AS count FROM note_tags
        WHERE note_id = $1 AND source = 'ai'`,
      [note.id]
    );

    let tags = [];
    if (existingTags.rows[0].count === 0 && llm.enabled()) {
      tags = await llm.suggestTags({ title: newTitle, content: newContent });
      if (tags.length > 0) {
        const values = tags.map((_, i) => `($1, $${i + 2}, 'ai')`).join(',');
        try {
          await db.query(
            `INSERT INTO note_tags (note_id, tag, source) VALUES ${values}
             ON CONFLICT (note_id, tag) DO NOTHING`,
            [note.id, ...tags]
          );
        } catch (e) {
          console.warn('Failed to persist auto-tags:', e.message);
          tags = [];
        }
      }
    } else {
      const tagRows = await db.query(
        'SELECT tag FROM note_tags WHERE note_id = $1 ORDER BY created_at',
        [note.id]
      );
      tags = tagRows.rows.map((r) => r.tag);
    }

    res.json(
      serializeNote(
        { ...note, is_owner: true, owner_email: req.user.email, shared_by_email: null },
        tags
      )
    );
  })
);

// DELETE /notes/:id - only owner can delete
router.delete(
  '/:id',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    const result = await db.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.status(204).end();
  })
);

// POST /notes/:id/share - only owner can share
router.post(
  '/:id/share',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    const target = (req.body && req.body.share_with_email || '').toString().trim().toLowerCase();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return res.status(400).json({ message: 'share_with_email is required and must be a valid email' });
    }

    // Verify the note exists and the requester owns it
    const noteRes = await db.query(
      'SELECT id, user_id FROM notes WHERE id = $1',
      [req.params.id]
    );
    if (noteRes.rowCount === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }
    if (noteRes.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Only the owner can share this note' });
    }

    // Look up the target user
    const userRes = await db.query(
      'SELECT id, email FROM users WHERE LOWER(email) = $1',
      [target]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ message: 'User to share with not found' });
    }
    const targetUser = userRes.rows[0];

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot share a note with yourself' });
    }

    await db.query(
      `INSERT INTO note_shares (note_id, shared_with_user_id, shared_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (note_id, shared_with_user_id) DO NOTHING`,
      [req.params.id, targetUser.id, req.user.id]
    );

    res.status(200).json({ message: `Note shared with ${targetUser.email}` });
  })
);

// ---------- CUSTOM FEATURE: AI summary --------------------------------
// POST /notes/:id/summarize - generate (and cache) a summary
router.post(
  '/:id/summarize',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    if (!llm.enabled()) {
      return res.status(503).json({
        message: 'AI summary is unavailable: server has no GEMINI_API_KEY configured',
      });
    }

    const note = await findAccessibleNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    const hash = hashContent(note.title, note.content);

    // Use cache if content unchanged
    const cached = await db.query(
      'SELECT summary, content_hash, generated_at FROM note_summaries WHERE note_id = $1',
      [note.id]
    );
    if (cached.rowCount > 0 && cached.rows[0].content_hash === hash && !req.query.refresh) {
      return res.json({
        summary: cached.rows[0].summary,
        cached: true,
        generated_at: cached.rows[0].generated_at,
      });
    }

    let summary;
    try {
      summary = await llm.summarize({ title: note.title, content: note.content });
    } catch (e) {
      return res.status(e.status || 502).json({ message: e.message });
    }

    await db.query(
      `INSERT INTO note_summaries (note_id, summary, content_hash, generated_at)
         VALUES ($1, $2, $3, NOW())
       ON CONFLICT (note_id) DO UPDATE
         SET summary = EXCLUDED.summary,
             content_hash = EXCLUDED.content_hash,
             generated_at = NOW()`,
      [note.id, summary, hash]
    );

    res.json({ summary, cached: false, generated_at: new Date().toISOString() });
  })
);

// GET /notes/:id/tags
router.get(
  '/:id/tags',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    const note = await findAccessibleNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    const result = await db.query(
      'SELECT tag, source, created_at FROM note_tags WHERE note_id = $1 ORDER BY created_at',
      [note.id]
    );
    res.json(result.rows);
  })
);


// POST /notes/:id/retag - regenerate AI tags on demand
router.post(
  '/:id/retag',
  asyncH(async (req, res) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    if (!llm.enabled()) {
      return res.status(503).json({
        message: 'AI tagging unavailable: server has no GEMINI_API_KEY configured',
      });
    }

    // Only the owner can regenerate tags
    const noteRes = await db.query(
      'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (noteRes.rowCount === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }
    const note = noteRes.rows[0];

    const tags = await llm.suggestTags({ title: note.title, content: note.content });

    // Replace all existing AI tags atomically
    await db.query(`DELETE FROM note_tags WHERE note_id = $1 AND source = 'ai'`, [note.id]);
    if (tags.length > 0) {
      const values = tags.map((_, i) => `($1, $${i + 2}, 'ai')`).join(',');
      await db.query(
        `INSERT INTO note_tags (note_id, tag, source) VALUES ${values}`,
        [note.id, ...tags]
      );
    }

    res.json({ tags });
  })
);

module.exports = router;
