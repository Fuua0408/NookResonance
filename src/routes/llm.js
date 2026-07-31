'use strict';

const express = require('express');
const { authMiddleware } = require('../auth');
const logger  = require('../logger');
const { getDb } = require('../db');
const { getEnabledToolSchemas, getToolByName } = require('../tools');

const router = express.Router();
router.use(authMiddleware);

// ─────────────────────────────────────────────
// 共通ヘルパ（/chat と /chat-stream の両方から呼ばれる）
// パラメータの組み立てがズレると経路ごとに応答傾向が変わってしまうため、
// ここだけを唯一のソースにする。
// ─────────────────────────────────────────────

// LLMエンドポイント設定・送信パラメータを組み立てる。
// エンドポイント未設定時は { error } を返す（呼び出し側で 503 にする）。
// tools/toolChoice は /chat-stream のツール呼び出しループ（005）専用。/chat は常に未指定のまま呼ぶこと。
function buildLlmRequest(messages, { noThink = false, maxTokensOverride, tools, toolChoice } = {}) {
  const endpoint = (process.env.LLM_ENDPOINT || '').replace(/\/$/, '');
  if (!endpoint) {
    return { error: 'LLMエンドポイントが設定されていません（サーバーの .env を確認してください）' };
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

  const body = {
    messages:           finalMessages,
    max_tokens:         effectiveMaxTok,
    temperature:        temp,
    top_p:              topP,
    top_k:              topK,
    repetition_penalty: repPen,
    stop: ['\nUser:', '\nAssistant:', '###'],
    ...(noThink ? { enable_thinking: false } : {}),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };

  return { url, apiKey, timeoutSec, body };
}

// TOOLS_ENABLED: 'false' の時のみ無効。未設定・不正値は有効扱い
function parseToolsEnabled() {
  const raw = (process.env.TOOLS_ENABLED || '').trim().toLowerCase();
  return raw !== 'false';
}

// TOOLS_MAX_ROUNDS: 整数。未設定・不正値は4。0以下は1に丸める
function parseMaxRounds() {
  const n = parseInt(process.env.TOOLS_MAX_ROUNDS, 10);
  if (!Number.isInteger(n)) return 4;
  return Math.max(1, n);
}

// 応答テキストの抽出（優先順: message.content → message.reasoning_content →
// delta.content → text → data.content）
function extractLlmText(data) {
  const choice = data.choices?.[0];
  return (
    choice?.message?.content           ||
    choice?.message?.reasoning_content ||
    choice?.delta?.content             ||
    choice?.text                       ||
    data.content                       ||
    ''
  ).trim();
}

// === [TEMP DEBUG] Phase1 — 削除予定 ===========================
// Gemma4 の生思考タグ特定用。content の生文字列をそのまま出す。
function logRawDebug(noThink, data) {
  logger.info('LLM_RAW_DEBUG', {
    noThink,
    finish_reason: data.choices?.[0]?.finish_reason,
    usage: data.usage,
    raw_content: (data.choices?.[0]?.message?.content || '').slice(0, 2000),
    raw_reasoning: (data.choices?.[0]?.message?.reasoning_content || '').slice(0, 500),
  });
}
// =============================================================

// POST /api/llm/chat
router.post('/chat', async (req, res) => {
  const { messages, noThink = false, maxTokensOverride } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const built = buildLlmRequest(messages, { noThink, maxTokensOverride });
  if (built.error) {
    return res.status(503).json({ error: built.error });
  }
  const { url, apiKey, timeoutSec, body } = built;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      signal: AbortSignal.timeout(timeoutSec * 1000),
      body: JSON.stringify(body),
    });

    if (resp.status === 401) {
      return res.status(502).json({ error: 'LLM APIキーが正しくありません' });
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(502).json({ error: `LLMエラー (${resp.status}): ${txt.slice(0, 80)}` });
    }

    const data = await resp.json();
    logRawDebug(noThink, data);

    const text = extractLlmText(data);

    res.json({ text });
  } catch(e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return res.status(504).json({ error: `LLMがタイムアウトしました（${timeoutSec}秒）` });
    }
    res.status(503).json({ error: 'LLMサーバーに接続できません: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// SSE（進捗通知用）
// 本文はストリーミングしない。生成が完全に終わってから確定テキストを
// 1度だけ `done` イベントで送る。上流LLMへは非ストリーミングでラウンドごとに1回POSTする。
// パラメータ組み立ては /chat と共通（buildLlmRequest）だが、tools/tool_choice は
// このエンドポイントのツール呼び出しループ（005）だけが使う。
//
// ツール呼び出しループ（opt-in）:
//   useTools===true かつ TOOLS_ENABLED が有効かつ有効化済みツールが1件以上ある場合のみ、
//   上流へ tools を送る。いずれか欠ければ004と完全に同一の単発挙動にフォールバックする。
//   finish_reason==='tool_calls' の間はツールを実行して結果をmessagesへ積み再送し、
//   'stop' になったら（または上限到達後の強制ツール無し再送の結果を）doneで返す。
// ─────────────────────────────────────────────

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function safeWrite(fn) {
  try { fn(); } catch (e) { /* クライアントが既に切断している */ }
}

// tool_call.function.arguments（JSON文字列）を安全にパースする。失敗時は { ok:false } を返す
function safeParseToolArgs(text) {
  try {
    return { ok: true, value: JSON.parse(text && text.trim() !== '' ? text : '{}') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function formatToolResultContent(result) {
  return typeof result === 'string' ? result : JSON.stringify(result);
}

// 008: Web検索/URL読み取り等、数千〜数万文字になりうるツール結果がコンテキスト長を
// 食い潰してキャラ設定・会話履歴を押し出さないよう、LLMへ再送するmessages側でのみ
// 上限文字数で切り詰める（表示用の006 turn.tool_invocations.result_textは対象外）
const TOOL_RESULT_MAX_CHARS_FOR_LLM = 8000;

function truncateToolResultForLlm(text) {
  if (typeof text !== 'string' || text.length <= TOOL_RESULT_MAX_CHARS_FOR_LLM) return text;
  return text.slice(0, TOOL_RESULT_MAX_CHARS_FOR_LLM) +
    `\n…(${TOOL_RESULT_MAX_CHARS_FOR_LLM}文字で切り詰め。元は${text.length}文字)`;
}

// POST /api/llm/chat-stream
router.post('/chat-stream', async (req, res) => {
  const { messages, noThink = false, maxTokensOverride, useTools = false } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  // opt-inの3条件（useTools===true / TOOLS_ENABLED有効 / 有効化済みツールが1件以上）を
  // すべて満たす場合のみtoolsを送る。欠ければ004と同一の単発挙動（tools無し）。
  const db = getDb();
  const toolsEnabled = parseToolsEnabled();
  const toolSchemas = (useTools === true && toolsEnabled) ? getEnabledToolSchemas(db) : [];
  const shouldUseTools = toolSchemas.length > 0;
  const enabledToolNames = new Set(toolSchemas.map((t) => t.function.name));
  const maxRounds = parseMaxRounds();

  // エンドポイント未設定はここで先に弾く（従来と同じ503）
  const initialBuilt = buildLlmRequest(messages, { noThink, maxTokensOverride });
  if (initialBuilt.error) {
    return res.status(503).json({ error: initialBuilt.error });
  }
  const timeoutSec = initialBuilt.timeoutSec;

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-store',
    'Connection':    'keep-alive',
  });

  const controller = new AbortController();
  let settled = false;
  let abortReason = null;

  const timeoutId = setTimeout(() => {
    abortReason = 'timeout';
    controller.abort();
  }, timeoutSec * 1000);

  res.on('close', () => {
    if (!settled) {
      abortReason = abortReason || 'disconnect';
      controller.abort();
      logger.info('LLM_CHAT_STREAM_CLIENT_DISCONNECT', {});
    }
  });

  // 上流へ1回POSTする。extra.tools / extra.toolChoice はこの呼び出しだけに適用される
  async function postOnce(msgs, extra = {}) {
    const built = buildLlmRequest(msgs, { noThink, maxTokensOverride, ...extra });
    if (built.error) {
      throw Object.assign(new Error(built.error), { isLlmError: true });
    }
    return fetch(built.url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + built.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify(built.body),
    });
  }

  // サーバー側in-memoryのみで組み立てるツール往復用messages（DBへは保存しない）
  const workingMessages = messages.map((m) => ({ ...m }));
  const toolInvocations = [];
  let finalText = '';

  try {
    let round = 0;
    for (;;) {
      const atLimit       = shouldUseTools && round >= maxRounds;
      const roundUsesTools = shouldUseTools && !atLimit;

      const extra = {};
      if (roundUsesTools) {
        extra.tools = toolSchemas;
      } else if (atLimit) {
        // 上限到達: ツール無しで最終回答させるための強制再送
        extra.tools = toolSchemas;
        extra.toolChoice = 'none';
      }

      let resp = await postOnce(workingMessages, extra);

      // tool_choice:'none' 非対応バックエンド（400系）向けフォールバック:
      // toolsフィールド自体を送らずにもう一度だけ再送する
      if (atLimit && resp.status >= 400 && resp.status < 500) {
        logger.warn('llm chat-stream: tool_choice="none" rejected by upstream, retrying without tools field', {
          status: resp.status,
        });
        resp = await postOnce(workingMessages, {});
      }

      if (resp.status === 401) {
        throw Object.assign(new Error('LLM APIキーが正しくありません'), { isLlmError: true });
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw Object.assign(new Error(`LLMエラー (${resp.status}): ${txt.slice(0, 80)}`), { isLlmError: true });
      }

      const data = await resp.json();
      logRawDebug(noThink, data);

      const choice       = data.choices?.[0];
      const finishReason = choice?.finish_reason;
      const message       = choice?.message || {};
      const toolCalls     = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      const isToolRound = !atLimit && finishReason === 'tool_calls' && toolCalls.length > 0;

      if (!isToolRound) {
        // 通常のstop、または上限到達による強制ツール無し再送の結果 → 最終回答
        // content が空で reasoning_content のみの場合の救済も extractLlmText が担う
        finalText = extractLlmText(data);
        break;
      }

      // 中間ラウンド: このラウンドのcontentは最終回答として扱わず破棄する
      workingMessages.push({ role: 'assistant', content: message.content || null, tool_calls: toolCalls });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name || '';
        safeWrite(() => sendEvent(res, 'tool_call', { name: toolName }));

        let status = 'success';
        let resultText;
        let parsedArgs;

        const parsed = safeParseToolArgs(toolCall.function?.arguments);
        if (!parsed.ok) {
          status = 'error';
          resultText = JSON.stringify({ error: `引数のJSON解析に失敗しました: ${parsed.error}` });
        } else {
          parsedArgs = parsed.value;
          const tool = getToolByName(toolName);
          // モデルが名乗った名前を無検証で実行しない: 未登録 or 無効化済みならエラー結果にする
          if (!tool || !enabledToolNames.has(toolName)) {
            status = 'error';
            resultText = JSON.stringify({ error: `未登録または無効なツールです: ${toolName}` });
          } else {
            try {
              const result = await tool.handler(parsedArgs);
              resultText = formatToolResultContent(result);
            } catch (e) {
              status = 'error';
              resultText = JSON.stringify({ error: e.message || String(e) });
            }
          }
        }

        workingMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: truncateToolResultForLlm(resultText) });
        safeWrite(() => sendEvent(res, 'tool_result', { name: toolName, status }));

        toolInvocations.push({
          round_index:     round,
          tool_name:       toolName,
          arguments_json:  parsed.ok ? JSON.stringify(parsedArgs) : (toolCall.function?.arguments || ''),
          status,
          result_text:     resultText,
        });
      }

      round += 1;
    }

    clearTimeout(timeoutId);
    settled = true;
    safeWrite(() => sendEvent(res, 'done', { text: finalText, tool_invocations: toolInvocations }));
    safeWrite(() => res.end());
  } catch(e) {
    clearTimeout(timeoutId);
    settled = true;

    let message;
    if (e.isLlmError) {
      message = e.message;
    } else if (e.name === 'TimeoutError' || (e.name === 'AbortError' && abortReason === 'timeout')) {
      message = `LLMがタイムアウトしました（${timeoutSec}秒）`;
    } else if (e.name === 'AbortError') {
      message = 'クライアントが切断されました';
    } else {
      message = 'LLMサーバーに接続できません: ' + e.message;
    }
    safeWrite(() => sendEvent(res, 'error', { error: message }));
    safeWrite(() => res.end());
  }
});

module.exports = router;
