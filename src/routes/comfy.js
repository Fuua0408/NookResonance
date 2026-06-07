'use strict';

const express = require('express');
const crypto  = require('crypto');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');
const { lookupBuiltin } = require('../builtinWorkflows');

const router = express.Router();
router.use(authMiddleware);

function getComfyUrl() {
  return (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
}

// ─── LoRA injection (ported from Alcove workflows.js) ───────────────────────
function injectLoRAs(json, map, loras) {
  const modelSourceId = map.node_model || null;

  let clipSourceId = map.node_clip_skip || null;
  if (!clipSourceId) clipSourceId = Object.keys(json).find(k => json[k]?.class_type === 'CLIPLoader') || null;
  if (!clipSourceId) clipSourceId = Object.keys(json).find(k => json[k]?.class_type === 'CheckpointLoaderSimple') || null;
  if (!clipSourceId) clipSourceId = Object.keys(json).find(k => json[k]?.class_type === 'DualCLIPLoader') || null;

  loras.forEach((lora, idx) => {
    const loraId      = `lora_${100000 + idx}`;
    const prevModelId = idx === 0 ? modelSourceId : `lora_${100000 + idx - 1}`;
    const prevClipId  = idx === 0 ? clipSourceId  : `lora_${100000 + idx - 1}`;

    let actualClipIn   = prevClipId;
    let actualClipSlot = 0;
    if (idx === 0 && map.node_clip_skip && clipSourceId === map.node_clip_skip) {
      const clipSkipNode = json[map.node_clip_skip];
      if (clipSkipNode?.inputs?.clip) {
        actualClipIn   = clipSkipNode.inputs.clip[0];
        actualClipSlot = clipSkipNode.inputs.clip[1] ?? 0;
      }
    }

    json[loraId] = {
      inputs: {
        lora_name:      lora.name,
        strength_model: lora.strengthModel ?? 1,
        strength_clip:  lora.strengthClip  ?? 1,
        model: [prevModelId, 0],
        clip:  [actualClipIn, actualClipSlot],
      },
      class_type: 'LoraLoader',
      _meta: { title: `LoRA ${idx + 1}: ${lora.name.split('/').pop()}` },
    };
  });

  const lastLoraId = `lora_${100000 + loras.length - 1}`;

  if (map.node_model_patcher && json[map.node_model_patcher]) {
    json[map.node_model_patcher].inputs.model = [lastLoraId, 0];
  } else if (map.node_ksampler && json[map.node_ksampler]) {
    json[map.node_ksampler].inputs.model = [lastLoraId, 0];
  }

  if (map.node_clip_skip && json[map.node_clip_skip]) {
    json[map.node_clip_skip].inputs.clip = [lastLoraId, 1];
  } else {
    Object.keys(json).forEach(k => {
      if (json[k]?.class_type === 'CLIPTextEncode') {
        json[k].inputs.clip = [lastLoraId, 1];
      }
    });
  }
}

// ─── ワークフローJSON構築 ────────────────────────────────────────────────────
function buildWorkflowJson(wfRow, params, enPrompt, userId, charId, turnId, fixedSeed, globalLoras = [], globalSettings = {}) {
  const extra    = JSON.parse(wfRow.wf_data || '{}');
  const map      = extra.mapping  || {};
  const defaults = extra.defaults || {};
  const json     = JSON.parse(JSON.stringify(extra.json || {}));

  const charLoras   = (params.loras || []).filter(l => l.enabled !== false);
  const mappedGlobalLoras = globalLoras
    .filter(g => g.enabled !== 0)
    .map(g => ({
      name:          g.name,
      strengthModel: g.weight      ?? 1,
      strengthClip:  g.clip_weight ?? 1,
      triggerWords:  g.trigger_words || '',
      enabled:       true,
    }));

  // グローバルLoRA → キャラクターLoRA の順で適用
  const loras        = [...mappedGlobalLoras, ...charLoras];
  const triggerWords = loras.filter(l => l.triggerWords).map(l => l.triggerWords).join(', ');

  if (map.node_en_prompt && json[map.node_en_prompt]) {
    json[map.node_en_prompt].inputs.value = triggerWords ? `${triggerWords}, ${enPrompt}` : enPrompt;
  }

  if (map.node_negative && json[map.node_negative]) {
    json[map.node_negative].inputs.text = params.negative?.trim() || globalSettings.negative?.trim() || extra.negative_default || '';
  }

  const usedSteps     = parseInt(params.steps    ?? globalSettings.steps    ?? defaults.steps    ?? 20);
  const usedCfg       = parseFloat(params.cfg    ?? globalSettings.cfg      ?? defaults.cfg      ?? 7);
  const usedWidth     = parseInt(params.width    ?? globalSettings.width    ?? defaults.width    ?? 1024);
  const usedHeight    = parseInt(params.height   ?? globalSettings.height   ?? defaults.height   ?? 1024);
  const usedSampler   = params.sampler   || globalSettings.sampler   || defaults.sampler   || 'euler';
  const usedScheduler = params.scheduler || globalSettings.scheduler || defaults.scheduler || 'simple';

  if (map.node_steps  && json[map.node_steps])  json[map.node_steps].inputs.value  = usedSteps;
  if (map.node_cfg    && json[map.node_cfg])    json[map.node_cfg].inputs.value    = usedCfg;
  if (map.node_width  && json[map.node_width])  json[map.node_width].inputs.value  = usedWidth;
  if (map.node_height && json[map.node_height]) json[map.node_height].inputs.value = usedHeight;

  if (map.node_ksampler && json[map.node_ksampler]) {
    json[map.node_ksampler].inputs.sampler_name = usedSampler;
    json[map.node_ksampler].inputs.scheduler    = usedScheduler;
  }

  const usedSeed = (fixedSeed !== null && fixedSeed !== undefined)
    ? fixedSeed
    : crypto.randomInt(0, 2 ** 32);

  if (map.node_seed && json[map.node_seed]) {
    json[map.node_seed].inputs.value = usedSeed;
  }

  if (loras.length) injectLoRAs(json, map, loras);

  // alcove/{user_id}/{char_id}/{YYYYMMDD_HHmmss_turn_id}
  const now    = new Date();
  const ds     = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const ts     = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  const tidStr = String(turnId || 0).padStart(4, '0');
  const saveNode = Object.keys(json).find(k => json[k]?.class_type === 'SaveImage');
  if (saveNode) {
    json[saveNode].inputs.filename_prefix = `alcove/${userId}/${charId}/${ds}_${ts}_${tidStr}`;
  }

  const meta = {
    workflow_id: wfRow.id,
    seed:        usedSeed,
    steps:       usedSteps,
    cfg:         usedCfg,
    width:       usedWidth,
    height:      usedHeight,
    sampler:     usedSampler,
    scheduler:   usedScheduler,
    globalLoras: mappedGlobalLoras.map(l => ({ name: l.name, strengthModel: l.strengthModel, strengthClip: l.strengthClip, triggerWords: l.triggerWords })),
    loras:       charLoras.map(l => ({
      name:          l.name,
      strengthModel: l.strengthModel ?? 1,
      strengthClip:  l.strengthClip  ?? 1,
      triggerWords:  l.triggerWords  || '',
    })),
  };

  return { json, meta };
}

// ─── 完了ポーリング ──────────────────────────────────────────────────────────
async function pollForResult(comfyUrl, promptId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const resp = await fetch(`${comfyUrl}/history/${promptId}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;
      const hist    = await resp.json();
      const outputs = hist[promptId]?.outputs;
      if (!outputs) continue;
      for (const nodeId in outputs) {
        if (outputs[nodeId].images?.length) return outputs[nodeId].images[0];
      }
    } catch { /* continue */ }
  }
  throw new Error('ComfyUI 生成タイムアウト');
}

// ─── POST /api/comfy/generate ────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { en_prompt, fixed_seed, char_id, turn_id, workflow_params = {} } = req.body || {};
  let { workflow_id } = req.body || {};

  if (!en_prompt) return res.status(400).json({ error: 'en_prompt is required' });
  if (!char_id)   return res.status(400).json({ error: 'char_id is required' });

  const db = getDb();

  const charRow = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?').get(char_id, req.user.id);
  if (!charRow) return res.status(404).json({ error: 'Character not found' });

  // ワークフローを解決: キャラクター指定 → グローバル設定の順でフォールバック
  // DBワークフロー（INTEGER id）またはビルトインワークフロー（string id）を返す
  const lookupWf = (id) => {
    if (id == null || id === '') return null;
    const dbRow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (dbRow) return dbRow;
    return lookupBuiltin(id);
  };
  let wfRow = lookupWf(workflow_id);
  if (!wfRow) {
    const gwf = db.prepare("SELECT value FROM settings WHERE key = 'global_wf_workflow_id'").get();
    wfRow = lookupWf(gwf?.value);
  }
  if (!wfRow) {
    return res.status(400).json({ error: 'ワークフローが見つかりません。管理者設定でデフォルトワークフローを設定してください。' });
  }

  const globalLoras = db.prepare('SELECT * FROM global_loras WHERE enabled = 1 ORDER BY id ASC').all();

  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'global_%'").all();
  const globalSettings = {};
  for (const { key, value } of settingsRows) {
    if (!value) continue;
    if (key.startsWith('global_wf_'))  globalSettings[key.replace('global_wf_', '')] = value;
    if (key === 'global_negative')     globalSettings.negative    = value;
    if (key === 'global_quality_tags') globalSettings.quality_tags = value;
  }

  const comfyUrl = getComfyUrl();

  let promptJson, meta;
  try {
    ({ json: promptJson, meta } = buildWorkflowJson(
      wfRow, workflow_params, en_prompt, req.user.id, char_id, turn_id, fixed_seed ?? null, globalLoras, globalSettings
    ));
  } catch(e) {
    return res.status(400).json({ error: 'ワークフロー構築失敗: ' + e.message });
  }

  // ComfyUI にサブミット
  let promptId;
  try {
    const resp = await fetch(`${comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptJson }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(502).json({ error: `ComfyUI エラー (${resp.status}): ${txt.slice(0, 80)}` });
    }
    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: 'ワークフローエラー: ' + JSON.stringify(data.error).slice(0, 80) });
    promptId = data.prompt_id;
  } catch(e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return res.status(504).json({ error: `ComfyUI への接続がタイムアウトしました (${comfyUrl})` });
    }
    return res.status(503).json({ error: `ComfyUI に接続できません (${comfyUrl}): ` + e.message });
  }

  // 完了待ち
  const timeoutMs = parseInt(process.env.COMFY_TIMEOUT || '120') * 1000;
  let imgInfo;
  try {
    imgInfo = await pollForResult(comfyUrl, promptId, timeoutMs);
  } catch(e) {
    return res.status(504).json({ error: e.message });
  }

  const imageUrl = `${comfyUrl}/view?filename=${encodeURIComponent(imgInfo.filename)}&subfolder=${encodeURIComponent(imgInfo.subfolder || '')}&type=output`;
  res.json({ imageUrl, meta });
});

