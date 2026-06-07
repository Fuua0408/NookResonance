'use strict';

const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

function rowToWf(row) {
  const extra = JSON.parse(row.wf_data || '{}');
  return { ...extra, id: row.id, name: row.name, created_at: row.created_at, updated_at: row.updated_at };
}

// GET /api/workflows
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM workflows ORDER BY name ASC').all();
  res.json(rows.map(rowToWf));
});

// GET /api/workflows/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToWf(row));
});

// POST /api/workflows (admin only)
router.post('/', adminMiddleware, (req, res) => {
  const body = req.body || {};
  const { name, ...rest } = body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO workflows (name, wf_data) VALUES (?, ?)'
  ).run(name, JSON.stringify(rest));

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/workflows/:id (admin only)
router.put('/:id', adminMiddleware, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM workflows WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const body = req.body || {};
  const { name, ...rest } = body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare(
    "UPDATE workflows SET name = ?, wf_data = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, JSON.stringify(rest), req.params.id);

  res.json({ ok: true });
});

// DELETE /api/workflows/:id (admin only)
router.delete('/:id', adminMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
