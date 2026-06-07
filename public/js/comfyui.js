/* ═════════════════════════════════════════════
   NookResonance — comfyui.js
   ComfyUI生成はサーバー経由。UI用メタデータ取得のみフロント側。
   ═════════════════════════════════════════════ */

let _globalLoraList = [];

// ─────────────────────────────────────────────
// LoRAトリガーワード（translatePrompt用）
// ─────────────────────────────────────────────
function getLoRATriggerWords() {
  const loras = (activeChar?.workflow_params?.loras || []).filter(l => l.enabled !== false && l.triggerWords);
  return loras.map(l => l.triggerWords).join(', ');
}

// ─────────────────────────────────────────────
// 画像生成（サーバー経由）
// ─────────────────────────────────────────────
async function generateImage(enPrompt, fixedSeed = null) {
  const params = activeChar?.workflow_params || {};
  const turnId = (activeSession?.turns?.length || 0) + 1;

  if (typeof updateStatusBadge === 'function') updateStatusBadge('生成中…');

  const data = await restPost('comfy/generate', {
    workflow_id:     activeChar.workflow_id,
    char_id:         activeChar.id,
    en_prompt:       enPrompt,
    fixed_seed:      fixedSeed ?? null,
    turn_id:         turnId,
    workflow_params: {
      steps:     params.steps,
      cfg:       params.cfg,
      width:     params.width,
      height:    params.height,
      sampler:   params.sampler,
      scheduler: params.scheduler,
      negative:  params.negative,
      loras:     params.loras || [],
    },
  });

  if (data.error) throw new Error(data.error);
  return { imageUrl: data.imageUrl, meta: data.meta };
}

// ─────────────────────────────────────────────
// サンプラー・LoRAリスト取得（サーバー経由）
// ─────────────────────────────────────────────
async function fetchSamplerList() {
  try {
    const data = await restGet('comfy/samplers');
    const { samplers = [], schedulers = [] } = data;

    const populateSamplerSel = (selId, items) => {
      const sel = document.getElementById(selId);
      if (!sel || !items.length) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">デフォルト</option>';
      items.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        if (s === cur) opt.selected = true;
        sel.appendChild(opt);
      });
    };

    populateSamplerSel('editSampler',       samplers);
    populateSamplerSel('globalWfSampler',   samplers);
    populateSamplerSel('editScheduler',     schedulers);
    populateSamplerSel('globalWfScheduler', schedulers);
  } catch(e) {
    console.warn('[NR] fetchSamplerList failed:', e.message);
  }
}

// ─────────────────────────────────────────────
// グローバルLoRA管理（管理者専用）
// ─────────────────────────────────────────────
function openGlobalLoraModal() {
  // LoRAリストが未取得の場合は取得してからモーダルを開く
  const open = () => loadGlobalLoras().then(() => openModal('globalLoraOverlay'));
  if (!_loraNames.length) fetchLoraList().then(open).catch(open);
  else open();
}

async function loadGlobalLoras() {
  try {
    _globalLoraList = await restGet('comfy/global-loras');
    renderGlobalLoraList();
  } catch(e) {
    showToast('グローバルLoRA読み込み失敗: ' + e.message.slice(0, 40));
  }
}

function renderGlobalLoraList() {
  const container = document.getElementById('globalLoraList');
  if (!container) return;
  if (!_globalLoraList.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--text-pale);padding:4px 2px;">グローバルLoRAなし</div>';
    return;
  }
  container.innerHTML = '';
  _globalLoraList.forEach(lora => {
    const card = document.createElement('div');
    card.className = 'lora-card';
    card.innerHTML = `
      <div class="lora-card-header" onclick="editGlobalLora(${lora.id})">
        <div class="lora-card-name" style="opacity:${lora.enabled ? 1 : 0.4}">${escHtml(lora.name.split('/').pop())}</div>
        <div class="lora-card-weight">${lora.weight}</div>
        <div style="font-size:10px;color:var(--text-pale);margin-left:4px;">${lora.enabled ? '' : '無効'}</div>
      </div>`;
    container.appendChild(card);
  });
}

