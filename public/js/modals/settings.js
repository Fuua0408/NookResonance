/* ═════════════════════════════════════════════
   ComfyDeck Nook — js/modals/settings.js
   設定モーダル・テーマカラー
   ═════════════════════════════════════════════ */

function openSettingsModal() {
  if (typeof initAffectionSettings === 'function') initAffectionSettings();
  initSettingsUI();
  const langSel = document.getElementById('settingsLanguage');
  if (langSel) langSel.value = getSetting('language', 'ja');
  if (getCurrentUser()?.is_admin) {
    // グローバルWF設定読み込み（サンプラーリスト + 保存値）
    fetchSamplerList().then(() => loadAdminWfSettings());
    // グローバルWFセレクトを populateWfSelect と共有
    if (typeof renderWfSelect === 'function') renderWfSelect('globalWfSelect');
    // ユーザー管理一覧を読み込み
    loadUserList();
    // MCPサーバー/ツール管理セクションを読み込み
    if (typeof loadMcpAdminSection === 'function') loadMcpAdminSection();
  }
  openModal('settingsOverlay');
}

function applyThemeColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  document.documentElement.style.setProperty('--accent', hex);
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const h = n => Math.min(255,n).toString(16).padStart(2,'0');
  document.documentElement.style.setProperty('--accent-light', `#${h(r+80)}${h(g+80)}${h(b+80)}`);
}

function setThemeColor(hex, dotEl) {
  applyThemeColor(hex);
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  if (dotEl) dotEl.classList.add('active');
  const inp = document.getElementById('customColorInput');
  if (inp) inp.value = hex;
}
