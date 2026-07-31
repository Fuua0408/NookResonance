'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const { getCatalogEntry } = require('./mcp-client/catalog');

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH || './data/nookresonance.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  seedClockMcpServer(_db);
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS characters (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      char_data  TEXT    NOT NULL DEFAULT '{}',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      char_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      title        TEXT    NOT NULL DEFAULT '無題のセッション',
      turns        TEXT    NOT NULL DEFAULT '[]',
      session_meta TEXT    NOT NULL DEFAULT '{}',
      archived     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      wf_data    TEXT    NOT NULL DEFAULT '{}',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key     TEXT    NOT NULL,
      value   TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS global_loras (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      weight        REAL    NOT NULL DEFAULT 1.0,
      clip_weight   REAL    NOT NULL DEFAULT 1.0,
      trigger_words TEXT    NOT NULL DEFAULT '',
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tools (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      origin      TEXT    NOT NULL DEFAULT '',
      enabled     INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- MCPサーバー設定の保管。label/enabled/transport/command/args/url/catalog_id/sort_order は平文、
    -- env/headers はそれぞれ独立の封筒暗号(enc/iv/tag)で保持する(片方のみ保持=NULL可)
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      label        TEXT    NOT NULL UNIQUE,
      enabled      INTEGER NOT NULL DEFAULT 1,
      transport    TEXT    NOT NULL DEFAULT 'stdio',
      command      TEXT,
      args         TEXT,
      url          TEXT,
      env_enc      TEXT,
      env_iv       TEXT,
      env_tag      TEXT,
      headers_enc  TEXT,
      headers_iv   TEXT,
      headers_tag  TEXT,
      catalog_id   TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // is_advanced カラムが存在しない場合のみ追加（既存DBへのマイグレーション）
  ensureColumn(db, 'users', 'is_advanced', "INTEGER NOT NULL DEFAULT 0");
}

// シークレット不要な自前clock MCPサーバーを、新規/既存デプロイの両方でデフォルト有効にする。
// label='clock'が既に存在する場合(ユーザーの無効化・編集を含む)は何もしない。一度追加するだけ
function seedClockMcpServer(db) {
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE label = ?').get('clock');
  if (existing) return;

  const entry = getCatalogEntry('clock');
  if (!entry || !entry.command) {
    logger.error('db seed: clock catalog entry is unavailable (index.mjs not found?), skipping seed');
    return;
  }

  const { next } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM mcp_servers').get();
  db.prepare(
    `INSERT INTO mcp_servers
       (label, enabled, transport, command, args, url, env_enc, env_iv, env_tag, headers_enc, headers_iv, headers_tag, catalog_id, sort_order)
     VALUES ('clock', 1, 'stdio', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`
  ).run(entry.command, JSON.stringify(entry.args || []), entry.id, next);
  logger.info('db seed: clock MCP server added (enabled=1)');
}

// 既存DBに列が無ければ追加する（冪等）。CREATE TABLE IF NOT EXISTS では
// 既存テーブルに新しい列を追加できないため、起動のたびに列の有無を確認して補う。
function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = { getDb, ensureColumn };
