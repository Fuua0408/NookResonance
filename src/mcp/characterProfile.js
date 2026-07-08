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

const AFFECTION_DEFAULT = 130;
const AFFECTION_MIN = 0;
const AFFECTION_MAX = 255;
const AFFECTION_STAGES = [
  { min: 0, max: 5, label: '憎悪' },
  { min: 6, max: 36, label: '大嫌い' },
  { min: 37, max: 72, label: '嫌い' },
  { min: 73, max: 109, label: '苦手' },
  { min: 110, max: 145, label: '普通' },
  { min: 146, max: 181, label: '好き' },
  { min: 182, max: 218, label: 'とても好き' },
  { min: 219, max: 249, label: '大好き' },
  { min: 250, max: 255, label: '愛' },
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

function clampAffection(value) {
  return Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, Math.round(value)));
}

function getAffectionLabel(level) {
  const stage = AFFECTION_STAGES.find(s => level >= s.min && level <= s.max);
  return stage?.label || '';
}

function getAffection(charData) {
  if (charData.affection_enabled === false) return null;

  const raw = charData.affection;
  const numeric = raw === undefined || raw === null || raw === ''
    ? AFFECTION_DEFAULT
    : Number(raw);
  if (!Number.isFinite(numeric)) return null;

  const level = clampAffection(numeric);
  return {
    level,
    label: getAffectionLabel(level),
  };
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
  const affection = getAffection(charData);

  return {
    user_id: row.user_id,
    character_id: row.id,
    character_name: row.name,
    personality,
    tone,
    affection,
    updated_at: row.updated_at,
  };
}

module.exports = {
  getCharacterProfileForMcp,
  extractToneFromPersonality,
  getAffection,
};
