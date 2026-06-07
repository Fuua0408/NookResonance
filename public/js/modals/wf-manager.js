/* ═════════════════════════════════════════════
   ComfyDeck Nook — js/modals/wf-manager.js
   ワークフロー管理モーダル
   ═════════════════════════════════════════════ */

function loadCustomWfs() {
  return _customWfs;
}

function cacheCustomWfs(wfs) {
  _customWfs = wfs;
  saveSettings({ customWorkflows: wfs }); // localStorageにもキャッシュ
}

async function fetchCustomWfsFromServer() {
  if (!isRestEnabled()) {
    _customWfs = getSetting('customWorkflows', []);
    return;
  }
  try {
    const wfs = await restGet('workflows');
    cacheCustomWfs(wfs);
  } catch(e) {
    console.warn('[Nook] fetchCustomWfs failed:', e.message);
    _customWfs = getSetting('customWorkflows', []);
  }
}

function openWfModal() {
  closeModal('settingsOverlay');
  setTimeout(async () => {
    await fetchCustomWfsFromServer();
    renderWfList();
    openModal('wfOverlay');
  }, 200);
}

function renderWfList() {
  const panel = document.getElementById('wfList');
  if (!panel) return;
  panel.innerHTML = '';

  getAllWorkflows().forEach((wf, idx) => {
    const isBuiltin = idx < BUILTIN_WORKFLOWS.length;
    const div = document.createElement('div');
    div.className = 'char-card';
    div.style.cursor = 'default';
    const wfJson = JSON.stringify(wf).replace(/"/g, '&quot;');
    div.innerHTML = `
      <div class="char-avatar" style="font-size:22px;">${escHtml(wf.emoji || '⚙')}</div>
      <div class="char-info">
        <div class="char-name">${escHtml(wf.name)}</div>
        <div class="char-meta">${isBuiltin ? 'ビルトイン' : 'カスタム'}</div>
        <div class="char-wf">Steps:${wf.defaults?.steps} CFG:${wf.defaults?.cfg} ${wf.defaults?.width}x${wf.defaults?.height}</div>
      </div>
      <div class="char-actions">
        ${!isBuiltin
          ? `<div class="btn-icon-sm" onclick='openWfEdit(${wfJson})'>✏</div>`
          : `<div class="btn-icon-sm" style="opacity:0.3;cursor:default;">✏</div>`
        }
      </div>
    `;
    panel.appendChild(div);
  });
}

function openWfEdit(wf) {
  const isNew = !wf;
  document.getElementById('wfEditTitle').textContent = isNew ? 'ワークフロー追加' : 'ワークフロー編集';
  document.getElementById('wfDeleteBtn').style.display = isNew ? 'none' : '';
  document.getElementById('wfEditOverlay').dataset.wfId = wf?.id || '';

  setFieldValue('wfEditName',       wf?.name              || '');
  setFieldValue('wfEditEmoji',      wf?.emoji             || '🎨');
  setFieldValue('wfEditSteps',      wf?.defaults?.steps   || '');
  setFieldValue('wfEditCfg',        wf?.defaults?.cfg     || '');
  setFieldValue('wfEditWidth',      wf?.defaults?.width   || '');
  setFieldValue('wfEditHeight',     wf?.defaults?.height  || '');
  setFieldValue('wfEditSampler',    wf?.defaults?.sampler || '');
  setFieldValue('wfEditScheduler',  wf?.defaults?.scheduler || '');
  setFieldValue('wfEditNegDefault', wf?.negative_default  || '');
  setFieldValue('wfEditJson',       wf?.json ? JSON.stringify(wf.json, null, 2) : '');

  const container = document.getElementById('wfMappingFields');
  container.innerHTML = '';
  WF_MAP_FIELDS.forEach(f => {
    const val = wf?.mapping?.[f.key] || '';
    const div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = `
      <div class="field-label">${escHtml(f.label)}${f.required ? ' <span style="color:var(--accent);">*</span>' : ''}</div>
      <input class="f-input mono" type="text" id="wfMap_${f.key}"
        placeholder="${escHtml(f.desc)}" value="${escHtml(val)}">
    `;
    container.appendChild(div);
  });

  closeModal('wfOverlay');
  setTimeout(() => openModal('wfEditOverlay'), 200);
}

async function saveWfFromUI() {
  const overlay = document.getElementById('wfEditOverlay');
  const wfId    = overlay?.dataset.wfId || '';
  const isNew   = !wfId;

  const jsonStr = getFieldValue('wfEditJson');
  let wfJson = null;
  if (jsonStr) {
    try { wfJson = JSON.parse(jsonStr); }
    catch(e) { showToast('❌ JSONが不正です: ' + e.message.slice(0, 40)); return; }
  }

  const mapping = {};
  WF_MAP_FIELDS.forEach(f => {
    const val = document.getElementById(`wfMap_${f.key}`)?.value?.trim();
    if (val) mapping[f.key] = val;
  });

  const wf = {
    id:      wfId || ('wf_' + Date.now()),
    name:    getFieldValue('wfEditName')    || '無名のWF',
    emoji:   getFieldValue('wfEditEmoji')   || '🎨',
    defaults: {
      steps:     parseInt(getFieldValue('wfEditSteps'))    || 20,
      cfg:       parseFloat(getFieldValue('wfEditCfg'))    || 7,
      width:     parseInt(getFieldValue('wfEditWidth'))    || 1024,
      height:    parseInt(getFieldValue('wfEditHeight'))   || 1024,
      sampler:   getFieldValue('wfEditSampler')   || 'euler',
      scheduler: getFieldValue('wfEditScheduler') || 'simple',
    },
    negative_default: getFieldValue('wfEditNegDefault') || '',
    mapping,
    json: wfJson,
  };

  // REST保存
  if (isRestEnabled()) {
    try {
      if (isNew || wf.id.startsWith('wf_')) {
        const res = await restPost('workflows', wf);
        wf.id = res.id;
      } else {
        await restPut(`workflows/${wf.id}`, wf);
      }
    } catch(e) {
      showToast('⚠ サーバー保存失敗: ' + e.message.slice(0, 40));
    }
  }

  // キャッシュ更新
  const customs = loadCustomWfs().filter(w => w.id !== wfId);
  customs.push(wf);
  cacheCustomWfs(customs);

  renderWfSelect();
  showToast('保存しました');
  closeModal('wfEditOverlay');
  setTimeout(() => { renderWfList(); openModal('wfOverlay'); }, 200);
}

async function deleteCustomWf() {
  const overlay = document.getElementById('wfEditOverlay');
  const wfId    = overlay?.dataset.wfId;
  if (!wfId) return;
  if (!confirm('このワークフローを削除しますか？')) return;

  if (isRestEnabled()) {
    try { await restDelete(`workflows/${wfId}`); }
    catch(e) { console.warn('[Nook] deleteWf failed:', e.message); }
  }

  cacheCustomWfs(loadCustomWfs().filter(w => w.id !== wfId));
  renderWfSelect();
  showToast('削除しました');
  closeModal('wfEditOverlay');
  setTimeout(() => { renderWfList(); openModal('wfOverlay'); }, 200);
}
