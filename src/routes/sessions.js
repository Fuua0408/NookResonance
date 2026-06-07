'use strict';

const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    sessionLimit: parseInt(s.sessionLimit ?? '5', 10),
    sessionTurns: parseInt(s.sessionTurns ?? '50', 10),
  };
}

function ownsChar(db, charId, userId) {
  return db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?').get(charId, userId);
}

function rowToSession(row, includeFullData = false) {
  const meta = JSON.parse(row.session_meta || '{}');
  const turns = JSON.parse(row.turns || '[]');
  const base = {
    id: row.id,
    char_id: row.char_id,
    user_id: row.user_id,
    title: row.title,
    archived: !!row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (!includeFullData) {
    return { ...base, turn_count: turns.length };
  }
  return { ...meta, ...base, turns };
}

function pruneOldSessions(db, charId, userId, limit) {
  const sessions = db.prepare(
    'SELECT id, updated_at FROM sessions WHERE char_id = ? AND user_id = ? AND archived = 0 ORDER BY updated_at ASC'
  ).all(charId, userId);
  if (sessions.length <= limit) return;
  const toDelete = sessions.slice(0, sessions.length - limit);
  const del = db.prepare('DELETE FROM sessions WHERE id = ?');
  for (const s of toDelete) del.run(s.id);
}

// GET /api/sessions/:char_id
router.get('/:char_id', (req, res) => {
  const { char_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const rows = db.prepare(
    'SELECT id, char_id, user_id, title, turns, archived, created_at, updated_at, session_meta FROM sessions WHERE char_id = ? AND user_id = ? ORDER BY updated_at DESC'
  ).all(char_id, req.user.id);

  res.json(rows.map(r => rowToSession(r, false)));
});

// GET /api/sessions/:char_id/:session_id
router.get('/:char_id/:session_id', (req, res) => {
  const { char_id, session_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const row = db.prepare(
    'SELECT * FROM sessions WHERE id = ? AND char_id = ? AND user_id = ?'
  ).get(session_id, char_id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  res.json(rowToSession(row, true));
});

// POST /api/sessions/:char_id
router.post('/:char_id', (req, res) => {
  const { char_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const body = req.body || {};
  const { title, turns, archived, ...meta } = body;
  const { sessionLimit } = getSettings(db);

  const result = db.prepare(
    'INSERT INTO sessions (user_id, char_id, title, turns, session_meta, archived) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    req.user.id, char_id,
    title || '無題のセッション',
    JSON.stringify(turns || []),
    JSON.stringify(meta),
    archived ? 1 : 0
  );

  pruneOldSessions(db, char_id, req.user.id, sessionLimit);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/sessions/:char_id/:session_id
router.put('/:char_id/:session_id', (req, res) => {
  const { char_id, session_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const existing = db.prepare(
    'SELECT * FROM sessions WHERE id = ? AND char_id = ? AND user_id = ?'
  ).get(session_id, char_id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const body = req.body || {};
  const { id: _id, user_id: _uid, char_id: _cid, created_at, updated_at, turn_count, ...rest } = body;
  const { title, turns, archived, ...meta } = rest;
  const { sessionTurns } = getSettings(db);

  let turnsData = turns !== undefined ? turns : JSON.parse(existing.turns);
  if (!existing.archived) {
    turnsData = turnsData.slice(-sessionTurns);
  }

  const newTitle = title !== undefined ? title : existing.title;
  const newArchived = archived !== undefined ? (archived ? 1 : 0) : existing.archived;
  const newMeta = Object.keys(meta).length ? JSON.stringify(meta) : existing.session_meta;

  db.prepare(
    "UPDATE sessions SET title = ?, turns = ?, session_meta = ?, archived = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(newTitle, JSON.stringify(turnsData), newMeta, newArchived, session_id, req.user.id);

  res.json({ ok: true });
});

// DELETE /api/sessions/:char_id/:session_id
router.delete('/:char_id/:session_id', (req, res) => {
  const { char_id, session_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const result = db.prepare(
    'DELETE FROM sessions WHERE id = ? AND char_id = ? AND user_id = ?'
  ).run(session_id, char_id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/sessions/:char_id/:session_id/archive
router.post('/:char_id/:session_id/archive', (req, res) => {
  const { char_id, session_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const result = db.prepare(
    "UPDATE sessions SET archived = 1, updated_at = datetime('now') WHERE id = ? AND char_id = ? AND user_id = ? AND archived = 0"
  ).run(session_id, char_id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or already archived' });
  res.json({ ok: true });
});

// DELETE /api/sessions/:char_id/:session_id/archive
router.delete('/:char_id/:session_id/archive', (req, res) => {
  const { char_id, session_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const result = db.prepare(
    "UPDATE sessions SET archived = 0, updated_at = datetime('now') WHERE id = ? AND char_id = ? AND user_id = ? AND archived = 1"
  ).run(session_id, char_id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or not archived' });

  const { sessionLimit } = getSettings(db);
  pruneOldSessions(db, char_id, req.user.id, sessionLimit);
  res.json({ ok: true });
});

module.exports = router;
