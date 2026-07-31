/* ═════════════════════════════════════════════
   NookResonance — js/modals/mcpAdmin.js
   MCPサーバー設定 / ツール台帳 管理UI（管理者専用・007）
   ═════════════════════════════════════════════ */

// カタログ(GET /api/mcp-admin/catalog)のキャッシュ。command/argsは含まれない(サーバー側で除外済み)
let _mcpCatalog = [];
// 直近の POST /reload 結果。サーバー一覧の「接続状態」列の表示に使う(ポーリングはしない)
let _mcpLastReload = null; // { connected: string[], failed: {label, reason}[] } | null

// 設定モーダルを開いた際にまとめて呼ばれるエントリーポイント
function loadMcpAdminSection() {
  loadMcpCatalog();
  loadMcpServers();
  loadMcpTools();
}

// ── サーバー一覧 ──────────────────────────────
async function loadMcpServers() {
  const container = document.getElementById('mcpServerListContainer');
  if (!container) return;
  try {
    const { servers } = await restGet('mcp-admin/servers');
    renderMcpServerList(servers);
  } catch(e) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:8px 0;">${escHtml(e.message)}</div>`;
  }
}

function mcpStatusBadge(label, enabled) {
  if (!enabled) return `<span style="color:var(--text-pale);">${t('mcp.disabled', '無効')}</span>`;
  if (!_mcpLastReload) return `<span style="color:var(--text-pale);">${t('mcp.unknown', '未確認')}</span>`;
  if (_mcpLastReload.connected.includes(label)) {
    return `<span style="color:#3a9d5b;">${t('mcp.connected', '接続済み')}</span>`;
  }
  const fail = _mcpLastReload.failed.find(f => f.label === label);
  if (fail) {
    return `<span style="color:var(--danger,#c0392b);" title="${escHtml(fail.reason || '')}">${t('mcp.failed', '接続失敗')}</span>`;
  }
  return `<span style="color:var(--text-pale);">${t('mcp.unknown', '未確認')}</span>`;
}

function renderMcpServerList(servers) {
  const container = document.getElementById('mcpServerListContainer');
  if (!container) return;
  if (!servers.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:8px 0;">${t('mcp.servers_empty', 'サーバーがありません')}</div>`;
    return;
  }
  container.innerHTML = servers.map(s => `
    <div class="num-row" style="padding:6px 0;flex-wrap:wrap;gap:6px;">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" ${s.enabled ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px;"
          onchange="toggleMcpServerEnabled(${s.id}, this.checked)">
      </label>
      <div style="min-width:0;flex:1;">
        <div style="font-size:13px;color:var(--text);">${escHtml(s.label)}
          <span style="font-size:10px;color:var(--text-pale);">(${escHtml(s.transport)})</span>
        </div>
        <div style="font-size:11px;">${mcpStatusBadge(s.label, s.enabled)}</div>
      </div>
      <button class="btn-secondary" style="font-size:11px;padding:3px 10px;" onclick="toggleMcpServerEdit(${s.id})">
        ${t('edit', '編集')}
      </button>
      <button class="btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--danger,#c0392b);"
        onclick="deleteMcpServer(${s.id}, '${escHtml(s.label)}')">
        ${t('delete', '削除')}
      </button>
    </div>
    <div id="mcpEditRow_${s.id}" style="display:none;padding:8px 0 12px;border-top:1px dashed var(--border,#ccc);"></div>
    <div class="sep"></div>
  `).join('');
}

async function toggleMcpServerEnabled(id, checked) {
  try {
    await restPatch(`mcp-admin/servers/${id}`, { enabled: checked });
    await loadMcpServers();
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
    await loadMcpServers();
  }
}

async function deleteMcpServer(id, label) {
  const msg = t('mcp.delete_confirm', `MCPサーバー「${label}」を削除しますか？`).replace('{name}', label);
  if (!confirm(msg)) return;
  try {
    await restDelete(`mcp-admin/servers/${id}`);
    showToast(t('mcp.delete_ok', 'MCPサーバーを削除しました'));
    await loadMcpServers();
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
  }
}

