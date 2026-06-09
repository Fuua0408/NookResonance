/* ═════════════════════════════════════════════
   ComfyDeck Nook — chat.js
   チャットUI・ターン操作・コンテキストメニュー・スクロール
   ═════════════════════════════════════════════ */

async function _chatSubmitTurnOrig() {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  if (!activeChar)  { showToast(t('chat.no_char', 'キャラクターを選択してください')); openCharModal(); return; }

  const jpText     = document.getElementById('jpInput')?.value?.trim();
  const genMode    = document.getElementById('genToggle')?.checked;
  const isContinue = !jpText;

  // 画像生成モードでは空欄送信不可
  if (genMode && isContinue) {
    showToast(t('chat.no_prompt', 'プロンプトを入力してください'));
    return;
  }

  const narrative = isNarrative(jpText);
  isGenerating = true;
  setBtnState(true);

  const turn = {
    turn_id:      (activeSession?.turns?.length || 0) + 1,
    jp_prompt:    genMode ? jpText : null,
    en_prompt:    null,
    image_url:    null,
    char_message: null,
    user_message: isContinue ? null : jpText,
    generated:    genMode,
    gen_mode:     genMode ? genMode_ : null,
    is_narrative: narrative,
    created_at:   new Date().toISOString(),
  };

  try {
    if (genMode) {
      if (genMode_ === 'char') {
        // ── キャラ主導モード ──
        updateStatusBadge(t('status.char_thinking', 'キャラクターが考え中…'));
        let charMsg;
        try {
          charMsg = await getCharResponseText(jpText, narrative);
        } catch(e) {
          throw new Error(t('chat.char_response_failed', 'キャラクターの応答に失敗しました: ') + e.message);
        }
        turn.char_message = charMsg;

        const tIdx = activeSession.turns.length;
        narrative ? appendNarrativeMessage(jpText, tIdx) : appendUserMessage(jpText, tIdx);
        appendCharMessage(charMsg, tIdx);

        updateStatusBadge(t('status.translating', '翻訳中…'));
        let enPrompt;
        try {
          const prevEN = getLastEN();
          enPrompt = await translatePromptCharMode(jpText, charMsg, prevEN, narrative);
        } catch(e) {
          throw new Error(t('chat.translate_failed', '翻訳に失敗しました: ') + e.message);
        }
        turn.en_prompt = enPrompt;

        let imageUrl;
        try {
          const genResult = await generateImage(enPrompt);
          imageUrl = genResult.imageUrl;
          turn.gen_meta = { ...genResult.meta, anchor_turn_idx: activeSession.active_anchor_idx ?? null };
        } catch(e) {
          throw new Error(t('chat.gen_image_failed', '画像生成に失敗しました: ') + e.message);
        }
        turn.image_url = imageUrl;
        appendImageToLog(imageUrl, tIdx);

      } else {
        // ── 通常モード ──
        updateStatusBadge(t('status.translating', '翻訳中…'));
        let enPrompt;
        try {
          enPrompt = await translatePrompt(jpText, getLastEN(), narrative);
        } catch(e) {
          throw new Error(t('chat.translate_failed', '翻訳に失敗しました: ') + e.message);
        }
        turn.en_prompt = enPrompt;

        let imageUrl;
        try {
          const genResult = await generateImage(enPrompt);
          imageUrl = genResult.imageUrl;
          turn.gen_meta = { ...genResult.meta, anchor_turn_idx: activeSession.active_anchor_idx ?? null };
        } catch(e) {
          throw new Error(t('chat.gen_image_failed', '画像生成に失敗しました: ') + e.message);
        }
        turn.image_url = imageUrl;

        const tIdx = activeSession.turns.length;
        narrative ? appendNarrativeMessage(jpText, tIdx) : appendUserMessage(jpText, tIdx);
        appendImageToLog(imageUrl, tIdx);

        updateStatusBadge(t('status.char_thinking', 'キャラクターが認識中…'));
        let charMsg;
        try {
          charMsg = await getCharResponse(imageUrl, jpText, narrative);
        } catch(e) {
          if (e.message === 'ABNORMAL_OUTPUT') {
            turn.char_message = '__ABNORMAL__';
            appendCharMessage('__ABNORMAL__', tIdx);
            await saveTurnToSession(turn);
            const inp = document.getElementById('jpInput');
            if (inp) { inp.value = jpText; inp.disabled = false; }
            showToast(t('chat.abnormal_response', '⚠ 応答が異常でした。長押しして再生成してください'));
            return;
          }
          throw new Error(t('chat.char_response_failed', 'キャラクターの応答に失敗しました: ') + e.message);
        }
        turn.char_message = charMsg;
        appendCharMessage(charMsg, tIdx);
      }

    } else {
      // 会話のみ（空欄送信時は続き生成モード）
      const tIdx = activeSession.turns.length;
      if (!isContinue) {
        narrative ? appendNarrativeMessage(jpText, tIdx) : appendUserMessage(jpText, tIdx);
      }
      updateStatusBadge(isContinue ? t('status.generating_continue', '続きを生成中…') : t('chat.thinking', '考え中…'));
      let charMsg;
      try {
        charMsg = isContinue
          ? await getCharResponseContinue()
          : await getCharResponseText(jpText, narrative);
      } catch(e) {
        if (e.message === 'ABNORMAL_OUTPUT') {
          turn.char_message = '__ABNORMAL__';
          appendCharMessage('__ABNORMAL__', tIdx);
          await saveTurnToSession(turn);
          const inp = document.getElementById('jpInput');
          if (inp) { inp.value = jpText; inp.disabled = false; }
          showToast(t('chat.abnormal_response', '⚠ 応答が異常でした。長押しして再生成してください'));
          return;
        }
        throw new Error(t('chat.char_response_failed', 'キャラクターの応答に失敗しました: ') + e.message);
      }
      turn.char_message = charMsg;
      appendCharMessage(charMsg, tIdx);
    }

    // セッションに保存
    await saveTurnToSession(turn);

    // 正常完了時に入力欄をクリア
    const inp = document.getElementById('jpInput');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }

    // ターンごと親愛度計算（バックグラウンド・awaitしない）
    if (typeof perTurnAffectionUpdate === 'function') {
      perTurnAffectionUpdate(turn).catch(() => {});
    }

    // アンカーをリセット（1回使ったら解除）
    if (activeSession.anchors?.length) {
      delete activeSession.anchors;
      delete activeSession.active_anchor_idx;
      updateAnchorUI();
    }

  } catch(e) {
    showToast('❌ ' + (e.message || t('chat.error', 'エラーが発生しました')).slice(0, 60));
    console.error('[Nook] submitTurn error:', e);
  } finally {
    isGenerating = false;
    setBtnState(false);
    updateStatusBadge('SYNC');
  }
}
function getLastEN() {
  // アンカーが設定されていればアンカーを返す
  const anchor = getAnchorEN();
  if (anchor) return anchor;
  if (!activeSession?.turns?.length) return '';
  return [...activeSession.turns].reverse().find(t => t.en_prompt)?.en_prompt || '';
}
function appendImageToLog(imageUrl, turnIdx = null) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'turn-image';
  if (turnIdx !== null) {
    div.dataset.turnIdx = turnIdx;
    bindImageContext(div, turnIdx);
  }
  const escapedUrl = imageUrl.replace(/'/g, "\\'");
  div.innerHTML = `<img src="${imageUrl}" alt="生成画像" onclick="openLightbox('${escapedUrl}')">`;
  log.appendChild(div);
  scrollLogToBottom();
}
function appendCharMessage(text, turnIdx = null) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'char-msg';
  if (turnIdx !== null) {
    div.dataset.turnIdx = turnIdx;
    bindMessageContext(div, turnIdx, 'char');
  }
  const iconHtml = activeChar?.icon_data
    ? `<img src="${activeChar.icon_data}" class="char-icon" style="object-fit:cover;">`
    : `<div class="char-icon">${escHtml(activeChar?.icon_emoji || '💬')}</div>`;
  div.innerHTML = `
    ${iconHtml}
    <div>
      <div class="char-name-label">${escHtml(activeChar?.name || 'キャラクター')}</div>
      <div class="char-bubble"></div>
    </div>
  `;
  renderCharBubble(div.querySelector('.char-bubble'), text);
  log.appendChild(div);
  scrollLogToBottom();
}
function appendNarrativeMessage(text, turnIdx = null) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'narrative-msg';
  if (turnIdx !== null) {
    div.dataset.turnIdx = turnIdx;
    bindMessageContext(div, turnIdx, 'narrative');
  }
  div.innerHTML = `<div class="narrative-text">${escHtml(stripNarrative(text))}</div>`;
  log.appendChild(div);
  scrollLogToBottom();
}
function appendUserMessage(text, turnIdx = null) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'user-msg';
  if (turnIdx !== null) {
    div.dataset.turnIdx = turnIdx;
    bindMessageContext(div, turnIdx, 'user');
  }
  div.innerHTML = `<div class="user-bubble">${escHtml(text)}</div>`;
  log.appendChild(div);
  scrollLogToBottom();
}
function appendDateSep(label) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'date-sep';
  div.textContent = label;
  log.appendChild(div);
}
function clearChatLog() {
  const log = document.getElementById('chatLog');
  if (log) log.innerHTML = '';
}
function scrollLogToBottom() {
  const log = document.getElementById('chatLog');
  if (log) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}
