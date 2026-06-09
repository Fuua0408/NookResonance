/* ═════════════════════════════════════════════
   NookResonance — char-data.js
   キャラクターデータ管理（ロード・保存・選択）
   ═════════════════════════════════════════════ */

let _charsFullCache = [];

function loadChars() {
  return _charsFullCache;
}
function cacheChars(chars) {
  _charsFullCache = chars;
}
async function fetchCharsFromServer() {
  try {
    const chars = await restGet('characters');
    _charsFullCache = chars;
    return chars;
  } catch(e) {
    console.warn('[NR] fetchChars failed:', e.message);
  }
}
async function fetchCustomWfsFromServer() {
  try {
    const wfs = await restGet('workflows');
    _customWfs = wfs;
    return wfs;
  } catch(e) {
    console.warn('[NR] fetchWfs failed:', e.message);
  }
}
async function saveChar(char) {
  const isNew = !char.id || (typeof char.id === 'string' && char.id.startsWith('char_'));

  if (isNew) {
    try {
      const res = await restPost('characters', char);
      const newId = res.id;
      const updated = { ...char, id: newId };
      const idx = _charsFullCache.findIndex(c => c.id === char.id);
      if (idx >= 0) _charsFullCache[idx] = updated; else _charsFullCache.push(updated);
      saveSettings({ lastCharId: newId });
      return updated;
    } catch(e) {
      console.warn('[NR] saveChar POST failed:', e.message);
      showToast(t('server_save_failed', '⚠ サーバー保存に失敗しました'));
      return char;
    }
  } else {
    const idx = _charsFullCache.findIndex(c => c.id === char.id);
    if (idx >= 0) _charsFullCache[idx] = char; else _charsFullCache.push(char);
    try {
      await restPut(`characters/${char.id}`, char);
    } catch(e) {
      console.warn('[NR] saveChar PUT failed:', e.message);
      showToast(t('server_save_failed', '⚠ サーバー保存に失敗しました'));
    }
    return char;
  }
}
async function deleteChar(charId) {
  _charsFullCache = _charsFullCache.filter(c => c.id !== charId);
  try {
    await restDelete(`characters/${charId}`);
  } catch(e) {
    console.warn('[NR] deleteChar failed:', e.message);
  }
}
async function selectChar(char) {
  if (!char.icon_data) {
    const cached = _charsFullCache.find(c => c.id === char.id);
    if (cached?.icon_data) {
      char = cached;
    } else {
      try {
        const full = await restGet(`characters/${char.id}`);
        char = full;
        const idx = _charsFullCache.findIndex(c => c.id === char.id);
        if (idx >= 0) _charsFullCache[idx] = char;
      } catch(e) {
        console.warn('[NR] selectChar icon fetch failed:', e.message);
      }
    }
  }
  activeChar = char;
  const avatarEl = document.getElementById('headerAvatar');
  if (avatarEl) {
    if (char.icon_data) {
      avatarEl.innerHTML = `<img src="${char.icon_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      avatarEl.textContent = char.icon_emoji || '💬';
    }
  }
  document.getElementById('headerName').textContent = char.name || 'キャラクター';
  saveSettings({ lastCharId: char.id });
  closeModal('charOverlay');
  showToast(`${char.name} ${t('char.selected_button', 'を選択しました')}`);
  toggleGenMode();

  // バックグラウンドでsync実行
  restPost(`images/sync/${char.id}`, {})
    .catch(e => console.warn('[NR] bg image sync failed:', e.message));

  // 最新セッションを自動ロード（なければ新規セッション）
  clearChatLog();
  try {
    const sessions = await restGet(`sessions/${char.id}`);
    const latest = sessions
      .filter(s => !s.archived)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (latest) {
      const full = await restGet(`sessions/${char.id}/${latest.id}`);
      activeSession = full;

      if (full.mode === 'continuous') {
        if (typeof restorePhotoCarousel === 'function') restorePhotoCarousel(full);
        if (typeof updatePhotoUI === 'function') updatePhotoUI();
        full.turns.forEach((turn, idx) => {
          if (typeof appendPhotoTurnToLog === 'function') appendPhotoTurnToLog(turn, idx);
        });
      } else {
        if (typeof updatePhotoUI === 'function') updatePhotoUI();
        appendDateSep(full.created_at?.slice(0,10) || new Date().toLocaleDateString('ja-JP'));
        full.turns.forEach((turn, idx) => renderTurn(turn, idx));
      }

      updateHeaderSession();
      restoreScrollPosition(full.id);
      if (typeof autoShowCharInfoIfNeeded === 'function') autoShowCharInfoIfNeeded();
      return;
    }
  } catch(e) {
    console.warn('[NR] auto load session failed:', e.message);
  }

  if (typeof updatePhotoUI === 'function') updatePhotoUI();
  initSession();
  appendDateSep(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }));
  if (typeof autoShowCharInfoIfNeeded === 'function') autoShowCharInfoIfNeeded();

  const opening = activeChar?.opening_message?.trim();
  if (opening) {
    setTimeout(async () => {
      const tIdx = activeSession.turns.length;
      appendCharMessage(opening, tIdx);
      const turn = {
        turn_id:      tIdx + 1,
        jp_prompt:    null,
        en_prompt:    null,
        image_url:    null,
        user_message: null,
        char_message: opening,
        is_narrative: false,
        gen_mode:     null,
      };
      activeSession.turns.push(turn);
      await saveTurnToSession(null).catch(() => {});
    }, 300);
  }
}