// サーバー行の「編集」: ラベル変更 + シークレット再入力(空欄なら既存値を維持)のインライン展開
function toggleMcpServerEdit(id) {
  const row = document.getElementById(`mcpEditRow_${id}`);
  if (!row) return;
  if (row.style.display !== 'none') {
    row.style.display = 'none';
    row.innerHTML = '';
    return;
  }
  restGet('mcp-admin/servers').then(({ servers }) => {
    const s = servers.find(x => x.id === id);
    if (!s) return;
    row.innerHTML = buildMcpEditForm(s);
    row.style.display = '';
  }).catch(e => showToast(t('error', 'エラー') + ': ' + e.message));
}

function buildMcpEditForm(s) {
  let fields = `
    <div class="field" style="margin-bottom:8px;">
      <div class="field-label" data-i18n="mcp.label">${t('mcp.label', 'ラベル')}</div>
      <input class="f-input" id="mcpEditLabel_${s.id}" type="text" value="${escHtml(s.label)}">
    </div>
  `;

  if (s.transport === 'stdio') {
    const entry = _mcpCatalog.find(c => c.id === s.catalog_id);
    const envKeys = entry ? [...(entry.requiredEnvKeys || []), ...(entry.optionalEnvKeys || [])] : [];
    const requiredSet = new Set(entry ? entry.requiredEnvKeys || [] : []);
    fields += `<div style="font-size:11px;color:var(--text-pale);padding:2px 0 6px;">
      ${t('mcp.env_current', 'env')}: ${s.has_env ? t('mcp.env_set', '設定済み') : t('mcp.env_not_set', '未設定')}
      　<span style="font-size:10px;">(${t('mcp.env_blank_keep', '空欄のまま保存すると既存値を維持します')})</span>
    </div>`;
    envKeys.forEach(key => {
      fields += `
        <div class="field" style="margin-bottom:6px;">
          <div class="field-label">${escHtml(key)}${requiredSet.has(key) ? ` <span style="color:var(--accent);">*</span>` : ''}</div>
          <input class="f-input" id="mcpEditEnv_${s.id}_${escHtml(key)}" type="password" autocomplete="new-password" placeholder="${t('mcp.env_blank_keep', '空欄のまま保存すると既存値を維持します')}">
        </div>
      `;
    });
  } else {
    fields += `
      <div class="field" style="margin-bottom:8px;">
        <div class="field-label" data-i18n="mcp.url">${t('mcp.url', 'URL')}</div>
        <input class="f-input mono" id="mcpEditUrl_${s.id}" type="text" value="${escHtml(s.url || '')}">
      </div>
      <div style="font-size:11px;color:var(--text-pale);padding:2px 0 6px;">
        ${t('mcp.headers', 'ヘッダー')}: ${s.has_headers ? t('mcp.env_set', '設定済み') : t('mcp.env_not_set', '未設定')}
        　<span style="font-size:10px;">(${t('mcp.env_blank_keep', '空欄のまま保存すると既存値を維持します')})</span>
      </div>
      <div id="mcpEditHeaderRows_${s.id}"></div>
      <button class="btn-secondary" style="font-size:11px;padding:4px 10px;margin-bottom:8px;" onclick="addMcpHeaderRow('mcpEditHeaderRows_${s.id}')">
        ${t('mcp.add_header', '+ ヘッダーを追加')}
      </button>
    `;
  }

  fields += `
    <div id="mcpEditNote_${s.id}" style="font-size:11px;color:var(--danger,#c0392b);padding:2px 0 8px;display:none;"></div>
    <button class="btn-secondary" style="width:100%;padding:8px;" onclick="saveMcpServerEdit(${s.id}, '${s.transport}')">
      ${t('save', '保存')}
    </button>
  `;
  return fields;
}

async function saveMcpServerEdit(id, transport) {
  const noteEl = document.getElementById(`mcpEditNote_${id}`);
  const showErr = (msg) => { if (noteEl) { noteEl.textContent = msg; noteEl.style.display = ''; } };
  if (noteEl) noteEl.style.display = 'none';

  const label = document.getElementById(`mcpEditLabel_${id}`)?.value?.trim();
  const payload = {};
  if (label) payload.label = label;

  if (transport === 'stdio') {
    const env = {};
    document.querySelectorAll(`[id^="mcpEditEnv_${id}_"]`).forEach(el => {
      const key = el.id.slice(`mcpEditEnv_${id}_`.length);
      if (el.value) env[key] = el.value;
    });
    if (Object.keys(env).length > 0) payload.env = env;
  } else {
    const url = document.getElementById(`mcpEditUrl_${id}`)?.value?.trim();
    if (url) payload.url = url;
    const headers = collectMcpHeaderRows(`mcpEditHeaderRows_${id}`);
    if (Object.keys(headers).length > 0) payload.headers = headers;
  }

  try {
    await restPatch(`mcp-admin/servers/${id}`, payload);
    showToast(t('mcp.save_ok', '保存しました'));
    toggleMcpServerEdit(id); // 折りたたむ
    await loadMcpServers();
  } catch(e) {
    showErr(mcpFriendlyError(e.message));
  }
}

