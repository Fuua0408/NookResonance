/* ═════════════════════════════════════════════
   ComfyDeck Nook — session.js
   セッション操作・バッチ処理・アンカー・エクスポート
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// セッション初期化・サーバー同期
// ─────────────────────────────────────────────
function initSession() {
  if (!activeChar) return;
  activeSession = {
    id:                'session_' + Date.now(),
    char_id:           activeChar.id,
    title:             t('session.new', '新しいセッション'),
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
    archived:          false,
    turns:             [],
    initial_affection: activeChar.affection ?? 130,
    context:           { summary: '', appearance: '', location: '' },
    user_state:        { appearance: '', location: '' },
    current_clothing:  activeChar?.appearance_clothing_en?.trim() || '',
    current_location:  '',  // 引き継ぎがあればapplyHandover後に上書き
  };
  document.getElementById('anchorSelectBanner')?.remove();
  document.getElementById('chatLog')?.classList.remove('anchor-select-mode');
  document.getElementById('anchorBtn')?.classList.remove('active');
  _anchorSelectMode = false;
  updateHeaderSession();
}
function displaySessionTitle(title) {
  if (!title || title === '新しいセッション') return t('session.new', '新しいセッション');
  if (title === 'フォトセッション') return t('session.photo', 'フォトセッション');
  if (title === '無題') return t('session.no_title', '無題');
  return isEnglishMode()
    ? String(title).replace(/\[フォト\]/g, `[${t('session.photo_badge', 'フォト')}]`)
    : title;
}
function formatTurnCount(count) {
  const n = Number(count) || 0;
  if (isEnglishMode()) {
    return (n === 1 ? t('session.turn_count_one', '{count} turn') : t('session.turn_count', '{count} turns')).replace('{count}', n);
  }
  return `${n}ターン`;
}
function isLocalSessionId(id) {
  return typeof id === 'string' && id.startsWith('session_');
}
async function createSessionOnServer() {
  if (!isRestEnabled() || !activeChar) return;
  try {
    const res = await restPost(`sessions/${activeChar.id}`, activeSession);
    activeSession.id = res.id;
    updateHeaderSession();
  } catch(e) {
    console.warn('[Nook] createSession REST failed:', e.message);
  }
}
async function saveTurnToSession(turn) {
  if (!activeSession) return;
  if (turn !== null) {
    activeSession.turns.push(turn);
  }
  activeSession.updated_at = new Date().toISOString();
  updateHeaderSession();

  if (!isRestEnabled()) {
    // localStorageに仮保存
    saveSettings({ [`session_${activeSession.id}`]: activeSession });
    return;
  }

  try {
    // セッションがまだサーバーに未作成（id がsession_xxxの場合）ならPOST
    if (isLocalSessionId(activeSession.id)) {
      const res = await restPost(`sessions/${activeChar.id}`, activeSession);
      activeSession.id = res.id;
    } else {
      await restPut(`sessions/${activeChar.id}/${activeSession.id}`, activeSession);
    }
    updateStatusBadge('SYNC');
  } catch(e) {
    console.warn('[Nook] saveTurn REST failed:', e.message);
    showToast(t('server_save_failed_local', '⚠ サーバー保存に失敗（ローカル保存）'));
    saveSettings({ [`session_${activeSession.id}`]: activeSession });
  }
}
async function archiveSession(charId, sessionId) {
  if (!isRestEnabled()) return;
  await restPost(`sessions/${charId}/${sessionId}/archive`, {});
}
async function unarchiveSession(charId, sessionId) {
  if (!isRestEnabled()) return;
  await restDelete(`sessions/${charId}/${sessionId}/archive`);
}
async function deleteSession(charId, sessionId) {
  if (!isRestEnabled()) return;
  await restDelete(`sessions/${charId}/${sessionId}`);
}
async function fetchSessionsFromServer(charId) {
  if (!isRestEnabled()) return [];
  try {
    return await restGet(`sessions/${charId}`);
  } catch(e) {
    console.warn('[Nook] fetchSessions failed:', e.message);
    return [];
  }
}
async function loadSessionFromServer(charId, sessionId) {
  if (!isRestEnabled()) return null;
  try {
    return await restGet(`sessions/${charId}/${sessionId}`);
  } catch(e) {
    console.warn('[Nook] loadSession failed:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// アンカー操作
// ─────────────────────────────────────────────
function getAnchorEN() {
  const anchors = activeSession?.anchors;
  if (!anchors?.length) return null;
  const idx = activeSession.active_anchor_idx ?? (anchors.length - 1);
  return anchors[idx]?.en_prompt || null;
}
function setAnchor(turnIdx) {
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn?.en_prompt) { showToast(t('session.en_prompt_missing', 'ENプロンプトがありません')); return; }

  if (!activeSession.anchors) activeSession.anchors = [];

  // 同じturn_idxのアンカーがあれば上書き、なければ追加
  const existing = activeSession.anchors.findIndex(a => a.turn_idx === turnIdx);
  if (existing >= 0) {
    activeSession.anchors[existing].en_prompt = turn.en_prompt;
    activeSession.active_anchor_idx = existing;
  } else {
    activeSession.anchors.push({ turn_idx: turnIdx, en_prompt: turn.en_prompt });
    activeSession.active_anchor_idx = activeSession.anchors.length - 1;
  }

  updateAnchorUI();
  saveTurnToSession(null).catch(e => console.warn(e));
  showToast(t('session.anchor_set', '⚓ アンカーを設定しました'));
}
function clearAnchor() {
  if (!activeSession) return;
  delete activeSession.anchors;
  delete activeSession.active_anchor_idx;
  updateAnchorUI();
  saveTurnToSession(null).catch(e => console.warn(e));
  showToast(t('session.anchors_cleared', 'アンカーをすべて解除しました'));
}
function startAnchorSelect() {
  if (_anchorSelectMode) { cancelAnchorSelect(); return; }
  if (!activeSession?.turns?.some(t => t.en_prompt)) {
    showToast(t('session.no_anchor_images', 'アンカーにできる画像がありません')); return;
  }
  _anchorSelectMode = true;

  // バナー表示
  const log = document.getElementById('chatLog');
  const existingBanner = document.getElementById('anchorSelectBanner');
  if (!existingBanner && log) {
    const div = document.createElement('div');
    div.id = 'anchorSelectBanner';
    div.className = 'anchor-banner';
    div.innerHTML = t('session.anchor_tap', '⚓ アンカーにする画像をタップしてください') + '　<span style="text-decoration:underline;">' + t('cancel', 'キャンセル') + '</span>';
    div.addEventListener('click', cancelAnchorSelect);
    log.parentElement?.insertBefore(div, log);
  }

  // チャットログに選択モードクラスを追加
  log?.classList.add('anchor-select-mode');

  // ⚓ボタンをアクティブに
  document.getElementById('anchorBtn')?.classList.add('active');

  // 画像クリックハンドラを上書き
  document.querySelectorAll('.turn-image').forEach(div => {
    div.dataset.origOnclick = div.getAttribute('onclick') || '';
    div.addEventListener('click', _anchorImageClickHandler);
  });
}
function _anchorImageClickHandler(e) {
  e.stopPropagation();
  const turnIdx = parseInt(this.dataset.turnIdx);
  if (!isNaN(turnIdx)) {
    setAnchor(turnIdx);
    cancelAnchorSelect();
  }
}
function cancelAnchorSelect() {
  _anchorSelectMode = false;
  document.getElementById('anchorSelectBanner')?.remove();
  document.getElementById('chatLog')?.classList.remove('anchor-select-mode');
  document.getElementById('anchorBtn')?.classList.remove('active');
  document.querySelectorAll('.turn-image').forEach(div => {
    div.removeEventListener('click', _anchorImageClickHandler);
  });
}
function updateAnchorUI() {
  const anchors  = activeSession?.anchors || [];
  const hasAnchor = anchors.length > 0;

  // ⚓ボタンの状態のみ更新
  const btn = document.getElementById('anchorBtn');
  if (btn) btn.classList.toggle('active', hasAnchor);
}

// ─────────────────────────────────────────────
// バッチ処理
// ─────────────────────────────────────────────
async function batchRetranslate() {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  const targets = activeSession?.turns?.filter(t => t.jp_prompt) || [];
  if (!targets.length) { showToast(t('session.no_retranslate_targets', '再推論できるターンがありません')); return; }
  if (!confirm(t('session.retranslate_confirm', '{count}ターンのプロンプトを再推論してから全画像を再生成します。').replace('{count}', targets.length))) return;

  const inPhoto = typeof isPhotoMode === 'function' && isPhotoMode();

  isGenerating = true;
  _batchCancelled = false;
  setBtnState(true);
  document.getElementById('btnReroll').style.display = 'none';
  document.getElementById('btnCancelReroll').style.display = '';

  try {
    const anchor = inPhoto ? null : getAnchorEN(); // フォトモードはアンカーなし
    for (let i = 0; i < activeSession.turns.length; i++) {
      if (_batchCancelled) break;
      const turn = activeSession.turns[i];
      if (!turn.jp_prompt) continue;
      updateStatusBadge(`${t('session.retranslating', '再推論中…')} ${i+1}/${activeSession.turns.length}`);
      const prevEN = anchor || (i === 0 ? '' : (activeSession.turns[i - 1]?.en_prompt || ''));
      if (!inPhoto && turn.gen_mode === 'char' && turn.char_message) {
        // チャットモードのキャラ主導のみ
        turn.en_prompt = await translatePromptCharMode(turn.user_message || '', turn.char_message, prevEN, turn.is_narrative);
      } else {
        // フォトモード・通常チャットモード共通
        turn.en_prompt = await translatePrompt(turn.jp_prompt, prevEN, turn.is_narrative);
      }
    }

    if (!_batchCancelled) {
      // 再推論完了後にバッチ再生成
      isGenerating = false;
      await batchReroll();
      return;
    }
  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
  } finally {
    isGenerating = false;
    setBtnState(false);
    document.getElementById('btnReroll').style.display = '';
    document.getElementById('btnCancelReroll').style.display = 'none';
    updateStatusBadge('SYNC');
  }
}
async function batchReroll() {
  if (!activeChar || !activeSession) {
    showToast(t('session.not_selected', 'セッションが選択されていません')); return;
  }
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }

  const inPhoto = typeof isPhotoMode === 'function' && isPhotoMode();

  const targets = activeSession.turns.filter(t => t.en_prompt);
  if (!targets.length) { showToast(t('session.no_regen_targets', '再生成できるターンがありません')); return; }

  if (!confirm(t('session.reroll_confirm', '{count}枚の画像を新しいSeedで再生成します。').replace('{count}', targets.length))) return;

  isGenerating = true;
  _batchCancelled = false;
  setBtnState(true);
  document.getElementById('btnReroll').style.display = 'none';
  document.getElementById('btnCancelReroll').style.display = '';

  // ── フォトモード ──────────────────────────────
  if (inPhoto) {
    const newSeed = Math.floor(Math.random() * 2 ** 32);
    let done = 0;
    for (let i = 0; i < activeSession.turns.length; i++) {
      if (_batchCancelled) break;
      const turn = activeSession.turns[i];
      if (!turn.en_prompt) continue;
      updateStatusBadge(`${t('session.regenerating', '再生成中…')} ${done + 1}/${targets.length}`);
      try {
        const { imageUrl, meta: batchMeta } = await generateImage(turn.en_prompt, newSeed);
        turn.image_url = imageUrl;
        turn.gen_meta  = { ...batchMeta, anchor_turn_idx: null };
        activeSession.updated_at = new Date().toISOString();

        // カルーセルに追記（古い画像は残す）
        addPhotoCarouselSlide(imageUrl, i);
        done++;

        // サーバー保存
        if (isRestEnabled()) {
          restPut(`sessions/${activeChar.id}/${activeSession.id}`, activeSession)
            .catch(e => console.warn('[Alcove] photo batch update failed:', e.message));
        }
      } catch(e) {
        console.warn(`[Alcove] photo reroll turn ${i} failed:`, e.message);
        showToast(t('session.regen_turn_failed', '⚠ ターン{turn}の再生成に失敗: ').replace('{turn}', i + 1) + e.message.slice(0,30));
      }
    }

    isGenerating = false;
    setBtnState(false);
    document.getElementById('btnReroll').style.display = '';
    document.getElementById('btnCancelReroll').style.display = 'none';
    updateStatusBadge('SYNC');
    showToast(_batchCancelled
      ? t('session.reroll_cancelled', '再生成をキャンセルしました')
      : t('session.reroll_done', '✓ {count}枚を再生成しました（Seed: {seed}）').replace('{count}', done).replace('{seed}', newSeed));
    updateHeaderSession();
    return;
  }

  // ── チャットモード ────────────────────────────
  updateStatusBadge(t('session.saving', 'セッションを保存中…'));
  if (isRestEnabled()) {
    try {
      if (isLocalSessionId(activeSession.id)) {
        const res = await restPost(`sessions/${activeChar.id}`, activeSession);
        activeSession.id = res.id;
      }
      await archiveSession(activeChar.id, activeSession.id);
    } catch(e) {
      console.warn('[Alcove] archive failed:', e.message);
      showToast(t('session.save_continue', '⚠ セッションの保存に失敗しました（続行します）'));
    }
  }

  const baseName  = activeSession.title.replace(/ #\d+$/, '');
  const newTitle  = `${baseName} #${Date.now().toString().slice(-4)}`;
  const newTurns  = activeSession.turns.map(t => ({ ...t }));
  const newSeed   = Math.floor(Math.random() * 2 ** 32);

  const newSession = {
    id:         'session_' + Date.now(),
    char_id:    activeChar.id,
    title:      newTitle,
    mode:       'chat',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived:   false,
    turns:      newTurns,
    batch_seed: newSeed,
  };
  activeSession = newSession;
  updateHeaderSession();

  clearChatLog();
  appendDateSep(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }));
  newTurns.forEach((turn, idx) => renderTurn(turn, idx));

  let done = 0;
  for (let i = 0; i < newTurns.length; i++) {
    if (_batchCancelled) break;
    const turn = newTurns[i];
    if (!turn.en_prompt) continue;
      updateStatusBadge(`${t('session.regenerating', '再生成中…')} ${done + 1}/${targets.length}`);
    try {
      const { imageUrl, meta: batchMeta } = await generateImage(turn.en_prompt, newSeed);
      turn.image_url = imageUrl;
      turn.gen_meta  = { ...batchMeta, anchor_turn_idx: null };
      newSession.updated_at = new Date().toISOString();
      updateTurnImage(i, imageUrl);
      done++;
      if (isRestEnabled()) {
        if (isLocalSessionId(newSession.id)) {
          try {
            const res = await restPost(`sessions/${activeChar.id}`, newSession);
            newSession.id = res.id;
          } catch(e) { console.warn('[Alcove] batch save failed:', e.message); }
        } else {
          restPut(`sessions/${activeChar.id}/${newSession.id}`, newSession)
            .catch(e => console.warn('[Alcove] batch update failed:', e.message));
        }
      }
    } catch(e) {
      console.warn(`[Alcove] reroll turn ${i} failed:`, e.message);
      showToast(t('session.regen_turn_failed', '⚠ ターン{turn}の再生成に失敗: ').replace('{turn}', i + 1) + e.message.slice(0,30));
    }
  }

  isGenerating = false;
  setBtnState(false);
  document.getElementById('btnReroll').style.display = '';
  document.getElementById('btnCancelReroll').style.display = 'none';
  updateStatusBadge('SYNC');
  showToast(_batchCancelled
    ? t('session.reroll_cancelled', '再生成をキャンセルしました')
    : t('session.reroll_done', '✓ {count}枚を再生成しました（Seed: {seed}）').replace('{count}', done).replace('{seed}', newSeed));
  updateHeaderSession();
}
function cancelBatchReroll() {
  _batchCancelled = true;
  if (ws) { try { ws.close(); } catch(e){} ws = null; }
}

// ─────────────────────────────────────────────
// ターン操作（分岐）
// ─────────────────────────────────────────────
async function branchFromTurn(turnIdx) {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  if (!activeChar || !activeSession) return;

  if (!confirm(t('session.branch_confirm', 'ターン{turn}から分岐しますか？\n現在のセッションは保存されます。').replace('{turn}', turnIdx + 1))) return;

  // 1. 現在のセッションをarchive（未保存なら先にPOST）
  updateStatusBadge(t('session.saving', 'セッションを保存中…'));
  if (isRestEnabled()) {
    try {
      if (isLocalSessionId(activeSession.id)) {
        const res = await restPost(`sessions/${activeChar.id}`, activeSession);
        activeSession.id = res.id;
      }
      await archiveSession(activeChar.id, activeSession.id);
    } catch(e) {
      console.warn('[Nook] branch archive failed:', e.message);
    }
  }

  // 2. 指定ターンまでのturnsをコピーして新セッション作成
  const branchTurns = activeSession.turns.slice(0, turnIdx + 1).map(t => ({ ...t }));
  const baseName    = displaySessionTitle(activeSession.title).replace(/ \[分岐.*\]$/, '').replace(/ \[Branch.*\]$/, '').replace(/ #\d+$/, '');
  const newTitle    = `${baseName} ${t('session.branch_suffix', '[分岐 ターン{turn}]').replace('{turn}', turnIdx + 1)}`;

  const newSession = {
    id:         'session_' + Date.now(),
    char_id:    activeChar.id,
    title:      newTitle,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived:   false,
    turns:      branchTurns,
  };

  activeSession = newSession;

  // 3. チャットログを再描画（分岐ターンまで）
  clearChatLog();
  appendDateSep(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }));
  branchTurns.forEach((turn, idx) => renderTurn(turn, idx));
  updateHeaderSession();
  updateAnchorUI();

  // 4. サーバーに保存
  if (isRestEnabled()) {
    try {
      const res = await restPost(`sessions/${activeChar.id}`, newSession);
      activeSession.id = res.id;
      updateHeaderSession();
    } catch(e) {
      console.warn('[Nook] branch save failed:', e.message);
      saveSettings({ [`session_${newSession.id}`]: newSession });
    }
  }

  updateStatusBadge('SYNC');
  showToast(t('session.branch_done', '🌿 ターン{turn}から分岐しました').replace('{turn}', turnIdx + 1));
}

// ─────────────────────────────────────────────
// セッション一覧・ロード
// ─────────────────────────────────────────────
async function renderSessionList() {
  const panel = document.getElementById('panelSessionList');
  if (!panel) return;
  if (!activeChar) {
    panel.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-pale);font-size:13px;">${t('chat.no_char', 'キャラクターを選択してください')}</div>`;
    return;
  }

  panel.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-pale);font-size:12px;">${t('loading', '読み込み中…')}</div>`;

  const sessions = await fetchSessionsFromServer(activeChar.id);

  if (!sessions.length) {
    panel.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-pale);font-size:13px;">${t('session.no_sessions', 'セッションがありません')}</div>`;
    return;
  }

  panel.innerHTML = '';
  sessions.forEach(sess => {
    const isCurrent  = activeSession?.id === sess.id;
    const div = document.createElement('div');
    div.className = 'session-card' + (sess.archived ? ' archived' : '') + (isCurrent ? ' current' : '');

    const icon = sess.archived ? '📌' : (sess.mode === 'continuous' ? '📷' : '💬');
    div.innerHTML = `
      <div class="session-icon ${sess.archived ? 'pin' : ''}">${icon}</div>
      <div class="session-info" onclick="loadSession('${sess.char_id}','${sess.id}')" style="cursor:pointer;">
        <div class="session-title">${escHtml(displaySessionTitle(sess.title || '無題'))}${sess.mode === 'continuous' ? `<span class="session-mode-badge">${t('session.photo_badge', 'フォト')}</span>` : ''}</div>
        <div class="session-meta">${sess.updated_at?.slice(0,10) || ''}</div>
        <div class="session-turns">${formatTurnCount(sess.turn_count || 0)}${isCurrent ? t('misc.session_ongoing', ' — 継続中') : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${!sess.archived && sess.mode !== 'continuous'
          ? `<div class="btn-icon-sm" title="${t('session.handover', '引き継ぎ')}" onclick="openHandoverFor('${sess.char_id}','${sess.id}')">📝</div>`
          : ''
        }
        ${sess.mode !== 'continuous'
          ? `<div class="btn-icon-sm" title="${t('session.create_summary', '概要を作成')}" onclick="createSessionSummary('${sess.char_id}','${sess.id}')">📋</div>`
          : ''
        }
        ${!sess.archived && sess.mode !== 'continuous'
          ? `<div class="btn-icon-sm" title="${t('session.convert_photo_title', 'フォトモードに変換')}" onclick="handleConvertToPhoto('${sess.char_id}','${sess.id}')">📷</div>`
          : ''
        }
        ${sess.archived
          ? `<div class="btn-icon-sm" title="${t('session.unarchive', '保存解除')}" onclick="handleUnarchive('${sess.char_id}','${sess.id}')">📌</div>`
          : `<div class="btn-icon-sm" title="${t('session.archive', '完全保存')}" onclick="handleArchive('${sess.char_id}','${sess.id}')">📌</div>`
        }
        <div class="btn-icon-sm" title="${t('delete', '削除')}" onclick="handleDeleteSession('${sess.char_id}','${sess.id}')" style="color:var(--accent);">🗑</div>
      </div>
    `;
    panel.appendChild(div);
  });
}
async function loadSession(charId, sessionId) {
  const sess = await loadSessionFromServer(charId, sessionId);
  if (!sess) { showToast(t('session.load_fail', 'セッションの読み込みに失敗しました')); return; }

  activeSession = sess;
  clearChatLog();

  // フォトモードの場合はカルーセル復元してUIを切り替え
  if (sess.mode === 'continuous') {
    if (typeof updatePhotoUI === 'function') {
      restorePhotoCarousel(sess);
      updatePhotoUI();
    }
    // フォトターンをチャットログに再描画
    sess.turns.forEach((turn, idx) => {
      if (typeof appendPhotoTurnToLog === 'function') {
        appendPhotoTurnToLog(turn, idx);
      }
    });
  } else {
    // チャットモード
    if (typeof updatePhotoUI === 'function') updatePhotoUI();
    appendDateSep(sess.created_at?.slice(0,10) || new Date().toLocaleDateString('ja-JP'));
    sess.turns.forEach((turn, idx) => renderTurn(turn, idx));
    updateAnchorUI();
  }

  updateHeaderSession();
  restoreScrollPosition(sess.id);
  closeModal('charOverlay');
  showToast(t('session.load_ok', 'セッションを読み込みました'));
}
async function handleConvertToPhoto(charId, sessionId) {
  if (typeof convertToPhotoMode === 'function') {
    await convertToPhotoMode(charId, sessionId);
    renderSessionList();
  }
}
async function handleArchive(charId, sessionId) {
  try {
    await archiveSession(charId, sessionId);
    showToast(t('session.saved_permanent', '完全保存しました'));
    renderSessionList();
  } catch(e) { showToast(t('error_prefix', 'エラー: ') + e.message.slice(0,40)); }
}
async function handleUnarchive(charId, sessionId) {
  try {
    await unarchiveSession(charId, sessionId);
    showToast(t('session.unarchived', '保存を解除しました'));
    renderSessionList();
  } catch(e) { showToast(t('error_prefix', 'エラー: ') + e.message.slice(0,40)); }
}
async function handleDeleteSession(charId, sessionId) {
  if (!confirm(t('session.delete_confirm', 'このセッションを削除しますか？'))) return;
  try {
    await deleteSession(charId, sessionId);
    if (activeSession?.id === sessionId) initSession();
    showToast(t('toast.deleted', '削除しました'));
    renderSessionList();
  } catch(e) { showToast(t('error_prefix', 'エラー: ') + e.message.slice(0,40)); }
}

// ─────────────────────────────────────────────
// HTMLエクスポート
// ─────────────────────────────────────────────
async function exportSessionHTML() {
  if (!activeSession || !activeChar) {
    showToast(t('session.selected_required', 'セッションを選択してください')); return;
  }
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }

  const turns = activeSession.turns;
  if (!turns.length) { showToast(t('turn.none', 'ターンがありません')); return; }

  updateStatusBadge(t('status.exporting', 'エクスポート中…'));
  showToast(t('session.loading_images', '⏳ 画像を読み込み中…'));

  // 画像をbase64に変換
  async function toBase64(url) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
    } catch(e) {
      return null;
    }
  }

  // キャラアイコン
  const charIcon = activeChar.icon_data
    ? `<img src="${activeChar.icon_data}" style="width:32px;height:32px;object-fit:cover;border-radius:50%;">`
    : `<span style="font-size:18px;">${escHtml(activeChar.icon_emoji || '💬')}</span>`;

  // ターンHTML生成
  let turnsHTML = '';
  for (const turn of turns) {
    if (turn.is_narrative) {
      const text = turn.user_message?.replace(/^\*|\*$/g,'') || '';
      turnsHTML += `
        <div class="narrative">
          <span class="narrative-line"></span>
          <span class="narrative-text">${escHtml(text)}</span>
          <span class="narrative-line"></span>
        </div>`;
      if (turn.image_url) {
        const b64 = await toBase64(turn.image_url);
        if (b64) turnsHTML += `<div class="turn-image"><img src="${b64}" alt="生成画像"></div>`;
      }
      if (turn.char_message) {
        turnsHTML += `
          <div class="char-msg">
            <div class="char-icon">${charIcon}</div>
            <div class="char-bubble-wrap">
              <div class="char-name">${escHtml(activeChar.name)}</div>
              <div class="char-bubble">${_nl2br(turn.char_message)}</div>
            </div>
          </div>`;
      }
    } else {
      if (turn.user_message) {
        turnsHTML += `
          <div class="user-msg">
            <div class="user-bubble">${_nl2br(turn.user_message)}</div>
          </div>`;
      }
      if (turn.gen_mode === 'char') {
        if (turn.char_message) {
          turnsHTML += `
            <div class="char-msg">
              <div class="char-icon">${charIcon}</div>
              <div class="char-bubble-wrap">
                <div class="char-name">${escHtml(activeChar.name)}</div>
                <div class="char-bubble">${_nl2br(turn.char_message)}</div>
              </div>
            </div>`;
        }
        if (turn.image_url) {
          const b64 = await toBase64(turn.image_url);
          if (b64) turnsHTML += `<div class="turn-image"><img src="${b64}" alt="生成画像"></div>`;
        }
      } else {
        if (turn.image_url) {
          const b64 = await toBase64(turn.image_url);
          if (b64) turnsHTML += `<div class="turn-image"><img src="${b64}" alt="生成画像"></div>`;
        }
        if (turn.char_message) {
          turnsHTML += `
            <div class="char-msg">
              <div class="char-icon">${charIcon}</div>
              <div class="char-bubble-wrap">
                <div class="char-name">${escHtml(activeChar.name)}</div>
                <div class="char-bubble">${_nl2br(turn.char_message)}</div>
              </div>
            </div>`;
        }
      }
    }
  }

  const exportDate = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });
  const accentColor = getSetting('accentColor', '#8b6348');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(activeChar.name)} — ${escHtml(activeSession.title)}</title>
<style>
  :root {
    --accent: ${accentColor};
    --bg: #fdf8f2;
    --bg-log: #faf4ec;
    --bg-white: #ffffff;
    --border: #e8ddd0;
    --text: #3d2e1e;
    --text-dim: #9a8070;
    --radius: 16px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif;
    background: var(--bg-log);
    color: var(--text);
    line-height: 1.7;
  }
  .header {
    background: var(--bg);
    border-bottom: 0.5px solid var(--border);
    padding: 16px 20px;
    position: sticky; top: 0;
    display: flex; align-items: center; gap: 10px;
  }
  .header-name { font-size: 17px; font-weight: 600; }
  .header-session { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
  .header-meta { font-size: 11px; color: var(--text-dim); margin-left: auto; }
  .chat-log {
    max-width: 560px; margin: 0 auto;
    padding: 20px 16px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .user-msg { display: flex; justify-content: flex-end; }
  .user-bubble {
    background: var(--accent); color: #fff;
    border-radius: var(--radius) var(--radius) 4px var(--radius);
    padding: 10px 14px; font-size: 14px;
    max-width: 82%;
  }
  .char-msg { display: flex; gap: 8px; align-items: flex-start; }
  .char-icon {
    width: 32px; height: 32px; border-radius: 50%;
    background: #ede4d8; border: 0.5px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden;
  }
  .char-bubble-wrap { max-width: 85%; }
  .char-name { font-size: 10px; color: var(--text-dim); margin-bottom: 4px; font-weight: 500; }
  .char-bubble {
    background: var(--bg-white); border: 0.5px solid var(--border);
    border-radius: 4px var(--radius) var(--radius) var(--radius);
    padding: 10px 14px; font-size: 13px;
  }
  .turn-image { width: 100%; border-radius: var(--radius); overflow: hidden; border: 0.5px solid var(--border); }
  .turn-image img { width: 100%; display: block; }
  .narrative {
    display: flex; align-items: center; gap: 8px; padding: 0 4px;
  }
  .narrative-line { flex: 1; height: 0.5px; background: var(--border); }
  .narrative-text { font-style: italic; font-size: 12px; color: var(--text-dim); white-space: pre-wrap; }
  .footer {
    text-align: center; padding: 32px 16px;
    font-size: 11px; color: var(--text-dim);
    border-top: 0.5px solid var(--border);
    margin-top: 32px;
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="header-name">${escHtml(activeChar.name)}</div>
    <div class="header-session">${escHtml(activeSession.title)}</div>
  </div>
  <div class="header-meta">${formatTurnCount(turns.length)} · ${exportDate} ${t('status.exporting', 'エクスポート')}</div>
</div>
<div class="chat-log">
${turnsHTML}
</div>
<div class="footer">ComfyDeck Nook — ${escHtml(activeChar.name)} / ${escHtml(activeSession.title)}</div>
</body>
</html>`;

  // ダウンロード
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safeTitle = (activeSession.title || 'session').replace(/[\/:*?"<>|]/g, '_');
  const safeChar  = (activeChar.name || 'char').replace(/[\/:*?"<>|]/g, '_');
  a.href     = url;
  a.download = `nook_${safeChar}_${safeTitle}.html`;
  a.click();
  URL.revokeObjectURL(url);

  updateStatusBadge('SYNC');
  showToast(t('exported', '✓ エクスポートしました'));
}

// ─────────────────────────────────────────────
// セッション概要を作成してactiveSession.contextに保存
// ─────────────────────────────────────────────
async function createSessionSummary(charId, sessionId) {
  if (!activeChar) { showToast(t('chat.no_char', 'キャラクターを選択してください')); return; }

  // 対象セッションを取得
  let session = activeSession;
  if (!session || session.id !== sessionId) {
    if (!isRestEnabled()) { showToast(t('rest.required', 'REST接続が必要です')); return; }
    try {
      session = await restGet(`sessions/${charId}/${sessionId}`);
    } catch(e) {
      showToast(t('session.fetch_failed', '❌ セッション取得失敗: ') + e.message.slice(0, 40));
      return;
    }
  }

  if (!session.turns?.length) { showToast(t('turn.none', 'ターンがありません')); return; }

  updateStatusBadge(t('status.summarizing', '概要を生成中…'));
  showToast(t('session.summary_generating', '⏳ 概要を生成しています…'));

  try {
    const char = activeChar;
    const sessionText = session.turns.slice(-20).map(t => {
      const parts = [];
      if (t.user_message) parts.push(`ユーザー: ${t.user_message}`);
      if (t.char_message)  parts.push(`${char.name}: ${t.char_message}`);
      if (t.jp_prompt)     parts.push(`（シーン: ${t.jp_prompt}）`);
      return parts.join('\n');
    }).join('\n\n');

    const result = await getChatCompletion([
      { role: 'system', content: `あなたはキャラクターとの会話セッションを分析するアシスタントです。以下のセッション内容を読んで、このセッションでどんな出来事があったかを3〜5文で要約してください。` },
      { role: 'user',   content: sessionText },
    ]);
    const summary = cleanLLMResponse(result);

    // activeSessionのcontextに保存（現在のセッションの場合）
    if (activeSession && activeSession.id === sessionId) {
      if (!activeSession.context) activeSession.context = { summary: '', appearance: '', location: '' };
      activeSession.context.summary = summary;
      // セッションをサーバーに保存
      await saveTurnToSession(null);
    }

    showToast(t('session.summary_created', '✓ 概要を作成しました'));
    _showSummaryModal(summary);

  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
  } finally {
    updateStatusBadge('SYNC');
  }
}

function _showSummaryModal(summary) {
  const body = document.getElementById('summaryBody');
  if (!body) return;
  body.innerHTML = `
    <div style="padding:16px;">
      <div id="summaryText" style="font-size:13px;color:var(--text);line-height:1.8;white-space:pre-wrap;">${escHtml(summary)}</div>
    </div>
  `;
  if (typeof openModal === 'function') openModal('summaryOverlay');
}
