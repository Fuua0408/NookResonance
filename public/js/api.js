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

  // ログインユーザー名表示
  const userEl = document.getElementById('settingsUsername');
  if (userEl) userEl.textContent = getCurrentUser()?.username || '';

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
    userName:         getFieldValue('userName'),
    userAppearance:   getFieldValue('userAppearance'),
    userAppearanceEn: getFieldValue('userAppearanceEn'),
    accentColor:      document.getElementById('customColorInput')?.value || '#8b6348',
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
