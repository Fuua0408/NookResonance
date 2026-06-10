'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { authMiddleware } = require('../auth');
const { getDb } = require('../db');

const router = express.Router();
router.use(authMiddleware);

const THUMB_SIZE = 200;
const COMFY_APP_SUBFOLDER = 'nookresonance';

function getComfySettings() {
  return { comfyUrl: (process.env.COMFY_URL || '').replace(/\/$/, '') };
}

function getCacheDir(userId, charId) {
  return path.join('data', 'cache', String(userId), String(charId), 'thumbs');
}

function getMetaPath(userId, charId) {
  return path.join('data', 'cache', String(userId), String(charId), 'meta.json');
}

function readMeta(metaPath) {
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return {}; }
}

function writeMeta(metaPath, meta) {
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

function listSourceImages(userId, charId) {
  const outputDir = (process.env.COMFY_OUTPUT_DIR || '').replace(/[/\\]+$/, '');
  if (!outputDir) return [];
  const charDir = path.join(outputDir, COMFY_APP_SUBFOLDER, String(userId), String(charId));
  if (!fs.existsSync(charDir)) return [];
  return fs.readdirSync(charDir)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .map(f => ({ basename: f, srcPath: path.join(charDir, f) }));
}

function buildComfyViewUrl(comfyUrl, userId, charId, basename) {
  const subfolder = `${COMFY_APP_SUBFOLDER}/${userId}/${charId}`;
  return `${comfyUrl}/view?filename=${encodeURIComponent(basename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
}

async function generateThumb(srcPath, thumbPath) {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  await sharp(srcPath)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);
}

function ownsChar(db, charId, userId) {
  return db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?').get(charId, userId);
}

// GET /api/images/cache/count/:char_id
router.get('/cache/count/:char_id', (req, res) => {
  const { char_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const thumbsDir = getCacheDir(req.user.id, char_id);
  const metaPath = getMetaPath(req.user.id, char_id);
  const meta = readMeta(metaPath);
  const removedFiles = meta.removed_files || [];
  const removedStems = new Set(removedFiles.map(filename => path.parse(filename).name));

  const count = fs.existsSync(thumbsDir)
    ? fs.readdirSync(thumbsDir)
        .filter(f => f.toLowerCase().endsWith('.jpg'))
        .filter(f => !removedStems.has(path.parse(f).name))
        .length
    : 0;

  res.json({ count });
});

// GET /api/images/:char_id
router.get('/:char_id', async (req, res) => {
  const { char_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const { comfyUrl } = getComfySettings();
  const thumbsDir = getCacheDir(req.user.id, char_id);
  const metaPath = getMetaPath(req.user.id, char_id);
  const meta = readMeta(metaPath);
  const removedFiles = meta.removed_files || [];

  const images = listSourceImages(req.user.id, char_id);
  const list = [];

  for (const img of images) {
    if (removedFiles.includes(img.basename)) continue;
    const stem = path.parse(img.basename).name;
    const thumbPath = path.join(thumbsDir, `${stem}.jpg`);

    if (!fs.existsSync(thumbPath)) {
      try { await generateThumb(img.srcPath, thumbPath); } catch { /* skip */ }
    }

    const thumbUrl = fs.existsSync(thumbPath)
      ? `/api/images/cache/${char_id}/thumbs/${stem}.jpg`
      : buildComfyViewUrl(comfyUrl, req.user.id, char_id, img.basename);

    list.push({
      filename: img.basename,
      thumb_url: thumbUrl,
      image_url: buildComfyViewUrl(comfyUrl, req.user.id, char_id, img.basename),
    });
  }

  list.sort((a, b) => b.filename.localeCompare(a.filename));

  meta.last_accessed = new Date().toISOString();
  meta.image_count = list.length;
  writeMeta(metaPath, meta);

  res.json(list);
});

// POST /api/images/sync/:char_id
router.post('/sync/:char_id', async (req, res) => {
  const { char_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const thumbsDir = getCacheDir(req.user.id, char_id);
  const metaPath = getMetaPath(req.user.id, char_id);
  const meta = readMeta(metaPath);
  const removedFiles = meta.removed_files || [];

  const images = listSourceImages(req.user.id, char_id);
  let synced = 0;

  for (const img of images) {
    if (removedFiles.includes(img.basename)) continue;
    const stem = path.parse(img.basename).name;
    const thumbPath = path.join(thumbsDir, `${stem}.jpg`);
    if (!fs.existsSync(thumbPath)) {
      try { await generateThumb(img.srcPath, thumbPath); synced++; } catch { /* skip */ }
    } else {
      synced++;
    }
  }

  const total = fs.existsSync(thumbsDir)
    ? fs.readdirSync(thumbsDir).filter(f => f.endsWith('.jpg')).length
    : 0;

  meta.last_accessed = new Date().toISOString();
  meta.image_count = total;
  writeMeta(metaPath, meta);

  res.json({ ok: true, synced, total });
});

// GET /api/images/count/:char_id
router.get('/count/:char_id', (req, res) => {
  const { char_id } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const metaPath = getMetaPath(req.user.id, char_id);
  const meta = readMeta(metaPath);
  const removedFiles = meta.removed_files || [];
  const images = listSourceImages(req.user.id, char_id);
  const count = images.filter(i => !removedFiles.includes(i.basename)).length;
  res.json({ count });
});

// DELETE /api/images/:char_id/:filename
router.delete('/:char_id/:filename', (req, res) => {
  const { char_id, filename } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const thumbsDir = getCacheDir(req.user.id, char_id);
  const metaPath = getMetaPath(req.user.id, char_id);
  const stem = path.parse(filename).name;

  const thumbPath = path.join(thumbsDir, `${stem}.jpg`);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  const meta = readMeta(metaPath);
  meta.removed_files = [...new Set([...(meta.removed_files || []), filename])];
  const total = fs.existsSync(thumbsDir)
    ? fs.readdirSync(thumbsDir).filter(f => f.endsWith('.jpg')).length
    : 0;
  meta.image_count = total;
  writeMeta(metaPath, meta);

  res.json({ ok: true });
});

// GET /api/images/cache/:char_id/thumbs/:filename
router.get('/cache/:char_id/thumbs/:filename', (req, res) => {
  const { char_id, filename } = req.params;
  const db = getDb();
  if (!ownsChar(db, char_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const safeName = path.basename(filename);
  const thumbPath = path.resolve(
    path.join('data', 'cache', String(req.user.id), char_id, 'thumbs', safeName)
  );
  const allowedDir = path.resolve(path.join('data', 'cache', String(req.user.id), char_id, 'thumbs'));
  if (!thumbPath.startsWith(allowedDir)) return res.status(400).end();

  if (!fs.existsSync(thumbPath)) return res.status(404).end();
  res.sendFile(thumbPath);
});

module.exports = router;
