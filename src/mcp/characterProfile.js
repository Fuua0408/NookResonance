'use strict';

const { getDb } = require('../db');

const TONE_KEYS = [
  'tone',
  'speech_tone',
  'speech_style',
  'speaking_style',
  'talk_style',
  'voice_style',
];

function parseCharData(row) {
  try {
    return JSON.parse(row.char_data || '{}');
  } catch {
    return {};
  }
}

function extractToneFromPersonality(personality) {
  if (!personality || typeof personality !== 'string') return '';

  const toneHints = [
    '口調',
    '話し方',
    '喋り方',
    'しゃべり方',
    '語尾',
    '一人称',
    '二人称',
    '呼び方',
    'tone',
    'speech',
    'speaking',
  ];

  const lines = personality
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => toneHints.some(hint => line.toLowerCase().includes(hint.toLowerCase())));

  return lines.join('\n');
}

function getStoredTone(charData) {
  for (const key of TONE_KEYS) {
    if (typeof charData[key] === 'string' && charData[key].trim()) {
      return charData[key].trim();
    }
  }
  return extractToneFromPersonality(charData.personality || '');
}

function getCharacterProfileForMcp(authenticatedUser, args = {}) {
  const characterName = typeof args.character_name === 'string'
    ? args.character_name.trim()
    : (typeof args.characterName === 'string' ? args.characterName.trim() : '');

  if (!characterName) {
    const err = new Error('character_name is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const db = getDb();
  const rows = db.prepare(
    `SELECT id, user_id, name, char_data, updated_at
       FROM characters
      WHERE user_id = ? AND name = ?
      ORDER BY updated_at DESC, id DESC`
  ).all(authenticatedUser.id, characterName);

  if (!rows.length) {
    const err = new Error('Character not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (rows.length > 1) {
    const err = new Error('Multiple characters matched the same name');
    err.code = 'CONFLICT';
    throw err;
  }

  const row = rows[0];
  const charData = parseCharData(row);
  const personality = typeof charData.personality === 'string' ? charData.personality.trim() : '';
  const tone = getStoredTone(charData);

  return {
    user_id: row.user_id,
    character_id: row.id,
    character_name: row.name,
    personality,
    tone,
    updated_at: row.updated_at,
  };
}

module.exports = {
  getCharacterProfileForMcp,
  extractToneFromPersonality,
};
