'use strict';

// MCPアクセスキー管理API（009）。/api/mcp-keys。
// キー操作APIはJWT認証。対象は常にreq.user.id自身のキーに限定する
const express = require('express');
const { authMiddleware } = require('../auth');
const { issueKey, listKeys, revokeKey } = require('../mcpKeys');
const logger = require('../logger');

const router = express.Router();
router.use(authMiddleware);

// GET /api/mcp-keys — 自分の有効キー一覧(key_prefix/label/last_used_atのみ。ハッシュも平文も返さない)
router.get('/', (req, res) => {
  res.json({ keys: listKeys(req.user.id) });
});

// POST /api/mcp-keys — 発行。このレスポンスでのみ平文キーを返す
router.post('/', (req, res) => {
  const body = req.body || {};
  if (body.label !== undefined && typeof body.label !== 'string') {
    return res.status(400).json({ error: 'label must be a string' });
  }
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 100) : '';

  try {
    const issued = issueKey(req.user.id, label || null, body.expires_in_days);
    logger.info('MCP_KEY_ISSUED', { user_id: req.user.id, key_id: issued.id });
    res.status(201).json({ key: issued });
  } catch (e) {
    if (e.code === 'MAX_KEYS' || e.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: e.message });
    }
    logger.error('mcp keys: failed to issue key', { error: e.message, user_id: req.user.id });
    res.status(500).json({ error: 'failed to issue key' });
  }
});

// DELETE /api/mcp-keys/:id — 失効(revoked_atを立てる)。他ユーザーのキーidは404
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'not found' });

  const revoked = revokeKey(req.user.id, id);
  if (!revoked) return res.status(404).json({ error: 'not found' });

  logger.info('MCP_KEY_REVOKED', { user_id: req.user.id, key_id: id });
  res.json({ ok: true });
});

module.exports = router;
