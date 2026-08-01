/* ═════════════════════════════════════════════
   NookResonance — api.js
   設定管理・JWT認証・REST API通信
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 設定（localStorage）
// ─────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch(e) { return {}; }
}
function saveSettings(patch) {
  const next = Object.assign(loadSettings(), patch);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}
function getSetting(key, fallback) {
  const val = loadSettings()[key];
  if (val === undefined || val === null) return (fallback ?? '');
  // サーバー同期時に文字列化された真偽値を復元
  if (val === 'true')  return true;
  if (val === 'false') return false;
  return val;
}

// ─────────────────────────────────────────────
// フォームユーティリティ
// ─────────────────────────────────────────────
function setFieldValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}
function getFieldValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}
function setNumVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function getNumVal(id) {
  return parseInt(document.getElementById(id)?.textContent || '0');
}

// ─────────────────────────────────────────────
// JWT 認証
// ─────────────────────────────────────────────
const AUTH_KEY = 'nr_auth';

function getAuthToken() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')?.token || null; }
  catch(e) { return null; }
}
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')?.user || null; }
  catch(e) { return null; }
}
function setAuth(token, user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
}
function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}
function isRestEnabled() {
  return !!getAuthToken();
}

async function login(username, password) {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || 'ログインに失敗しました');
  }
  const data = await resp.json();
  setAuth(data.token, data.user);
  return data;
}

function logout() {
  clearAuth();
  location.reload();
}

async function changePassword(currentPassword, newPassword) {
  const resp = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || 'パスワード変更に失敗しました');
  }
  return resp.json();
}

function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.add('open');
}
function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ─────────────────────────────────────────────
// 設定UI
// ─────────────────────────────────────────────
function initSettingsUI() {
  const s = loadSettings();

  // ユーザー共通設定
  setFieldValue('userName',         s.userName         || '');
  setFieldValue('userAppearance',   s.userAppearance   || '');
  setFieldValue('userAppearanceEn', s.userAppearanceEn || '');
  const uEnCache = document.getElementById('userEnCacheDisplay');
  if (uEnCache) uEnCache.textContent = s.userAppearanceEn || t('misc.not_generated', '（未生成）');

  if (s.accentColor) applyThemeColor(s.accentColor);
  const inp = document.getElementById('customColorInput');
  if (inp) inp.value = s.accentColor || '#8b6348';

  // タイプライター表示（既定 有効）
  const twEl = document.getElementById('typewriterEnabled');
  if (twEl) twEl.checked = getSetting('typewriterEnabled', true) !== false;

  // ログインユーザー名表示
  const userEl = document.getElementById('settingsUsername');
  if (userEl) userEl.textContent = getCurrentUser()?.username || '';
  const mcpEndpointEl = document.getElementById('mcpEndpointDisplay');
  if (mcpEndpointEl) mcpEndpointEl.textContent = `${location.origin}/mcp`;
  const mcpKeyNewBox = document.getElementById('mcpKeyNewBox');
  if (mcpKeyNewBox) mcpKeyNewBox.style.display = 'none';
  if (getAuthToken()) loadMcpKeys();

  // 管理者専用セクション（値の反映 + 表示制御）
  const isAdmin = !!getCurrentUser()?.is_admin;
  const adminSec = document.getElementById('adminSettingsSection');
  const adminSep = document.getElementById('adminSettingsSep');
  if (adminSec) adminSec.style.display = isAdmin ? '' : 'none';
  if (adminSep) adminSep.style.display = isAdmin ? '' : 'none';

  if (isAdmin) {
    // 文字列・真偽値どちらにも対応したbool読み取り
    const bool = (val, def) => {
      if (val === undefined || val === null || val === '') return def;
      if (typeof val === 'boolean') return val;
      return String(val) === 'true';
    };

    setNumVal('sessionTurns',    Number(s.sessionTurns)    || 50);
    setNumVal('sessionLimit',    Number(s.sessionLimit)    || 5);
    setNumVal('llmHistoryTurns', s.llmHistoryTurns != null ? Number(s.llmHistoryTurns) : 10);

    const psEl = document.getElementById('promptStyleNatural');
    if (psEl) psEl.checked = bool(s.promptStyleNatural, true);
    const ntEl = document.getElementById('noThinkTranslate');
    if (ntEl) ntEl.checked = bool(s.noThinkTranslate, false);
    const dbEl = document.getElementById('debugMode');
    if (dbEl) dbEl.checked = bool(s.debugMode, false);

    const afEl = document.getElementById('affectionGlobalEnabled');
    if (afEl) afEl.checked = bool(s.affectionEnabled, true);
    const amEl = document.getElementById('affectionGlobalMutable');
    if (amEl) amEl.checked = bool(s.affectionMutable, true);
    const affeEl = document.getElementById('affectionForceEdit');
    if (affeEl) affeEl.checked = bool(s.affectionForceEdit, false);
    const afptEl = document.getElementById('affectionPerTurn');
    if (afptEl) afptEl.checked = bool(s.affectionPerTurn, false);
  }
}

// グローバルWF設定をUIに反映（管理者用）
/*
  const userId = getCurrentUser()?.id;
  if (userId === undefined || userId === null) {
    showToast(t('toast.login_required', 'ログインが必要です'));
    return;
  }
  copyToClipboard(String(userId));
*/

