'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');

const jwt = require('jsonwebtoken');

const router = express.Router();

// GET 用：Bearer ヘッダーとクエリパラメータ両方を受け付ける認証
function imageAuthMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '..', '..', 'data', 'uploads',
      String(req.user.id), String(req.body.char_id || '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safe = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}_${safe}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter(_req, file, cb) {
    cb(null, ALLOWED_MIME.has(file.mimetype));
  },
});

// POST /api/uploads/image
router.post('/image', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No valid image file' });
  }

  const charId = req.body.char_id;
  if (!charId) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'char_id is required' });
  }

  // char_id が自分のキャラクターか確認
  const db  = getDb();
  const row = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?')
    .get(charId, req.user.id);
  if (!row) {
    fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Forbidden' });
  }

  const url = `/api/uploads/image/${req.user.id}/${charId}/${req.file.filename}`;
  res.json({ url });
});

// GET /api/uploads/image/:userId/:charId/:filename
router.get('/image/:userId/:charId/:filename', imageAuthMiddleware, (req, res) => {
  const { userId, charId, filename } = req.params;

  // 自分のファイルのみ配信
  if (String(req.user.id) !== String(userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // パストラバーサル防止
  const safeFilename = path.basename(filename);
  const filePath = path.join(__dirname, '..', '..', 'data', 'uploads',
    String(userId), String(charId), safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.sendFile(filePath);
});

module.exports = router;