function addGlobalLoraRow() {
  const nameInput = document.getElementById('globalLoraEditName');
  const idInput   = document.getElementById('globalLoraEditId');
  const titleEl   = document.getElementById('globalLoraEditTitle');
  const delBtn    = document.getElementById('globalLoraDeleteBtn');
  if (nameInput) nameInput.value = '';
  if (idInput)   idInput.value   = '';
  if (titleEl)   titleEl.textContent = 'グローバルLoRA追加';
  if (delBtn)    delBtn.style.display = 'none';
  const weightEl  = document.getElementById('globalLoraEditWeight');
  const clipEl    = document.getElementById('globalLoraEditClip');
  const triggerEl = document.getElementById('globalLoraEditTrigger');
  const enabledEl = document.getElementById('globalLoraEditEnabled');
  if (weightEl)  weightEl.value  = '1';
  if (clipEl)    clipEl.value    = '1';
  if (triggerEl) triggerEl.value = '';
  if (enabledEl) enabledEl.checked = true;
  // globalLoraSelectAdd が未popの場合は取得
  if (_loraNames.length) {
    const sel = document.getElementById('globalLoraSelectAdd');
    if (sel && sel.options.length <= 1) fetchLoraList();
  }
  openModal('globalLoraEditOverlay');
}

function editGlobalLora(id) {
  const lora = _globalLoraList.find(l => l.id === id);
  if (!lora) return;
  document.getElementById('globalLoraEditId').value   = lora.id;
  document.getElementById('globalLoraEditName').value = lora.name;
  document.getElementById('globalLoraEditWeight').value  = lora.weight;
  document.getElementById('globalLoraEditClip').value    = lora.clip_weight;
  document.getElementById('globalLoraEditTrigger').value = lora.trigger_words || '';
  document.getElementById('globalLoraEditEnabled').checked = lora.enabled !== 0;
  document.getElementById('globalLoraEditTitle').textContent = 'グローバルLoRA編集';
  document.getElementById('globalLoraDeleteBtn').style.display = '';
  openModal('globalLoraEditOverlay');
}

function applyGlobalLoraFromSelect() {
  const sel = document.getElementById('globalLoraSelectAdd');
  const nameInput = document.getElementById('globalLoraEditName');
  if (sel?.value && nameInput) nameInput.value = sel.value;
}

async function saveGlobalLora() {
  const id      = document.getElementById('globalLoraEditId')?.value;
  const name    = document.getElementById('globalLoraEditName')?.value?.trim();
  if (!name) { showToast('LoRAファイル名を入力してください'); return; }
  const payload = {
    name,
    weight:        parseFloat(document.getElementById('globalLoraEditWeight')?.value || '1'),
    clip_weight:   parseFloat(document.getElementById('globalLoraEditClip')?.value   || '1'),
    trigger_words: document.getElementById('globalLoraEditTrigger')?.value?.trim()   || '',
    enabled:       document.getElementById('globalLoraEditEnabled')?.checked ? 1 : 0,
  };
  try {
    if (id) {
      await restPut(`comfy/global-loras/${id}`, payload);
    } else {
      await restPost('comfy/global-loras', payload);
    }
    showToast('保存しました');
    closeModal('globalLoraEditOverlay');
    await loadGlobalLoras();
  } catch(e) {
    showToast('保存失敗: ' + e.message.slice(0, 40));
  }
}

async function deleteGlobalLora() {
  const id = document.getElementById('globalLoraEditId')?.value;
  if (!id) return;
  if (!confirm('このグローバルLoRAを削除しますか？')) return;
  try {
    await restDelete(`comfy/global-loras/${id}`);
    showToast('削除しました');
    closeModal('globalLoraEditOverlay');
    await loadGlobalLoras();
  } catch(e) {
    showToast('削除失敗: ' + e.message.slice(0, 40));
  }
}

async function fetchLoraList() {
  const statusEl = document.getElementById('loraFetchStatus');
  const selEl    = document.getElementById('loraSelectAdd');
  if (statusEl) statusEl.textContent = '取得中…';
  try {
    const data  = await restGet('comfy/loras');
    const loras = data.loras || [];
    if (!loras.length) throw new Error('LoRAが見つかりません');
    _loraNames = loras;

    const populateSel = (el) => {
      if (!el) return;
      el.innerHTML = '<option value="">— LoRAを選択 —</option>';
      loras.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name.split('/').pop();
        el.appendChild(opt);
      });
    };
    populateSel(selEl);
    populateSel(document.getElementById('globalLoraSelectAdd'));

    if (statusEl) statusEl.textContent = `${loras.length}件`;
  } catch(e) {
    if (statusEl) statusEl.textContent = '取得失敗';
    showToast('LoRAリスト取得失敗: ' + e.message.slice(0, 40));
  }
}