function copyMcpEndpoint() {
  copyToClipboard(`${location.origin}/mcp`);
}

// ─────────────────────────────────────────────
// MCP アクセスキー管理
// ─────────────────────────────────────────────
let _mcpNewKeyValue = ''; // 発行直後のみ保持。コピー用（画面には常時表示しない）

async function loadMcpKeys() {
  const listEl = document.getElementById('mcpKeyList');
  if (!listEl) return;
  try {
    const { keys } = await restGet('mcp-keys');
    renderMcpKeys(keys || []);
  } catch (e) {
    renderMcpKeysError(e.message);
  }
}

// 取得失敗を「キー0本」と区別できるよう、専用のエラー表示にする（重複発行の事故を防ぐ）
function renderMcpKeysError(message) {
  const listEl = document.getElementById('mcpKeyList');
  const emptyEl = document.getElementById('mcpKeyEmpty');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (emptyEl) {
    emptyEl.textContent = `${t('settings.mcp_key_load_error', 'キー一覧の取得に失敗しました')}: ${message}`;
    emptyEl.style.color = 'var(--danger, #c0392b)';
    emptyEl.style.display = '';
  }
}

function renderMcpKeys(keys) {
  const listEl = document.getElementById('mcpKeyList');
  const emptyEl = document.getElementById('mcpKeyEmpty');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (emptyEl) {
    emptyEl.textContent = t('settings.mcp_key_empty', 'アクセスキーはまだありません');
    emptyEl.style.color = '';
    emptyEl.style.display = keys.length ? 'none' : '';
  }

  for (const key of keys) {
    const row = document.createElement('div');
    row.className = 'num-row';

    const info = document.createElement('div');
    info.style.minWidth = '0';
    info.style.flex = '1';

    const labelEl = document.createElement('div');
    labelEl.style.fontSize = '13px';
    labelEl.textContent = key.label || t('settings.mcp_key_unlabeled', '(no label)');

    const prefixEl = document.createElement('div');
    prefixEl.className = 'mono';
    prefixEl.style.cssText = 'font-size:11px;color:var(--text-dim);';
    prefixEl.textContent = `${key.key_prefix}…`;

    const usedEl = document.createElement('div');
    usedEl.style.cssText = 'font-size:11px;color:var(--text-pale);';
    usedEl.textContent = key.last_used_at
      ? `${t('settings.mcp_key_last_used', 'Last used')}: ${key.last_used_at}`
      : t('settings.mcp_key_never_used', 'Never used');

    info.appendChild(labelEl);
    info.appendChild(prefixEl);
    info.appendChild(usedEl);

    const revokeBtn = document.createElement('button');
    revokeBtn.className = 'btn-secondary';
    revokeBtn.style.cssText = 'font-size:11px;padding:4px 10px;flex-shrink:0;';
    revokeBtn.textContent = t('settings.mcp_key_revoke', 'Revoke');
    revokeBtn.onclick = () => revokeMcpKey(key.id, key.label || key.key_prefix);

    row.appendChild(info);
    row.appendChild(revokeBtn);
    listEl.appendChild(row);
  }
}

async function issueMcpKey() {
  const input = document.getElementById('mcpKeyLabelInput');
  const label = input ? input.value.trim() : '';
  try {
    const { key } = await restPost('mcp-keys', { label });
    if (input) input.value = '';
    _mcpNewKeyValue = key.key;
    const box = document.getElementById('mcpKeyNewBox');
    const valueEl = document.getElementById('mcpKeyNewValue');
    if (valueEl) valueEl.textContent = key.key;
    if (box) box.style.display = '';
    await loadMcpKeys();
  } catch (e) {
    showToast(e.message || t('toast.error', 'エラーが発生しました'));
  }
}

