/* ═════════════════════════════════════════════
   ComfyDeck Nook — js/modals/char-panel.js
   キャラ・セッションパネル
   ═════════════════════════════════════════════ */

function openRenameSession() {
  if (!activeSession) return;
  const current = activeSession.title || '新しいセッション';
  const title   = prompt('セッション名を入力してください', current);
  if (title === null) return; // キャンセル
  const trimmed = title.trim() || current;
  activeSession.title = trimmed;
  updateHeaderSession();
  // サーバーに保存
  if (isRestEnabled() && !isLocalSessionId(activeSession.id)) {
    restPut(`sessions/${activeChar.id}/${activeSession.id}`, activeSession)
      .catch(e => console.warn('[Nook] rename session failed:', e.message));
  }
  showToast(`「${trimmed}」に名前を設定しました`);
}

async function openCharModal() {
  openModal('charOverlay');
  await fetchCharsFromServer();
  renderCharList();
}

function handleCharFooter() {
  const isList = document.getElementById('tabCharList')?.classList.contains('active');
  if (isList) {
    openCharEdit(null);
  } else {
    // チャットセッション開始
    if (!activeChar) { showToast('キャラクターを選択してください'); return; }
    initSession();
    clearChatLog();
    if (typeof updatePhotoUI === 'function') updatePhotoUI();
    appendDateSep(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }));
    closeModal('charOverlay');
    showToast('新しいセッションを開始しました');
    if (typeof autoShowCharInfoIfNeeded === 'function') autoShowCharInfoIfNeeded();

    // オープニングメッセージ
    const opening = activeChar?.opening_message?.trim();
    if (opening) {
      setTimeout(async () => {
        const tIdx = activeSession.turns.length;
        appendCharMessage(opening, tIdx);
        const turn = {
          turn_id:      tIdx + 1,
          jp_prompt:    null, en_prompt: null, image_url: null,
          user_message: null, char_message: opening,
          is_narrative: false, gen_mode: null,
        };
        activeSession.turns.push(turn);
        await saveTurnToSession(null).catch(() => {});
      }, 300);
    }
  }
}

function handlePhotoFooter() {
  if (!activeChar) { showToast('キャラクターを選択してください'); return; }
  if (typeof startPhotoSession === 'function') {
    startPhotoSession();
    closeModal('charOverlay');
  }
}

function switchCharTab(tab) {
  const isList = tab === 'list';
  document.getElementById('tabCharList')?.classList.toggle('active', isList);
  document.getElementById('tabSessionList')?.classList.toggle('active', !isList);
  const lp = document.getElementById('panelCharList');
  const sp = document.getElementById('panelSessionList');
  if (lp) lp.style.display = isList ? '' : 'none';
  if (sp) sp.style.display = isList ? 'none' : '';
  const fb  = document.getElementById('charFooterBtn');
  const fb2 = document.getElementById('charFooterBtn2');
  if (isList) {
    if (fb)  { fb.textContent = '＋ 新しいキャラクターを作成'; fb.style.display = ''; }
    if (fb2) fb2.style.display = 'none';
  } else {
    if (fb)  { fb.textContent = '💬 チャットセッション'; fb.style.display = ''; }
    if (fb2) fb2.style.display = '';
  }
  if (!isList) {
    renderSessionList();
  }
}