function _scrollKey(sessionId) {
  return 'nook_scroll_' + sessionId;
}
function saveScrollPosition() {
  const log = document.getElementById('chatLog');
  if (!log || !activeSession?.id) return;
  // 最下部付近（20px以内）なら記録しない（次回も最下部に飛ぶ）
  const distFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
  if (distFromBottom <= 20) {
    sessionStorage.removeItem(_scrollKey(activeSession.id));
  } else {
    sessionStorage.setItem(_scrollKey(activeSession.id), log.scrollTop);
  }
}
function restoreScrollPosition(sessionId) {
  const log = document.getElementById('chatLog');
  if (!log || !sessionId) return;
  const saved = sessionStorage.getItem(_scrollKey(sessionId));
  requestAnimationFrame(() => {
    if (saved !== null) {
      log.scrollTop = parseInt(saved);
    } else {
      log.scrollTop = log.scrollHeight; // 未記録は最下部
    }
  });
}
function initScrollTracking() {
  const log = document.getElementById('chatLog');
  if (!log) return;
  let _scrollTimer = null;
  log.addEventListener('scroll', () => {
    if (_scrollTimer) clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(saveScrollPosition, 200);
  }, { passive: true });
}
function showCtxMenu(x, y, items) {
  closeCtxMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = 'ctxMenu';

  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.danger ? ' danger' : '');
    el.innerHTML = `<span>${item.icon || ''}</span><span>${escHtml(item.label)}</span>`;
    el.onclick = () => { closeCtxMenu(); item.action(); };
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  _ctxMenu = menu;

  // 画面外にはみ出さないよう位置調整
  const mw = menu.offsetWidth  || 200;
  const mh = menu.offsetHeight || 200;
  const px = Math.min(x, window.innerWidth  - mw - 8);
  const py = Math.min(y, window.innerHeight - mh - 8);
  menu.style.left = px + 'px';
  menu.style.top  = py + 'px';

  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target)) {
        closeCtxMenu();
        document.removeEventListener('click',      close);
        document.removeEventListener('touchstart', close);
      }
    };
    document.addEventListener('click',      close);
    document.addEventListener('touchstart', close, { passive: true });
  }, 100);
}
function closeCtxMenu() {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
}
function bindImageContext(div, turnIdx) {
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showImageCtxMenu(e.clientX || e.touches?.[0]?.clientX || 100,
                     e.clientY || e.touches?.[0]?.clientY || 100, turnIdx);
  };

  // PC: 右クリック
  div.addEventListener('contextmenu', handler);

  // スマホ: 長押し
  let timer;
  let longPressed = false;

  div.addEventListener('touchstart', e => {
    longPressed = false;
    timer = setTimeout(() => {
      longPressed = true;
      handler(e);
    }, 600);
  }, { passive: true });

  div.addEventListener('touchend', e => {
    clearTimeout(timer);
    if (longPressed) {
      e.preventDefault(); // clickイベントを抑制
      longPressed = false;
    }
  });

  div.addEventListener('touchmove', () => {
    clearTimeout(timer);
    longPressed = false;
  });

  // clickがメニューを閉じないようにメニュー表示中はclickを抑制
  div.addEventListener('click', e => {
    if (_ctxMenu) e.stopPropagation();
  });
}
function showImageCtxMenu(x, y, turnIdx) {
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn) return;

  const inPhoto = typeof isPhotoMode === 'function' && isPhotoMode();

  const items = [
    {
      icon: '📋', label: t('chat.view_prompt', 'プロンプトを確認'),
      action: () => showPromptDialog(turn),
    },
    {
      icon: '✏️', label: t('chat.edit_prompt', 'プロンプトを直接修正'),
      action: () => openPromptEditModal(turnIdx),
    },
  ];

  if (!inPhoto) {
    items.push({
      icon: '⚓', label: t('chat.set_anchor', 'アンカーを設定する'),
      action: () => startAnchorSelect(),
    });
  }

  items.push('sep');

  if (!inPhoto) {
    items.push(
      {
        icon: '💬', label: t('chat.reroll_char_only', '反応のみ再生成'),
        action: () => rerollCharOnly(turnIdx),
      },
    );
  }

  items.push({
    icon: '🔄', label: t('chat.reroll_retranslate', '再推論して再生成'),
    action: () => rerollTurnWithRetranslate(turnIdx, false),
  });

  if (!inPhoto) {
    items.push(
      {
        icon: '🔄💬', label: t('chat.reroll_retranslate_char', '再推論＋キャラ再反応'),
        action: () => rerollTurnWithRetranslate(turnIdx, true),
      },
    );
  }

  items.push('sep');

  items.push({
    icon: '🎲', label: t('chat.reroll_new_seed', '新Seedで再生成'),
    action: () => rerollTurnNewSeed(turnIdx),
  });

  showCtxMenu(x, y, items);
}
function bindMessageContext(div, turnIdx, role) {
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showMessageCtxMenu(e.clientX || e.touches?.[0]?.clientX || 100,
                       e.clientY || e.touches?.[0]?.clientY || 100, turnIdx, role);
  };

  div.addEventListener('contextmenu', handler);

  let timer;
  let longPressed = false;

  div.addEventListener('touchstart', e => {
    longPressed = false;
    timer = setTimeout(() => {
      longPressed = true;
      handler(e);
    }, 600);
  }, { passive: true });

  div.addEventListener('touchend', e => {
    clearTimeout(timer);
    if (longPressed) {
      e.preventDefault();
      longPressed = false;
    }
  });

  div.addEventListener('touchmove', () => {
    clearTimeout(timer);
    longPressed = false;
  });

  div.addEventListener('click', e => {
    if (_ctxMenu) e.stopPropagation();
  });
}
function showMessageCtxMenu(x, y, turnIdx, role) {
  const items = [];
  const turn = activeSession?.turns?.[turnIdx];

  if (role === 'char') {
    items.push({
      icon: '✏', label: t('chat.edit_character_reply', 'キャラの返答を編集'),
      action: () => editCharMessage(turnIdx),
    });
    if (turn?.char_message) {
      items.push({
        icon: '📋', label: t('chat.copy_conversation', '会話をコピー'),
        action: () => { copyToClipboard(turn.char_message); },
      });
    }
    items.push({
      icon: '🔄', label: t('chat.reroll_character', 'キャラ反応を再生成'),
      action: () => rerollCharOnly(turnIdx),
    });
    // 画像なしターンに画像を生成
    if (!turn?.image_url && turn?.char_message) {
      items.push({
        icon: '🎨', label: t('chat.generate_image', '画像を生成'),
        action: () => rerollImageFromTurn(turnIdx),
      });
    }
  } else {
    items.push({
      icon: '✏', label: t('chat.edit_turn', 'このターンを編集'),
      action: () => editTurn(turnIdx),
    });
    if (turn?.user_message) {
      items.push({
        icon: '📋', label: t('chat.copy_conversation', '会話をコピー'),
        action: () => { copyToClipboard(turn.user_message); },
      });
    }
  }

  items.push({
    icon: '🌿', label: t('chat.branch_here', 'ここから分岐'),
    action: () => branchFromTurn(turnIdx),
  });

  items.push({
    icon: '🗑', label: t('chat.delete_turn', 'このターンを削除'), danger: true,
    action: () => deleteTurn(turnIdx),
  });

  showCtxMenu(x, y, items);
}
async function rerollCharOnly(turnIdx) {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn) return;

  isGenerating = true;
  setBtnState(true);
  try {
    updateStatusBadge(t('status.char_thinking', 'キャラクターが認識中…'));
    let charMsg;
    if (turn.image_url) {
      // 画像ありの場合はVision
      charMsg = await getCharResponse(turn.image_url, turn.user_message, turn.is_narrative);
    } else {
      // 画像なしの場合はテキストのみ
      charMsg = await getCharResponseText(turn.user_message || '', turn.is_narrative);
    }
    turn.char_message = charMsg;
    updateTurnCharMessage(turnIdx, charMsg);
    await saveTurnToSession(null);
    showToast(t('chat.response_regenerated', '✓ 反応を再生成しました'));
  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
  } finally {
    isGenerating = false;
    setBtnState(false);
    updateStatusBadge('SYNC');
  }
}
// 画像なしターンに後から画像を生成
async function rerollImageFromTurn(turnIdx) {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn) return;

  isGenerating = true;
  setBtnState(true);
  try {
    updateStatusBadge(t('status.translating', '翻訳中…'));
    const prevEN = getAnchorEN() || (turnIdx === 0 ? '' : (activeSession.turns[turnIdx - 1]?.en_prompt || ''));
    let enPrompt;
    if (turn.gen_mode === 'char' && turn.char_message) {
      enPrompt = await translatePromptCharMode(turn.user_message || '', turn.char_message, prevEN, turn.is_narrative);
    } else {
      enPrompt = await translatePrompt(turn.user_message || turn.jp_prompt || '', prevEN, turn.is_narrative);
    }
    turn.en_prompt = enPrompt;

    updateStatusBadge(t('status.generating', '生成中…'));
    const { imageUrl, meta } = await generateImage(enPrompt);
    turn.image_url = imageUrl;
    turn.gen_meta  = meta;
    appendImageToLogWithIndex(imageUrl, turnIdx);
    await saveTurnToSession(null);
    showToast(t('chat.image_generated', '✓ 画像を生成しました'));
  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
  } finally {
    isGenerating = false;
    setBtnState(false);
    updateStatusBadge('SYNC');
  }
}