function copyNewMcpKey() {
  if (!_mcpNewKeyValue) return;
  copyToClipboard(_mcpNewKeyValue);
}

async function revokeMcpKey(id, displayName) {
  const msg = t('mcp.key_revoke_confirm', `アクセスキー「${displayName}」を失効させますか？このキーを使っているクライアントは即座に使えなくなります。`).replace('{name}', displayName);
  if (!confirm(msg)) return;
  try {
    await restDelete(`mcp-keys/${id}`);
    const box = document.getElementById('mcpKeyNewBox');
    if (box) box.style.display = 'none';
    await loadMcpKeys();
  } catch (e) {
    showToast(e.message || t('toast.error', 'エラーが発生しました'));
  }
}

window.copyMcpEndpoint = copyMcpEndpoint;
window.issueMcpKey = issueMcpKey;
window.copyNewMcpKey = copyNewMcpKey;
window.revokeMcpKey = revokeMcpKey;

async function loadAdminWfSettings() {
  try {
    const s = await restGet('settings');
    const wfSel = document.getElementById('globalWfSelect');
    if (wfSel && s.global_wf_workflow_id) wfSel.value = s.global_wf_workflow_id;
    setFieldValue('globalWfSteps',  s.global_wf_steps  || '');
    setFieldValue('globalWfCfg',    s.global_wf_cfg    || '');
    setFieldValue('globalWfWidth',  s.global_wf_width  || '');
    setFieldValue('globalWfHeight', s.global_wf_height || '');
    const samplerSel   = document.getElementById('globalWfSampler');
    const schedulerSel = document.getElementById('globalWfScheduler');
    if (samplerSel   && s.global_wf_sampler)   samplerSel.value   = s.global_wf_sampler;
    if (schedulerSel && s.global_wf_scheduler) schedulerSel.value = s.global_wf_scheduler;
    setFieldValue('globalQualityTags', s.global_quality_tags || '');
    setFieldValue('globalNegative',    s.global_negative     || '');
  } catch(e) {
    console.warn('[NR] loadAdminWfSettings failed:', e.message);
  }
}

async function saveSettingsFromUI() {
  const isAdmin = !!getCurrentUser()?.is_admin;

  // 全ユーザー共通設定
  const language = document.getElementById('settingsLanguage')?.value || 'ja';
  const userSettings = {
    userName:          getFieldValue('userName'),
    userAppearance:    getFieldValue('userAppearance'),
    userAppearanceEn:  getFieldValue('userAppearanceEn'),
    accentColor:       document.getElementById('customColorInput')?.value || '#8b6348',
    typewriterEnabled: document.getElementById('typewriterEnabled')?.checked !== false,
    language,
  };
  saveSettings(userSettings);

  if (!isAdmin) {
    // 非管理者はlocalStorageのみ更新（サーバーPUTは403なので不要）
    closeModal('settingsOverlay');
    showToast(t('settings.save_ok', '設定を保存しました'));
    return;
  }

  // 管理者: 全設定をサーバーへ保存
  const adminPayload = {
    ...userSettings,
    // セッション設定
    sessionTurns:       getNumVal('sessionTurns'),
    sessionLimit:       getNumVal('sessionLimit'),
    llmHistoryTurns:    getNumVal('llmHistoryTurns'),
    // プロンプトスタイル
    promptStyleNatural: document.getElementById('promptStyleNatural')?.checked !== false,
    noThinkTranslate:   document.getElementById('noThinkTranslate')?.checked === true,
    debugMode:          document.getElementById('debugMode')?.checked === true,
    // 親愛度
    affectionEnabled:   document.getElementById('affectionGlobalEnabled')?.checked ?? true,
    affectionMutable:   document.getElementById('affectionGlobalMutable')?.checked ?? true,
    affectionForceEdit: document.getElementById('affectionForceEdit')?.checked     ?? false,
    affectionPerTurn:   document.getElementById('affectionPerTurn')?.checked       ?? false,
  };

  // グローバルWF設定
  const gwf = document.getElementById('globalWfSelect')?.value || '';
  if (gwf) adminPayload.global_wf_workflow_id = gwf;
  const steps  = getFieldValue('globalWfSteps');
  const cfg    = getFieldValue('globalWfCfg');
  const width  = getFieldValue('globalWfWidth');
  const height = getFieldValue('globalWfHeight');
  const sampler   = document.getElementById('globalWfSampler')?.value   || '';
  const scheduler = document.getElementById('globalWfScheduler')?.value || '';
  if (steps)     adminPayload.global_wf_steps     = steps;
  if (cfg)       adminPayload.global_wf_cfg       = cfg;
  if (width)     adminPayload.global_wf_width     = width;
  if (height)    adminPayload.global_wf_height    = height;
  if (sampler)   adminPayload.global_wf_sampler   = sampler;
  if (scheduler) adminPayload.global_wf_scheduler = scheduler;

  const qualityTags = getFieldValue('globalQualityTags');
  const negative    = getFieldValue('globalNegative');
  if (qualityTags) adminPayload.global_quality_tags = qualityTags;
  if (negative)    adminPayload.global_negative     = negative;

  saveSettings(adminPayload);

  try {
    await restPut('settings', adminPayload);
    showToast(t('settings.save_ok', '設定を保存しました（サーバー同期済）'));
  } catch(e) {
    showToast(t('settings.save_ok', '設定を保存しました（サーバー同期失敗）'));
    console.warn('[NR] settings PUT failed:', e.message);
  }

  closeModal('settingsOverlay');
}

