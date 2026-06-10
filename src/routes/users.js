'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
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

// POST /api/users — ユーザー追加（管理者のみ）
router.post('/', adminMiddleware, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, is_admin, is_advanced) VALUES (?, ?, 0, 0)'
    ).run(username, hash);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch(e) {
    if (e.message && e.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'ユーザー名が既に使われています' });
    }
    throw e;
  }
});

// DELETE /api/users/:id — ユーザー削除（管理者のみ）
router.delete('/:id', adminMiddleware, (req, res) => {
  const userId = Number(req.params.id);
  if (req.user.id === userId) {
    return res.status(400).json({ error: '自分自身は削除できません' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });

  try {
    fs.rmSync(path.join('data', 'cache', String(userId)), { recursive: true, force: true });
  } catch(e) {
    console.warn('[NR] cache dir removal failed:', e.message);
  }
  try {
    const comfyOut = process.env.COMFY_OUTPUT_DIR || '';
    if (comfyOut) {
      fs.rmSync(path.join(comfyOut, 'nookresonance', String(userId)), { recursive: true, force: true });
    }
  } catch(e) {
    console.warn('[NR] comfy output dir removal failed:', e.message);
  }

  res.json({ ok: true });
});

module.exports = router;
