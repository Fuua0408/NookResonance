'use strict';

// MCPアクセスキー（009）。/mcp の認証をログインJWTから、ユーザーIDに紐づく
// 専用アクセスキーへ置き換えるためのモジュール。
// 設計原則:
//   - 平文キーは発行時のみ呼び出し元に返す。DBにはsha256ハッシュのみ保存し、再表示手段は作らない
//   - キーは256bitのランダム値なので、パスワードと違いbcrypt等のストレッチは不要(sha256の完全一致でよい)
//   - キー値・Authorizationヘッダ値はログにもエラーレスポンスにも一切載せない
//   - 失効・期限切れ・不正キーは理由を区別せず一律401(キーの存在有無を漏らさない)

const crypto = require('crypto');
const { getDb } = require('./db');
const logger = require('./logger');

const KEY_PREFIX = 'nrk_';
const KEY_PREFIX_DISPLAY_LEN = 8;
const MAX_ACTIVE_KEYS_PER_USER = 20;
const LAST_USED_TOUCH_INTERVAL_MS = 60 * 60 * 1000; // last_used_atの書き込みを1時間程度で間引く

function generateKey() {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

// SQLiteのdatetime('now')形式('YYYY-MM-DD HH:MM:SS', UTC)をDateへ変換する
function parseDbTimestamp(value) {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 有効期限を発行時点からの日数で受け取り、SQLiteのdatetime('now', '+N days')で計算する
// (created_at/updated_at と同じ形式・同じ時計source(SQLite)に揃えるため)
function computeExpiresAt(db, expiresInDays) {
  if (expiresInDays === undefined || expiresInDays === null || expiresInDays === '') return null;

  const days = Number(expiresInDays);
  if (!Number.isFinite(days) || days <= 0) {
    const err = new Error('expires_in_days must be a positive number');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  return db.prepare("SELECT datetime('now', ?) AS d").get(`+${days} days`).d;
}

function issueKey(userId, label, expiresInDays) {
  const db = getDb();

  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM mcp_access_keys WHERE user_id = ? AND revoked_at IS NULL')
    .get(userId);
  if (count >= MAX_ACTIVE_KEYS_PER_USER) {
    const err = new Error(`Maximum of ${MAX_ACTIVE_KEYS_PER_USER} active keys reached`);
    err.code = 'MAX_KEYS';
    throw err;
  }

  const expiresAt = computeExpiresAt(db, expiresInDays);
  const key = generateKey();
  const keyHash = hashKey(key);
  const keyPrefix = key.slice(0, KEY_PREFIX.length + KEY_PREFIX_DISPLAY_LEN);

  const info = db
    .prepare(
      `INSERT INTO mcp_access_keys (user_id, label, key_prefix, key_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, label || null, keyPrefix, keyHash, expiresAt);

  const row = db.prepare('SELECT * FROM mcp_access_keys WHERE id = ?').get(info.lastInsertRowid);
  return {
    id: row.id,
    key, // 平文キー。このレスポンスでのみ返す
    key_prefix: row.key_prefix,
    label: row.label,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

function toKeyView(row) {
  return {
    id: row.id,
    label: row.label,
    key_prefix: row.key_prefix,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

function listKeys(userId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, label, key_prefix, last_used_at, expires_at, created_at
         FROM mcp_access_keys
        WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC, id DESC`
    )
    .all(userId);
  return rows.map(toKeyView);
}

// 対象は常にuserId自身のキーに限定する(idを知っていても他ユーザーのキーには触れない)
function revokeKey(userId, id) {
  const db = getDb();
  const info = db
    .prepare(
      `UPDATE mcp_access_keys
          SET revoked_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
    )
    .run(id, userId);
  return info.changes > 0;
}

function touchLastUsed(db, row) {
  const last = parseDbTimestamp(row.last_used_at);
  if (last && Date.now() - last.getTime() < LAST_USED_TOUCH_INTERVAL_MS) return;

  try {
    db.prepare("UPDATE mcp_access_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  } catch (e) {
    logger.warn('mcpKeys: failed to update last_used_at', { error: e.message });
  }
}

// req.user をJWT経路と同じ形({id, username, is_admin, is_advanced})で埋める。
// 下流(characterProfile.js等)はJWT/アクセスキーの違いを一切意識しない
function mcpAuthMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !token.startsWith(KEY_PREFIX)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT k.id, k.user_id, k.last_used_at, k.expires_at, k.revoked_at,
              u.username, u.is_admin, u.is_advanced
         FROM mcp_access_keys k
         JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = ?`
    )
    .get(hashKey(token));

  // 失効・期限切れ・不正キーは理由を区別せず一律401(キーの存在有無を漏らさない)
  if (!row || row.revoked_at) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const expiresAt = parseDbTimestamp(row.expires_at);
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  touchLastUsed(db, row);

  req.user = {
    id: row.user_id,
    username: row.username,
    is_admin: row.is_admin,
    is_advanced: row.is_advanced,
  };
  next();
}

module.exports = { issueKey, listKeys, revokeKey, mcpAuthMiddleware };