// ─────────────────────────────────────────────
// REST API
// ─────────────────────────────────────────────
function restHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`,
  };
}
async function restGet(path) {
  try {
    const resp = await fetch(`/api/${path}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    });
    if (resp.status === 401) { showLoginOverlay(); throw new Error(t('toast.login_required', 'ログインが必要です')); }
    if (resp.status === 404) throw new Error(`${path} が見つかりません`);
    if (!resp.ok) throw new Error(`サーバーエラー (${resp.status})`);
    return resp.json();
  } catch(e) {
    if (e.name === 'TypeError') throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));
    throw e;
  }
}
async function restPost(path, data) {
  try {
    const resp = await fetch(`/api/${path}`, {
      method:  'POST',
      headers: restHeaders(),
      body:    JSON.stringify(data),
    });
    if (resp.status === 401) { showLoginOverlay(); throw new Error(t('toast.login_required', 'ログインが必要です')); }
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new Error(body?.error || `サーバーエラー (${resp.status})`);
    }
    return resp.json();
  } catch(e) {
    if (e.name === 'TypeError') throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));
    throw e;
  }
}
async function restPut(path, data) {
  try {
    const resp = await fetch(`/api/${path}`, {
      method:  'PUT',
      headers: restHeaders(),
      body:    JSON.stringify(data),
    });
    if (resp.status === 401) { showLoginOverlay(); throw new Error(t('toast.login_required', 'ログインが必要です')); }
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new Error(body?.error || `サーバーエラー (${resp.status})`);
    }
    return resp.json();
  } catch(e) {
    if (e.name === 'TypeError') throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));
    throw e;
  }
}
async function restPatch(path, data) {
  try {
    const resp = await fetch(`/api/${path}`, {
      method:  'PATCH',
      headers: restHeaders(),
      body:    JSON.stringify(data),
    });
    if (resp.status === 401) { showLoginOverlay(); throw new Error(t('toast.login_required', 'ログインが必要です')); }
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new Error(body?.error || `サーバーエラー (${resp.status})`);
    }
    return resp.json();
  } catch(e) {
    if (e.name === 'TypeError') throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));
    throw e;
  }
}
async function restDelete(path) {
  try {
    const resp = await fetch(`/api/${path}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    });
    if (resp.status === 401) { showLoginOverlay(); throw new Error(t('toast.login_required', 'ログインが必要です')); }
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new Error(body?.error || `サーバーエラー (${resp.status})`);
    }
    return resp.json();
  } catch(e) {
    if (e.name === 'TypeError') throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));
    throw e;
  }
}

// SSE（Server-Sent Events）でPOSTし、行単位でパースして event/data を呼び出し側に渡す。
// EventSourceはカスタムヘッダ（JWT）を送れないため fetch + ReadableStream で読む。
// `error` イベントを受け取った場合は例外として投げる（呼び出し側は try/catch で拾う）。
// 未知のイベント名は onEvent へそのまま渡す（呼び出し側で無視すればよい。005以降の拡張用）。
async function restPostStream(path, data, { onEvent, signal } = {}) {
  let resp;
  try {
    resp = await fetch(`/api/${path}`, {
      method:  'POST',
      headers: restHeaders(),
      body:    JSON.stringify(data),
      signal,
    });
  } catch(e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));
  }

  if (resp.status === 401) { showLoginOverlay(); throw new Error(t('toast.login_required', 'ログインが必要です')); }
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw new Error(body?.error || `サーバーエラー (${resp.status})`);
  }
  if (!resp.body) throw new Error(t('toast.cannot_connect', 'サーバーに接続できません'));

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  function dispatch(eventName, dataStr) {
    let payload;
    try { payload = dataStr ? JSON.parse(dataStr) : {}; }
    catch(e) { payload = {}; }
    if (eventName === 'error') {
      throw new Error(payload.error || 'LLMエラー');
    }
    if (typeof onEvent === 'function') onEvent(eventName, payload);
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSEイベントは空行区切り（\n\n）。末尾の未完了分はbufferへ残す
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop();

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        let eventName = 'message';
        const dataLines = [];
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        dispatch(eventName, dataLines.join('\n'));
      }
    }
  } finally {
    try { reader.cancel(); } catch(e) { /* noop */ }
  }
}

// ─────────────────────────────────────────────
// 言語ユーティリティ（Phase.0: フラグ参照のみ）
// ─────────────────────────────────────────────
function getCurrentLanguage() {
  return getSetting('language', 'ja');
}
function isEnglishMode() {
  return getCurrentLanguage() === 'en';
}

// ─────────────────────────────────────────────
// ユーザー管理UI（管理者のみ）
// ─────────────────────────────────────────────
async function loadUserList() {
  const container = document.getElementById('userListContainer');
  if (!container) return;
  try {
    const users = await restGet('users');
    renderUserList(users);
  } catch(e) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:8px 0;">${escHtml(e.message)}</div>`;
  }
}

function renderUserList(users) {
  const container = document.getElementById('userListContainer');
  if (!container) return;
  if (!users.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:8px 0;">${t('settings.users_empty', 'ユーザーなし')}</div>`;
    return;
  }
  container.innerHTML = users.map(u => {
    if (u.is_admin) {
      return `<div class="num-row" style="padding:6px 0;">
        <div style="font-size:13px;color:var(--text);flex:1;">${escHtml(u.username)}</div>
        <div style="font-size:11px;color:var(--accent);padding:2px 8px;border:1px solid var(--accent);border-radius:4px;">${t('settings.users_admin_badge', '管理者')}</div>
      </div>`;
    }
    const isAdv = !!u.is_advanced;
    return `<div class="num-row" style="padding:6px 0;">
      <div style="font-size:13px;color:var(--text);flex:1;">${escHtml(u.username)}</div>
      <button class="btn-secondary" style="font-size:11px;padding:3px 10px;"
        onclick="toggleUserAdvanced(${u.id}, ${isAdv})">
        ${isAdv ? t('settings.users_demote', '上級者 ✓') : t('settings.users_promote', '昇格')}
      </button>
      <button class="btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--danger,#c0392b);"
        onclick="deleteUser(${u.id}, '${escHtml(u.username)}')">
        ${t('settings.users_delete', '削除')}
      </button>
    </div>`;
  }).join('<div class="sep"></div>');
}

async function toggleUserAdvanced(userId, currentState) {
  try {
    await restPut(`users/${userId}`, { is_advanced: !currentState });
    await loadUserList();
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
  }
}

async function deleteUser(userId, username) {
  const msg = t('settings.users_delete_confirm', `「${username}」を削除しますか？\nキャラクター・セッション・生成画像もすべて削除されます。`).replace('{name}', username);
  if (!confirm(msg)) return;
  try {
    await restDelete(`users/${userId}`);
    showToast(t('settings.users_delete_ok', 'ユーザーを削除しました'));
    await loadUserList();
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
  }
}

async function addUser() {
  const username = document.getElementById('newUsername')?.value?.trim();
  const password = document.getElementById('newPassword')?.value;
  if (!username || !password) { showToast(t('settings.users_add_required', 'ユーザー名とパスワードを入力してください')); return; }
  try {
    await restPost('users', { username, password });
    showToast(t('settings.users_add_ok', `「${username}」を追加しました`).replace('{name}', username));
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    await loadUserList();
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
  }
}
