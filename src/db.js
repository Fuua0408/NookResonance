'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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
  `);
}

module.exports = { getDb };
