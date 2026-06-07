/* ═════════════════════════════════════════════
   Alcove — photo.js
   フォトモード（連続生成・カルーセル・差分・直接送信）
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// フォトモード状態
// ─────────────────────────────────────────────
let _photoCarouselSlides = []; // { url, turnIdx } の配列
let _photoCarouselIdx    = 0;
// 翻訳モード: 'translate' | 'diff' | 'direct'
let _photoTranslateMode  = 'translate';

// ─────────────────────────────────────────────
// モード判定ユーティリティ
// ─────────────────────────────────────────────
function isPhotoMode() {
  return activeSession?.mode === 'continuous';
}

// ─────────────────────────────────────────────
// 翻訳モード切り替え（セグメントコントロール）
// ─────────────────────────────────────────────
function setPhotoTranslateMode(mode) {
  _photoTranslateMode = mode;
  ['translate', 'diff', 'direct'].forEach(m => {
    const el = document.getElementById('photoMode' + m.charAt(0).toUpperCase() + m.slice(1));
    if (el) el.classList.toggle('active', m === mode);
  });
  const inp = document.getElementById('jpInput');
  if (inp) {
    inp.placeholder = mode === 'direct'
      ? 'ENプロンプトを直接入力（LLM翻訳なし）'
      : '日本語でシーンを入力…';
  }
}

// ─────────────────────────────────────────────
// フォトモードセッション開始
// ─────────────────────────────────────────────
function startPhotoSession() {
  if (!activeChar) {
    showToast('キャラクターを選択してください');
    openCharModal();
    return;
  }
  // 新しいフォトモードセッションを初期化
  activeSession = {
    id:         'session_' + Date.now(),
    char_id:    activeChar.id,
    title:      'フォトセッション',
    mode:       'continuous',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived:   false,
    turns:      [],
  };
  _photoCarouselSlides = [];
  _photoCarouselIdx    = 0;
  _photoTranslateMode  = 'translate';

  // セグメントコントロールを初期化
  setPhotoTranslateMode('translate');

  updatePhotoUI();
  updateHeaderSession();
  showToast('📷 フォトモードを開始しました');
}

// ─────────────────────────────────────────────
// フォトモードUIの切り替え
// ─────────────────────────────────────────────
function updatePhotoUI() {
  const inPhoto = isPhotoMode();
  document.getElementById('app')?.setAttribute('data-mode', inPhoto ? 'photo' : 'chat');

  // カルーセルの表示/非表示
  const carousel = document.getElementById('photoCarousel');
  if (carousel) carousel.style.display = inPhoto ? '' : 'none';

  // 入力エリアのフォトモードコントロール
  const photoControls = document.getElementById('photoControls');
  if (photoControls) photoControls.style.display = inPhoto ? 'flex' : 'none';

  // チャットモードコントロール（genToggle行）
  const chatControls = document.getElementById('chatInputControls');
  if (chatControls) chatControls.style.display = inPhoto ? 'none' : '';

  // 入力プレースホルダー変更
  const inp = document.getElementById('jpInput');
  if (inp) {
    if (inPhoto) {
      inp.placeholder = _photoTranslateMode === 'direct'
        ? 'ENプロンプトを直接入力（LLM翻訳なし）'
        : '日本語でシーンを入力…';
    } else {
      inp.placeholder = 'プロンプトを入力…';
    }
  }

  // 送信ボタンラベル変更
  const btn = document.getElementById('btnSend');
  if (btn && !isGenerating) {
    btn.textContent = inPhoto ? '📷 生成' : '送信 ▶';
  }

  // カルーセルを再描画
  if (inPhoto) renderPhotoCarousel();
}

// ─────────────────────────────────────────────
// フォトモード送信（メインエントリ）
// ─────────────────────────────────────────────
async function submitPhotoTurn() {
  if (isGenerating) { showToast('生成中です'); return; }
  if (!activeChar)  { showToast('キャラクターを選択してください'); return; }

  const inputText = document.getElementById('jpInput')?.value?.trim();
  if (!inputText) { showToast('プロンプトを入力してください'); return; }

  isGenerating = true;
  setPhotoBtnState(true);

  const turn = {
    turn_id:      (activeSession?.turns?.length || 0) + 1,
    jp_prompt:    _photoTranslateMode === 'direct' ? null : inputText,
    en_prompt:    null,
    image_url:    null,
    char_message: null,
    user_message: inputText,
    generated:    true,
    gen_mode:     'photo',
    is_narrative: false,
    translate_mode: _photoTranslateMode,
    created_at:   new Date().toISOString(),
  };

  try {
    let enPrompt;

    if (_photoTranslateMode === 'direct') {
      // ── 直接送信：入力テキストをそのままENとして使用 ──
      enPrompt = inputText;
      turn.en_prompt = enPrompt;
      updateStatusBadge('直接送信中…');
    } else {
      // ── LLM翻訳（通常 or 差分）──
      updateStatusBadge('翻訳中…');
      const prevEN = _photoTranslateMode === 'diff' ? getPhotoLastEN() : '';
      enPrompt = await translatePrompt(inputText, prevEN, false);
      turn.en_prompt = enPrompt;
    }

    // ComfyUI生成
    updateStatusBadge('生成中…');
    const genResult = await generateImage(enPrompt);
    turn.image_url = genResult.imageUrl;
    turn.gen_meta  = genResult.meta;

    // カルーセルに追加
    addPhotoCarouselSlide(genResult.imageUrl, activeSession.turns.length);

    // チャットログにも追加（軽量表示）
    appendPhotoTurnToLog(turn, activeSession.turns.length);

    // セッション保存
    await saveTurnToSession(turn);

    // 入力欄クリア
    const inp = document.getElementById('jpInput');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }

  } catch(e) {
    showToast('❌ ' + (e.message || 'エラーが発生しました').slice(0, 60));
    console.error('[Alcove] submitPhotoTurn error:', e);
  } finally {
    isGenerating = false;
    setPhotoBtnState(false);
    updateStatusBadge('SYNC');
  }
}

// ─────────────────────────────────────────────
// フォトモード：最後のENプロンプトを取得
// ─────────────────────────────────────────────
function getPhotoLastEN() {
  if (!activeSession?.turns?.length) return '';
  return [...activeSession.turns].reverse().find(t => t.en_prompt)?.en_prompt || '';
}

// ─────────────────────────────────────────────
// フォトモード：ボタン状態
// ─────────────────────────────────────────────
function setPhotoBtnState(on) {
  const btn = document.getElementById('btnSend');
  const inp = document.getElementById('jpInput');
  if (btn) {
    btn.disabled    = on;
    btn.textContent = on ? '⏳' : '📷 生成';
  }
  if (inp) {
    inp.disabled = on;
    if (!on) inp.focus();
  }
}

// ─────────────────────────────────────────────
// カルーセルUI
// ─────────────────────────────────────────────
function addPhotoCarouselSlide(imageUrl, turnIdx) {
  _photoCarouselSlides.push({ url: imageUrl, turnIdx });
  renderPhotoCarousel();
  // 最新スライドへ自動ジャンプ
  photoCarouselGoTo(_photoCarouselSlides.length - 1);
}

function renderPhotoCarousel() {
  const track = document.getElementById('photoCarouselTrack');
  const dots  = document.getElementById('photoCarouselDots');
  const countEl = document.getElementById('photoCarouselCount');
  if (!track || !dots) return;

  track.innerHTML = '';
  dots.innerHTML  = '';

  if (!_photoCarouselSlides.length) {
    track.innerHTML = `
      <div class="photo-carousel-empty">
        <div>📷</div>
        <div>生成した画像がここに並びます</div>
      </div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  _photoCarouselSlides.forEach((slide, idx) => {
    // スライド
    const div = document.createElement('div');
    div.className = 'photo-carousel-slide';

    const img = document.createElement('img');
    img.src     = slide.url;
    img.alt     = `生成画像 ${idx + 1}`;
    img.loading = 'lazy';
    img.addEventListener('click', () => {
      const images = _photoCarouselSlides.map(s => ({ url: s.url }));
      openLightbox(slide.url, {
        images,
        idx,
        onNavigate: (newIdx) => photoCarouselGoTo(newIdx),
      });
    });
    div.appendChild(img);
    track.appendChild(div);

    // ドット
    const dot = document.createElement('div');
    dot.className = 'photo-carousel-dot' + (idx === _photoCarouselIdx ? ' active' : '');
    dot.addEventListener('click', () => photoCarouselGoTo(idx));
    dots.appendChild(dot);
  });

  // カウント表示
  if (countEl) {
    countEl.textContent = `${_photoCarouselIdx + 1} / ${_photoCarouselSlides.length}`;
  }

  // 現在位置にスクロール
  _applyCarouselTransform();
}

function photoCarouselGoTo(idx) {
  _photoCarouselIdx = Math.max(0, Math.min(idx, _photoCarouselSlides.length - 1));
  _applyCarouselTransform();

  // ドット更新
  document.querySelectorAll('.photo-carousel-dot').forEach((d, i) => {
    d.classList.toggle('active', i === _photoCarouselIdx);
  });

  // カウント更新
  const countEl = document.getElementById('photoCarouselCount');
  if (countEl && _photoCarouselSlides.length) {
    countEl.textContent = `${_photoCarouselIdx + 1} / ${_photoCarouselSlides.length}`;
  }
}

function _applyCarouselTransform() {
  const track = document.getElementById('photoCarouselTrack');
  if (track) track.style.transform = `translateX(-${_photoCarouselIdx * 100}%)`;
}

// ─────────────────────────────────────────────
// カルーセルスワイプ初期化
// ─────────────────────────────────────────────
function initPhotoCarouselSwipe() {
  const outer = document.getElementById('photoCarouselOuter');
  if (!outer) return;
  let startX = 0, startY = 0, dragging = false, dx = 0;

  outer.addEventListener('touchstart', e => {
    startX   = e.touches[0].clientX;
    startY   = e.touches[0].clientY;
    dragging = true;
    dx       = 0;
    const track = document.getElementById('photoCarouselTrack');
    if (track) track.style.transition = 'none';
  }, { passive: true });

  outer.addEventListener('touchmove', e => {
    if (!dragging) return;
    dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
    const track = document.getElementById('photoCarouselTrack');
    if (track) {
      const base = -_photoCarouselIdx * 100;
      const pct  = base + (dx / outer.offsetWidth) * 100;
      track.style.transform = `translateX(${pct}%)`;
    }
  }, { passive: true });

  outer.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const track = document.getElementById('photoCarouselTrack');
    if (track) track.style.transition = '';
    if (dx < -40) photoCarouselGoTo(_photoCarouselIdx + 1);
    else if (dx > 40) photoCarouselGoTo(_photoCarouselIdx - 1);
    else _applyCarouselTransform();
  });
}

// ─────────────────────────────────────────────
// フォトターンのプロンプト表示を更新（再推論後）
// ─────────────────────────────────────────────
function updatePhotoTurnPrompt(turnIdx, enPrompt) {
  const entry = document.querySelector(`.photo-prompt-entry[data-turn-idx="${turnIdx}"]`);
  if (!entry) return;
  const enEl = entry.querySelector('.photo-prompt-en');
  if (enEl) {
    enEl.textContent = enPrompt;
  } else if (enPrompt) {
    // EN表示がない場合は新たに追加
    const div = document.createElement('div');
    div.className = 'photo-prompt-en';
    div.textContent = enPrompt;
    entry.appendChild(div);
  }
}

// ─────────────────────────────────────────────
// フォトターンのプロンプト表示を更新
// ─────────────────────────────────────────────
function updatePhotoTurnPrompt(turnIdx, enPrompt) {
  const entry = document.querySelector(`.photo-prompt-entry[data-turn-idx="${turnIdx}"]`);
  if (!entry) return;
  let enEl = entry.querySelector('.photo-prompt-en');
  if (enPrompt) {
    if (enEl) {
      enEl.textContent = enPrompt;
    } else {
      // まだEN表示がない場合は追加
      enEl = document.createElement('div');
      enEl.className = 'photo-prompt-en';
      enEl.textContent = enPrompt;
      entry.appendChild(enEl);
    }
  }
}

// ─────────────────────────────────────────────
// カルーセル表示クリア（セッションのターンはそのまま）
// ─────────────────────────────────────────────
function clearPhotoCarousel() {
  _photoCarouselSlides = [];
  _photoCarouselIdx    = 0;
  renderPhotoCarousel();
}

// ─────────────────────────────────────────────
// フォトターンをチャットログに追加（軽量表示）
// ─────────────────────────────────────────────
function appendPhotoTurnToLog(turn, turnIdx) {
  const log = document.getElementById('chatLog');
  if (!log) return;

  // プロンプト入力表示（ユーザーの指示として）
  if (turn.user_message) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'photo-prompt-entry';
    msgDiv.dataset.turnIdx = turnIdx;
    const modeLabel = {
      direct:    '⚡ 直接',
      diff:      '🔄 差分',
      translate: '🌐 翻訳',
    }[turn.translate_mode] || '🌐 翻訳';
    msgDiv.innerHTML = `
      <div class="photo-prompt-label">${modeLabel}</div>
      <div class="photo-prompt-jp">${escHtml(turn.user_message)}</div>
      ${turn.en_prompt && !turn.is_direct ? `<div class="photo-prompt-en">${escHtml(turn.en_prompt)}</div>` : ''}
    `;
    log.appendChild(msgDiv);
  }

  // 生成画像（チャットログ内）
  if (turn.image_url) {
    appendImageToLogWithIndex(turn.image_url, turnIdx);
  }

  scrollLogToBottom();
}

// ─────────────────────────────────────────────
// フォトセッション読み込み時のカルーセル復元
// ─────────────────────────────────────────────
function restorePhotoCarousel(session) {
  _photoCarouselSlides = [];
  if (!session?.turns) return;
  session.turns.forEach((turn, idx) => {
    if (turn.image_url && turn.gen_mode === 'photo') {
      _photoCarouselSlides.push({ url: turn.image_url, turnIdx: idx });
    }
  });
  _photoCarouselIdx = Math.max(0, _photoCarouselSlides.length - 1);
  renderPhotoCarousel();
}

// ─────────────────────────────────────────────
// チャット→フォトモード変換
// ─────────────────────────────────────────────
async function convertToPhotoMode(charId, sessionId) {
  if (isGenerating) { showToast('生成中です'); return; }
  if (!confirm('このセッションをフォトモードに変換しますか？\n（元のセッションはそのまま残ります）')) return;

  try {
    // 変換元セッションをフルロード
    const src = await restGet(`sessions/${charId}/${sessionId}`);
    if (!src) { showToast('セッションの読み込みに失敗しました'); return; }

    // ターンを変換（char_messageを削ぎ、gen_mode:'photo'に変更）
    const photoTurns = src.turns
      .filter(t => t.en_prompt || t.image_url) // EN/画像がないターンは除外
      .map((t, idx) => ({
        turn_id:        idx + 1,
        jp_prompt:      t.jp_prompt      || null,
        en_prompt:      t.en_prompt      || null,
        image_url:      t.image_url      || null,
        char_message:   null,             // 削ぐ
        user_message:   t.user_message   || null,
        generated:      t.generated      ?? true,
        gen_mode:       'photo',
        translate_mode: t.translate_mode || 'translate',
        is_narrative:   false,
        gen_meta:       t.gen_meta       || null,
        created_at:     t.created_at     || new Date().toISOString(),
      }));

    // 新フォトセッションを作成
    const photoSession = {
      id:             'session_' + Date.now(),
      char_id:        charId,
      title:          (src.title || 'セッション') + ' [フォト]',
      mode:           'continuous',
      created_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
      archived:       false,
      turns:          photoTurns,
      converted_from: sessionId,
    };

    // サーバーに保存
    if (isRestEnabled()) {
      const res = await restPost(`sessions/${charId}`, photoSession);
      photoSession.id = res.id;
    }

    // アクティブセッションとしてロード
    activeSession = photoSession;
    clearChatLog();
    _photoCarouselSlides = [];
    _photoCarouselIdx    = 0;
    _photoTranslateMode  = 'translate';

    restorePhotoCarousel(photoSession);
    updatePhotoUI();
    setPhotoTranslateMode('translate');
    photoTurns.forEach((turn, idx) => appendPhotoTurnToLog(turn, idx));

    updateHeaderSession();
    closeModal('charOverlay');
    showToast(`📷 フォトモードに変換しました（${photoTurns.length}ターン）`);

  } catch(e) {
    showToast('変換失敗: ' + e.message.slice(0, 40));
    console.error('[Alcove] convertToPhotoMode error:', e);
  }
}

// ─────────────────────────────────────────────
// NOTE: submitTurn の振り分けは app.js で行う
// （chat.js の後に photo.js が読み込まれるため、
//   app.js の init 後に submitTurn をラップする）
// ─────────────────────────────────────────────
