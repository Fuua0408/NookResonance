/* ═════════════════════════════════════════════
   Alcove — app.js
   グローバル変数・ユーティリティ・初期化
   ═════════════════════════════════════════════ */

'use strict';

/* ═════════════════════════════════════════════
   ComfyDeck Nook — script.js
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────
const LS_KEY = 'alcove_settings';

// ─────────────────────────────────────────────
// グローバル状態
// ─────────────────────────────────────────────
let activeChar    = null;
let activeSession = null;
let isGenerating  = false;
let ws            = null;
let genMode_      = 'normal'; // 'normal' | 'char'

// UI状態
let _ctxMenu          = null;
let _anchorSelectMode = false;
let _batchCancelled   = false;
let _toastTimer       = null;

// ライトボックス
let _lbScale = 1, _lbX = 0, _lbY = 0, _lbLastTap = 0;
let _lbPinchDist = null, _lbPinchScale = 1, _lbPanStart = null, _lbPanOrigin = null;

// キャラ・LoRA・WFキャッシュ
let _loraNames       = [];
let _loraList        = [];
let _editingIconData = null;
let _customWfs       = [];

// ─────────────────────────────────────────────
// ビルトインワークフロー
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 設定読み書き
// ─────────────────────────────────────────────



// ─────────────────────────────────────────────
// フィールドユーティリティ
// ─────────────────────────────────────────────




// ─────────────────────────────────────────────
// UI初期化
// ─────────────────────────────────────────────



// ─────────────────────────────────────────────
// REST API連携
// ─────────────────────────────────────────────











// ─────────────────────────────────────────────
// LLM呼び出し
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// 翻訳（JP → EN）
// キャラ外見キャッシュEN + シーンEN
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Vision → キャラRP返答
// ─────────────────────────────────────────────
// キャラ主導モード専用の翻訳
// ユーザーの指示 + キャラの返信を両方考慮して1シーンに融合






// ─────────────────────────────────────────────
// ワークフロー構築
// ─────────────────────────────────────────────



// ─────────────────────────────────────────────
// ComfyUI 画像生成
// ─────────────────────────────────────────────




// ─────────────────────────────────────────────
// 地の文（ナレーション）判定
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// 汎用ユーティリティ
// ─────────────────────────────────────────────
function _nl2br(str) { return escHtml(str || '').split('\n').join('<br>'); }


function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// UI制御・初期化
// ─────────────────────────────────────────────
function setBtnState(on) {
  const btn = document.getElementById('btnSend');
  const inp = document.getElementById('jpInput');
  if (btn) {
    btn.disabled    = on;
    btn.textContent = on ? '⏳' : t('chat.send', '送信 ▶');
  }
  if (inp) {
    if (on) {
      inp.disabled = true;
      // 入力欄はクリアしない（応答が返ってから chat.js でクリア）
    } else {
      inp.disabled = false;
      inp.focus();
    }
  }
}
function updateStatusBadge(msg) {
  const el = document.getElementById('syncBadge');
  if (el) el.textContent = msg || 'SYNC';
}
function setGenMode(mode) {
  genMode_ = mode;
  document.getElementById('modeBtnNormal')?.classList.toggle('active', mode === 'normal');
  document.getElementById('modeBtnChar')?.classList.toggle('active', mode === 'char');
}
function toggleGenMode() {
  const on  = document.getElementById('genToggle')?.checked;
  const inp = document.getElementById('jpInput');
  const modeToggle      = document.getElementById('genModeToggle');
  const charLeadToggle  = document.getElementById('charLeadToggleWrap');
  const userFocusToggle = document.getElementById('userFocusToggleWrap');
  if (inp) {
    inp.placeholder = on
      ? t('chat.placeholder', 'プロンプトを入力…')
      : (isEnglishMode()
        ? `Talk to ${activeChar?.name || 'character'}...`
        : `${activeChar?.name || 'キャラ'}に話しかける…`);
  }
  if (modeToggle)      modeToggle.style.display      = on ? '' : 'none';
  if (charLeadToggle)  charLeadToggle.style.display  = '';
  if (userFocusToggle) userFocusToggle.style.display = '';
}
// スマホ判定（タッチデバイスはEnterで改行、PCはEnterで送信）
// HTTP環境でも動作するクリップボードコピー
function copyToClipboard(text) {
  // HTTPS環境ではClipboard APIを使用
  if (navigator.clipboard && location.protocol === 'https:') {
    return navigator.clipboard.writeText(text)
      .then(() => showToast(t('copied', '✓ コピーしました')))
      .catch(() => showToast(t('copy_failed', '❌ コピーに失敗しました')));
  }
  // HTTP環境: textarea + execCommand
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showToast(t('copied', '✓ コピーしました'));
  } catch(e) {
    showToast(t('copy_failed', '❌ コピーに失敗しました'));
  }
  document.body.removeChild(ta);
}
function isTouchDevice() {
  return navigator.maxTouchPoints > 0;
}
function handleJpInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice()) {
    e.preventDefault();
    submitTurn();
  }
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}
function changeNum(id, delta) {
  const el  = document.getElementById(id);
  if (!el) return;
  const min = id === 'sessionLimit' ? 1 : id === 'llmHistoryTurns' ? 0 : 10;
  const max = id === 'sessionLimit' ? 20 : id === 'llmHistoryTurns' ? 200 : 200;
  el.textContent = Math.max(min, Math.min(max, parseInt(el.textContent) + delta));
}
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// mousedownの開始位置がoverlay本体の場合のみ閉じる（ドラッグ誤爆防止）
let _overlayMouseDownTarget = null;
document.addEventListener('mousedown', e => { _overlayMouseDownTarget = e.target; });

function overlayClick(e, id) {
  const overlay = document.getElementById(id);
  if (e.target === overlay && _overlayMouseDownTarget === overlay) closeModal(id);
}
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
let _initStarted = false;
async function init() {
  if (_initStarted) return;
  _initStarted = true;
  applyI18n();
  initSettingsUI();
  renderWfSelect();

  if (isRestEnabled()) {
    updateStatusBadge(t('loading', '読み込み中…'));
    // 設定を復元（LLMエンドポイント等をサーバーから取得）
    try {
      const s = await restGet('settings');
      const { restUrl, restApiKey, ...rest } = s;
      saveSettings(rest);
      initSettingsUI(); // 復元した設定をUIに反映
      applyI18n();
    } catch(e) {
      console.warn('[Alcove] settings restore failed:', e.message);
    }

    // キャラクター一覧・カスタムWFを取得
    await Promise.all([
      fetchCharsFromServer(),
      fetchCustomWfsFromServer(),
    ]);
    updateStatusBadge('SYNC');
  }

  renderCharList();

  // 最後に選択したキャラを復元
  const lastCharId = getSetting('lastCharId', '');
  if (lastCharId) {
    const char = loadChars().find(c => c.id === lastCharId);
    if (char) selectChar(char);
  }
}

// submitTurn — フォトモード / チャットモード振り分け
function submitTurn() {
  if (typeof isPhotoMode === 'function' && isPhotoMode()) {
    submitPhotoTurn();
  } else {
    _chatSubmitTurnOrig();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initScrollTracking();
  if (typeof initPhotoCarouselSwipe === 'function') initPhotoCarouselSwipe();
});
