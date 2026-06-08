'use strict';

const express = require('express');
const { getDb } = require('../db');
const { adminMiddleware } = require('../auth');

const router = express.Router();

// GET /api/users — ユーザー一覧（管理者のみ）
router.get('/', adminMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, is_admin, is_advanced FROM users ORDER BY id'
  ).all();
  res.json(users);
});

// PUT /api/users/:id — is_advanced の付与・剥奪（管理者のみ、is_admin は変更不可）
router.put('/:id', adminMiddleware, (req, res) => {
  const { is_advanced } = req.body;
  if (typeof is_advanced !== 'boolean' && typeof is_advanced !== 'number') {
    return res.status(400).json({ error: 'is_advanced required' });
  }
  const db = getDb();
  const result = db.prepare(
    'UPDATE users SET is_advanced = ? WHERE id = ?'
  ).run(is_advanced ? 1 : 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

module.exports = router;