// ─── GET /api/comfy/samplers ─────────────────────────────────────────────────
router.get('/samplers', async (req, res) => {
  const comfyUrl = getComfyUrl();
  try {
    const resp = await fetch(`${comfyUrl}/object_info/KSampler`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return res.json({ samplers: [], schedulers: [] });
    const data = await resp.json();
    res.json({
      samplers:   data?.KSampler?.input?.required?.sampler_name?.[0] || [],
      schedulers: data?.KSampler?.input?.required?.scheduler?.[0]    || [],
    });
  } catch {
    res.json({ samplers: [], schedulers: [] });
  }
});

// ─── グローバルLoRA CRUD ─────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: '管理者権限が必要です' });
  next();
}

// GET /api/comfy/global-loras
router.get('/global-loras', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM global_loras ORDER BY id ASC').all());
});

// POST /api/comfy/global-loras
router.post('/global-loras', requireAdmin, (req, res) => {
  const { name, weight = 1.0, clip_weight = 1.0, trigger_words = '', enabled = 1 } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO global_loras (name, weight, clip_weight, trigger_words, enabled) VALUES (?, ?, ?, ?, ?)'
  ).run(name, weight, clip_weight, trigger_words, enabled ? 1 : 0);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/comfy/global-loras/:id
router.put('/global-loras/:id', requireAdmin, (req, res) => {
  const { name, weight, clip_weight, trigger_words, enabled } = req.body || {};
  const db = getDb();
  const row = db.prepare('SELECT id FROM global_loras WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE global_loras SET name = ?, weight = ?, clip_weight = ?, trigger_words = ?, enabled = ? WHERE id = ?'
  ).run(
    name          ?? row.name,
    weight        ?? row.weight,
    clip_weight   ?? row.clip_weight,
    trigger_words ?? row.trigger_words,
    enabled !== undefined ? (enabled ? 1 : 0) : row.enabled,
    req.params.id
  );
  res.json({ ok: true });
});

// DELETE /api/comfy/global-loras/:id
router.delete('/global-loras/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM global_loras WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ─── GET /api/comfy/loras ────────────────────────────────────────────────────
router.get('/loras', async (req, res) => {
  const comfyUrl = getComfyUrl();
  try {
    const resp = await fetch(`${comfyUrl}/object_info/LoraLoader`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return res.json({ loras: [] });
    const data = await resp.json();
    res.json({ loras: data?.LoraLoader?.input?.required?.lora_name?.[0] || [] });
  } catch {
    res.json({ loras: [] });
  }
});

module.exports = router;
