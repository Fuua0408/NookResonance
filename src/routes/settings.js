'use strict';

const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/settings
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const { key, value } of rows) {
    // "true"/"false" → boolean, "123" → number, その他 → string のまま
    try { obj[key] = JSON.parse(value); } catch { obj[key] = value; }
  }
  res.json(obj);
});

// PUT /api/settings (admin only)
router.put('/', adminMiddleware, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const upsertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value));
    }
  });

  upsertMany(Object.entries(body));
  res.json({ ok: true });
});

module.exports = router;
