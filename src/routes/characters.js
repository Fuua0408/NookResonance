'use strict';

const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

function rowToChar(row) {
  const extra = JSON.parse(row.char_data || '{}');
  return { ...extra, id: row.id, user_id: row.user_id, name: row.name, created_at: row.created_at, updated_at: row.updated_at };
}

// GET /api/characters
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM characters WHERE user_id = ? ORDER BY name ASC'
  ).all(req.user.id);
  res.json(rows.map(rowToChar));
});

// GET /api/characters/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM characters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToChar(row));
});

// POST /api/characters
router.post('/', (req, res) => {
  const body = req.body || {};
  const { name, ...rest } = body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO characters (user_id, name, char_data) VALUES (?, ?, ?)'
  ).run(req.user.id, name, JSON.stringify(rest));

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/characters/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id, char_data FROM characters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const body = req.body || {};
  const { name, ...rest } = body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  // 非管理者はワークフロー・LoRA設定を変更不可 — 既存値を維持
  if (!req.user.is_admin) {
    const prev = JSON.parse(existing.char_data || '{}');
    const pp   = prev.workflow_params || {};
    rest.workflow_id = prev.workflow_id || rest.workflow_id;
    if (rest.workflow_params) {
      rest.workflow_params.quality_tags = pp.quality_tags || null;
      rest.workflow_params.negative     = pp.negative     || null;
      rest.workflow_params.loras        = pp.loras     || [];
      rest.workflow_params.steps        = pp.steps     ?? rest.workflow_params.steps;
      rest.workflow_params.cfg          = pp.cfg       ?? rest.workflow_params.cfg;
      rest.workflow_params.width        = pp.width     ?? rest.workflow_params.width;
      rest.workflow_params.height       = pp.height    ?? rest.workflow_params.height;
      rest.workflow_params.sampler      = pp.sampler   || rest.workflow_params.sampler;
      rest.workflow_params.scheduler    = pp.scheduler || rest.workflow_params.scheduler;
    }
  }

  db.prepare(
    "UPDATE characters SET name = ?, char_data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(name, JSON.stringify(rest), req.params.id, req.user.id);

  res.json({ ok: true });
});

// DELETE /api/characters/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM characters WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