async function rerollTurnWithRetranslate(turnIdx, withCharReaction) {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn?.jp_prompt) { showToast(t('chat.no_prompt', 'プロンプトがありません')); return; }

  isGenerating = true;
  setBtnState(true);
  try {
    // 再推論（gen_modeに応じて翻訳方法を切り替え）
    updateStatusBadge(t('session.retranslating', '再推論中…'));
    const anchor = getAnchorEN();
    const prevEN = anchor || (turnIdx === 0 ? '' : (activeSession.turns[turnIdx - 1]?.en_prompt || ''));
    let newEN;
    if (turn.gen_mode === 'char' && turn.char_message) {
      newEN = await translatePromptCharMode(turn.user_message || '', turn.char_message, prevEN, turn.is_narrative);
    } else {
      newEN = await translatePrompt(turn.jp_prompt, prevEN, turn.is_narrative);
    }
    turn.en_prompt = newEN;

    // 再生成
    updateStatusBadge(t('session.regenerating', '再生成中…'));
    const { imageUrl: newUrl, meta: newMeta } = await generateImage(newEN);
    turn.image_url = newUrl;
    turn.gen_meta  = { ...newMeta, anchor_turn_idx: activeSession.active_anchor_idx ?? null };
    updateTurnImage(turnIdx, newUrl);

    // フォトモードはカルーセルに追記・プロンプト表示更新
    if (typeof isPhotoMode === 'function' && isPhotoMode()) {
      addPhotoCarouselSlide(newUrl, turnIdx);
      if (typeof updatePhotoTurnPrompt === 'function') updatePhotoTurnPrompt(turnIdx, newEN);
    }

    // キャラ再反応
    if (withCharReaction) {
      updateStatusBadge(t('status.char_thinking', 'キャラクターが認識中…'));
      const charMsg = await getCharResponse(newUrl, turn.user_message, turn.is_narrative);
      turn.char_message = charMsg;
      updateTurnCharMessage(turnIdx, charMsg);
    }

    // サーバー保存
    await saveTurnToSession(null);
    showToast(t('chat.regenerated', '✓ 再生成しました'));
  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
  } finally {
    isGenerating = false;
    setBtnState(false);
    updateStatusBadge('SYNC');
  }
}
async function rerollTurnNewSeed(turnIdx) {
  if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn?.en_prompt) { showToast(t('chat.no_prompt', 'プロンプトがありません')); return; }

  isGenerating = true;
  setBtnState(true);
  try {
    updateStatusBadge(t('session.regenerating', '再生成中…'));
    const { imageUrl: newUrl, meta: newMeta } = await generateImage(turn.en_prompt);
    turn.image_url = newUrl;
    turn.gen_meta  = { ...newMeta, anchor_turn_idx: null };
    updateTurnImage(turnIdx, newUrl);

    // フォトモードはカルーセルに追記
    if (typeof isPhotoMode === 'function' && isPhotoMode()) {
      addPhotoCarouselSlide(newUrl, turnIdx);
    }
    await saveTurnToSession(null);
    showToast(t('chat.regenerated', '✓ 再生成しました'));
  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
  } finally {
    isGenerating = false;
    setBtnState(false);
    updateStatusBadge('SYNC');
  }
}
function editCharMessage(turnIdx) {
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn) return;

  // 既存のchar-msgのbubbleをインライン編集に置き換え
  const msgDiv = document.querySelector(`.char-msg[data-turn-idx="${turnIdx}"]`);
  if (!msgDiv) return;
  const bubble = msgDiv.querySelector('.char-bubble');
  if (!bubble) return;

  const original = turn.char_message || '';
  const textarea = document.createElement('textarea');
  textarea.value = original;
  textarea.style.cssText = `
    width:100%; box-sizing:border-box;
    min-height:80px; max-height:300px;
    font-size:13px; font-family:var(--font-sans);
    padding:8px 10px; border-radius:var(--radius-sm);
    border:1.5px solid var(--accent);
    background:var(--bg-white); color:var(--text);
    resize:vertical; line-height:1.6;
  `;

  // ボタン行
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = t('cancel', 'キャンセル');
  cancelBtn.style.cssText = 'font-size:12px;padding:5px 10px;border-radius:6px;border:0.5px solid var(--border-input);background:var(--bg-white);color:var(--text-mid);cursor:pointer;';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = t('save', '保存');
  saveBtn.style.cssText = 'font-size:12px;padding:5px 10px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;';

  const restore = () => {
    bubble.textContent = turn.char_message || '';
    bubble.style.display = '';
    wrapper.remove();
  };

  cancelBtn.addEventListener('click', restore);
  saveBtn.addEventListener('click', () => {
    const newMsg = textarea.value.trim();
    if (!newMsg) { showToast(t('input_required', '内容を入力してください')); return; }
    turn.char_message = newMsg;
    bubble.style.display = '';
    renderCharBubble(bubble, newMsg);
    wrapper.remove();
    saveTurnToSession(null).catch(e => console.warn(e));
    showToast(t('edited', '編集しました'));
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  const wrapper = document.createElement('div');
  wrapper.appendChild(textarea);
  wrapper.appendChild(btnRow);

  bubble.style.display = 'none';
  bubble.insertAdjacentElement('afterend', wrapper);

  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}
function editTurn(turnIdx) {
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn) return;

  // ユーザーメッセージのDOM要素を探す
  const bubbles = document.querySelectorAll('.user-msg[data-turn-idx]');
  let targetBubble = null;
  bubbles.forEach(el => {
    if (parseInt(el.dataset.turnIdx) === turnIdx) targetBubble = el;
  });
  if (!targetBubble) return;

  const bubble = targetBubble.querySelector('.user-bubble');
  if (!bubble) return;

  // すでに編集中なら何もしない
  if (targetBubble.querySelector('textarea')) return;

  const original = turn.user_message || '';
  const ta = document.createElement('textarea');
  ta.value = original;
  ta.style.cssText = [
    'width:100%', 'box-sizing:border-box',
    'background:var(--accent)', 'color:#fff',
    'border:none', 'border-radius:var(--radius-sm)',
    'padding:8px 10px', 'font-size:13px',
    'font-family:var(--font-sans)', 'line-height:1.6',
    'resize:none', 'min-height:60px',
  ].join(';');
  autoResize(ta);
  ta.addEventListener('input', () => autoResize(ta));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end;';

  const btnOk = document.createElement('button');
  btnOk.textContent = t('chat.save_edit', '✓ 保存');
  btnOk.style.cssText = 'padding:6px 12px;font-size:12px;background:rgba(255,255,255,0.2);border:0.5px solid rgba(255,255,255,0.4);border-radius:var(--radius-sm);color:#fff;cursor:pointer;font-family:var(--font-sans);';

  const btnCancel = document.createElement('button');
  btnCancel.textContent = t('cancel', 'キャンセル');
  btnCancel.style.cssText = 'padding:6px 12px;font-size:12px;background:transparent;border:0.5px solid rgba(255,255,255,0.3);border-radius:var(--radius-sm);color:rgba(255,255,255,0.8);cursor:pointer;font-family:var(--font-sans);';

  btnRow.appendChild(btnCancel);
  btnRow.appendChild(btnOk);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;';
  wrapper.appendChild(ta);
  wrapper.appendChild(btnRow);

  bubble.replaceWith(wrapper);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const save = () => {
    const newMsg = ta.value.trim();
    turn.user_message = newMsg;
    wrapper.replaceWith(bubble);
    updateTurnUserMessage(turnIdx, newMsg);
    saveTurnToSession(null).catch(e => console.warn(e));
    showToast(t('edited', '編集しました'));
  };
  const cancel = () => { wrapper.replaceWith(bubble); };

  btnOk.addEventListener('click', save);
  btnCancel.addEventListener('click', cancel);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  });
}
async function deleteTurn(turnIdx) {
  if (!confirm(t('chat.delete_turn_confirm', 'このターンを削除しますか？'))) return;
  activeSession.turns.splice(turnIdx, 1);
  // チャットログ再描画
  clearChatLog();
  appendDateSep(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }));
  activeSession.turns.forEach((t, i) => renderTurn(t, i));
  updateHeaderSession();
  await saveTurnToSession(null);
  showToast(t('toast.deleted', '削除しました'));
}
function updateTurnCharMessage(turnIdx, text) {
  const divs = document.querySelectorAll('.char-msg[data-turn-idx]');
  divs.forEach(d => {
    if (parseInt(d.dataset.turnIdx) === turnIdx) {
      const bubble = d.querySelector('.char-bubble');
      if (bubble) renderCharBubble(bubble, text);
    }
  });
}
function updateTurnUserMessage(turnIdx, text) {
  const divs = document.querySelectorAll('.user-msg[data-turn-idx], .narrative-msg[data-turn-idx]');
  divs.forEach(d => {
    if (parseInt(d.dataset.turnIdx) === turnIdx) {
      const bubble = d.querySelector('.user-bubble, .narrative-text');
      if (bubble) bubble.textContent = text;
    }
  });
}
function renderTurn(turn, idx) {
  if (turn.is_narrative) {
    appendNarrativeMessage('*' + (turn.user_message || '') + '*', idx);
  } else if (turn.user_message) {
    appendUserMessage(turn.user_message, idx);
  }

  if (turn.generated && turn.image_url && turn.char_message) {
    if (turn.gen_mode === 'char') {
      appendCharMessage(turn.char_message, idx);
      appendImageToLogWithIndex(turn.image_url, idx);
    } else {
      appendImageToLogWithIndex(turn.image_url, idx);
      appendCharMessage(turn.char_message, idx);
    }
  } else {
    if (turn.image_url)    appendImageToLogWithIndex(turn.image_url, idx);
    if (turn.char_message) appendCharMessage(turn.char_message, idx);
  }
}
function appendImageToLogWithIndex(imageUrl, turnIdx) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'turn-image';
  div.dataset.turnIdx = turnIdx;
  bindImageContext(div, turnIdx);
  const escapedUrl = imageUrl.replace(/'/g, "\\'");
  div.innerHTML = `<img src="${imageUrl}" alt="生成画像" onclick="openLightbox('${escapedUrl}')">`;
  log.appendChild(div);
  scrollLogToBottom();
}
function updateTurnImage(turnIdx, newUrl) {
  const div = document.querySelector(`.turn-image[data-turn-idx="${turnIdx}"]`);
  if (!div) return;
  const escapedUrl = newUrl.replace(/'/g, "\\'");
  div.innerHTML = `<img src="${newUrl}" alt="生成画像" onclick="openLightbox('${escapedUrl}')">`;
}
function updateHeaderSession() {
  const el = document.getElementById('headerSession');
  if (!el || !activeSession) return;
  const title = typeof displaySessionTitle === 'function' ? displaySessionTitle(activeSession.title) : activeSession.title;
  const turns = typeof formatTurnCount === 'function' ? formatTurnCount(activeSession.turns.length) : `${activeSession.turns.length}ターン`;
  el.textContent = `${title} · ${turns}`;
}
function renderCharBubble(container, text) {
  if (!text) { container.textContent = ''; return; }

  // 「」を含まない場合はそのまま表示
  if (!text.includes('「')) {
    container.textContent = text;
    return;
  }

  container.innerHTML = '';

  // 「」で分割してセリフと地の文を交互にレンダリング
  const parts = text.split(/(「[^」]*」)/g);
  parts.forEach(part => {
    if (!part) return;
    const span = document.createElement('span');
    if (part.startsWith('「') && part.endsWith('」')) {
      span.className = 'serif-line';
      // セリフは前後に改行を入れて独立させる
      span.style.display = 'block';
    } else {
      span.className = 'prose-line';
      span.style.display = 'block';
    }
    span.textContent = part.trim();
    if (span.textContent) container.appendChild(span);
  });
}