// ── サーバー追加フォーム ──────────────────────
async function loadMcpCatalog() {
  try {
    const { catalog } = await restGet('mcp-admin/catalog');
    _mcpCatalog = catalog;
    const sel = document.getElementById('mcpAddCatalogSelect');
    if (sel) {
      sel.innerHTML = catalog.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.displayName || c.id)}</option>`).join('');
    }
    onMcpAddCatalogChange();
  } catch(e) {
    console.warn('[NR] loadMcpCatalog failed:', e.message);
  }
}

function onMcpAddTransportChange() {
  const transport = document.getElementById('mcpAddTransport')?.value;
  const stdioFields = document.getElementById('mcpAddStdioFields');
  const httpFields = document.getElementById('mcpAddHttpFields');
  if (stdioFields) stdioFields.style.display = transport === 'stdio' ? '' : 'none';
  if (httpFields) httpFields.style.display = transport === 'http' ? '' : 'none';
  updateMcpSecretNote();
}

function onMcpAddCatalogChange() {
  const id = document.getElementById('mcpAddCatalogSelect')?.value;
  const entry = _mcpCatalog.find(c => c.id === id);
  const descEl = document.getElementById('mcpAddCatalogDesc');
  if (descEl) descEl.textContent = entry?.description || '';

  const envContainer = document.getElementById('mcpAddEnvFields');
  if (!envContainer) return;
  if (!entry) { envContainer.innerHTML = ''; return; }

  const required = entry.requiredEnvKeys || [];
  const optional = entry.optionalEnvKeys || [];
  envContainer.innerHTML = [...required, ...optional].map(key => `
    <div class="field" style="margin-bottom:6px;">
      <div class="field-label">${escHtml(key)}${required.includes(key) ? ` <span style="color:var(--accent);">*</span> (${t('mcp.required', '必須')})` : ` (${t('mcp.optional', '任意')})`}</div>
      <input class="f-input" id="mcpAddEnv_${escHtml(key)}" type="password" autocomplete="new-password">
    </div>
  `).join('');
  updateMcpSecretNote();
}

function updateMcpSecretNote() {
  const note = document.getElementById('mcpSecretNote');
  if (note) note.textContent = '';
}

function addMcpHeaderRow(containerId) {
  const container = document.getElementById(containerId || 'mcpAddHeaderRows');
  if (!container) return;
  const rowId = 'mcpHeaderRow_' + Math.random().toString(36).slice(2, 9);
  const div = document.createElement('div');
  div.id = rowId;
  div.className = 'num-row';
  div.style.cssText = 'gap:6px;padding:2px 0;';
  div.innerHTML = `
    <input class="f-input" type="text" placeholder="${t('mcp.header_name', 'ヘッダー名')}" style="flex:1;" data-hkey>
    <input class="f-input" type="password" autocomplete="new-password" placeholder="${t('mcp.header_value', '値')}" style="flex:1;" data-hval>
    <button class="btn-secondary" style="font-size:11px;padding:3px 8px;" onclick="document.getElementById('${rowId}').remove()">✕</button>
  `;
  container.appendChild(div);
}

function collectMcpHeaderRows(containerId) {
  const container = document.getElementById(containerId || 'mcpAddHeaderRows');
  const headers = {};
  if (!container) return headers;
  container.querySelectorAll('.num-row').forEach(row => {
    const key = row.querySelector('[data-hkey]')?.value?.trim();
    const val = row.querySelector('[data-hval]')?.value;
    if (key && val) headers[key] = val;
  });
  return headers;
}

// SECRET_ENC_KEY未設定時の400メッセージに、.env設定が必要である旨の案内を添えて表示する
function mcpFriendlyError(message) {
  if (message && message.indexOf('SECRET_ENC_KEY') !== -1) {
    return message + ' — ' + t('mcp.secret_key_missing_note', '.env に SECRET_ENC_KEY を設定してサーバーを再起動してください');
  }
  return message;
}

async function addMcpServer() {
  const note = document.getElementById('mcpSecretNote');
  if (note) note.textContent = '';

  const transport = document.getElementById('mcpAddTransport')?.value;
  const label = document.getElementById('mcpAddLabel')?.value?.trim();
  if (!label) { showToast(t('mcp.label_required', 'ラベルを入力してください')); return; }

  const payload = { transport, label };

  if (transport === 'stdio') {
    const catalogId = document.getElementById('mcpAddCatalogSelect')?.value;
    if (!catalogId) { showToast(t('mcp.catalog_required', 'カタログを選択してください')); return; }
    payload.catalog_id = catalogId;
    const entry = _mcpCatalog.find(c => c.id === catalogId);
    const env = {};
    [...(entry?.requiredEnvKeys || []), ...(entry?.optionalEnvKeys || [])].forEach(key => {
      const val = document.getElementById(`mcpAddEnv_${key}`)?.value;
      if (val) env[key] = val;
    });
    payload.env = env;
  } else {
    const url = document.getElementById('mcpAddUrl')?.value?.trim();
    if (!url) { showToast(t('mcp.url_required', 'URLを入力してください')); return; }
    payload.url = url;
    payload.headers = collectMcpHeaderRows('mcpAddHeaderRows');
  }

  try {
    await restPost('mcp-admin/servers', payload);
    showToast(t('mcp.add_ok', 'MCPサーバーを追加しました'));
    document.getElementById('mcpAddLabel').value = '';
    const headerRows = document.getElementById('mcpAddHeaderRows');
    if (headerRows) headerRows.innerHTML = '';
    document.getElementById('mcpAddUrl') && (document.getElementById('mcpAddUrl').value = '');
    onMcpAddCatalogChange(); // env欄をクリア
    await loadMcpServers();
  } catch(e) {
    const friendly = mcpFriendlyError(e.message);
    if (note) note.textContent = friendly;
    else showToast(t('error', 'エラー') + ': ' + friendly);
  }
}

// ── 再接続 ──────────────────────────────────
async function reloadMcpServers() {
  const resultEl = document.getElementById('mcpReloadResult');
  try {
    const result = await restPost('mcp-admin/reload', {});
    _mcpLastReload = result;
    if (resultEl) {
      const connectedStr = result.connected.length ? result.connected.join(', ') : '-';
      const failedStr = result.failed.length ? result.failed.map(f => `${f.label} (${f.reason})`).join(', ') : '-';
      resultEl.innerHTML = `${t('mcp.connected', '接続済み')}: ${escHtml(connectedStr)}<br>${t('mcp.failed', '接続失敗')}: ${escHtml(failedStr)}`;
      resultEl.style.display = '';
    }
    showToast(t('mcp.reload_ok', '再接続しました'));
    await loadMcpServers();
    await loadMcpTools();
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
  }
}

// ── ツール台帳 ──────────────────────────────
async function loadMcpTools() {
  const container = document.getElementById('mcpToolListContainer');
  if (!container) return;
  try {
    const { tools } = await restGet('mcp-admin/tools');
    renderMcpToolList(tools);
  } catch(e) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:8px 0;">${escHtml(e.message)}</div>`;
  }
}

function renderMcpToolList(tools) {
  const container = document.getElementById('mcpToolListContainer');
  if (!container) return;
  if (!tools.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:8px 0;">${t('mcp.tools_empty', 'ツールがありません')}</div>`;
    return;
  }
  container.innerHTML = tools.map(tool => `
    <div class="num-row" style="padding:6px 0;">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" ${tool.enabled ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px;"
          onchange="toggleMcpTool('${escHtml(tool.name)}', this.checked)">
      </label>
      <div style="min-width:0;flex:1;">
        <div style="font-size:13px;color:var(--text);">${escHtml(tool.name)}</div>
        <div style="font-size:11px;color:var(--text-pale);">${escHtml(tool.origin)}${tool.description ? ' — ' + escHtml(tool.description) : ''}</div>
      </div>
    </div>
    <div class="sep"></div>
  `).join('');
}

async function toggleMcpTool(name, checked) {
  try {
    await restPatch(`mcp-admin/tools/${encodeURIComponent(name)}`, { enabled: checked });
  } catch(e) {
    showToast(t('error', 'エラー') + ': ' + e.message);
    await loadMcpTools();
  }
}
