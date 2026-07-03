'use strict';

const express = require('express');
const { authMiddleware } = require('../auth');
const logger  = require('../logger');

const router = express.Router();
router.use(authMiddleware);

// POST /api/llm/chat
router.post('/chat', async (req, res) => {
  const { messages, noThink = false, maxTokensOverride } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const endpoint = (process.env.LLM_ENDPOINT || '').replace(/\/$/, '');
  if (!endpoint) {
    return res.status(503).json({ error: 'LLMエンドポイントが設定されていません（サーバーの .env を確認してください）' });
  }

  const url     = endpoint.replace(/\/completions$/, '') + '/chat/completions';
  const apiKey  = process.env.LLM_API_KEY  || 'sk-fake';
  const prefix  = (process.env.LLM_PREFIX  || '').trim();
  const maxTok  = parseInt(process.env.LLM_MAX_TOKENS  || '2048');
  const effectiveMaxTok = Number.isInteger(maxTokensOverride) && maxTokensOverride > 0
    ? Math.min(maxTokensOverride, maxTok)
    : maxTok;
  const temp    = parseFloat(process.env.LLM_TEMP       || '0.7');
  const topP    = parseFloat(process.env.LLM_TOP_P      || '0.95');
  const topK    = parseInt(process.env.LLM_TOP_K        || '64');
  const repPen  = parseFloat(process.env.LLM_REP_PENALTY || '1.15');
  const timeoutSec = parseInt(process.env.LLM_TIMEOUT   || '120');

  const injected = prefix
    ? messages.map((m, i) => (i === 0 && m.role === 'system')
        ? { ...m, content: prefix + '\n' + m.content } : m)
    : messages;

  // noThink=true の場合、無効だったプリフィル注入は行わない（Gemma4は思考タグを使わない）
  const finalMessages = noThink ? injected : injected;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      signal: AbortSignal.timeout(timeoutSec * 1000),
      body: JSON.stringify({
        messages:           finalMessages,
        max_tokens:         effectiveMaxTok,
        temperature:        temp,
        top_p:              topP,
        top_k:              topK,
        repetition_penalty: repPen,
        stop: ['\nUser:', '\nAssistant:', '###'],
        ...(noThink ? { enable_thinking: false } : {}),
      }),
    });

    if (resp.status === 401) {
      return res.status(502).json({ error: 'LLM APIキーが正しくありません' });
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(502).json({ error: `LLMエラー (${resp.status}): ${txt.slice(0, 80)}` });
    }

    const data   = await resp.json();

    // === [TEMP DEBUG] Phase1 — 削除予定 ===========================
    // Gemma4 の生思考タグ特定用。content の生文字列をそのまま出す。
    logger.info('LLM_RAW_DEBUG', {
      noThink,
      finish_reason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
      raw_content: (data.choices?.[0]?.message?.content || '').slice(0, 2000),
      raw_reasoning: (data.choices?.[0]?.message?.reasoning_content || '').slice(0, 500),
    });
    // =============================================================

    const choice = data.choices?.[0];
    const text = (
      choice?.message?.content           ||
      choice?.message?.reasoning_content ||
      choice?.delta?.content             ||
      choice?.text                       ||
      data.content                       ||
      ''
    ).trim();

    res.json({ text });
  } catch(e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return res.status(504).json({ error: `LLMがタイムアウトしました（${timeoutSec}秒）` });
    }
    res.status(503).json({ error: 'LLMサーバーに接続できません: ' + e.message });
  }
});

module.exports = router;
