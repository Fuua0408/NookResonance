#!/usr/bin/env node
'use strict';

require('dotenv').config();
const bcrypt = require('bcrypt');
const { getDb } = require('../src/db');

const [,, username, passwordArg, adminFlag] = process.argv;

if (!username) {
  console.error('Usage: node scripts/create-user.js <username> [password] [--admin] [--advanced]');
  process.exit(1);
}

const password = passwordArg && passwordArg !== '--admin' && passwordArg !== '--advanced'
  ? passwordArg
  : (process.env.DEFAULT_PASSWORD || 'changeme');

const isAdmin    = process.argv.includes('--admin')    ? 1 : 0;
const isAdvanced = process.argv.includes('--advanced') ? 1 : 0;

(async () => {
  const hash = await bcrypt.hash(password, 12);
  const db = getDb();

  try {
    const stmt = db.prepare(
      'INSERT INTO users (username, password_hash, is_admin, is_advanced) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(username, hash, isAdmin, isAdvanced);
    console.log(`Created user "${username}" (id=${result.lastInsertRowid}, admin=${!!isAdmin}, advanced=${!!isAdvanced})`);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      console.error(`Error: username "${username}" already exists`);
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
})();
