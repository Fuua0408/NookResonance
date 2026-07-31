/* ═════════════════════════════════════════════
   NookResonance — affection.js
   親愛度システム（数値管理・ラベル変換・UI）
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────
const AFFECTION_DEFAULT = 130;
const AFFECTION_MIN     = 0;
const AFFECTION_MAX     = 255;

const AFFECTION_STAGES = [
  { min:   0, max:   5, label: '憎悪',        en: 'Hatred',       llm: '深く憎悪している',       llmEn: 'deeply hateful' },
  { min:   6, max:  36, label: '大嫌い',      en: 'Loathing',     llm: '深く嫌悪している',       llmEn: 'deeply disgusted' },
  { min:  37, max:  72, label: '嫌い',        en: 'Dislike',      llm: '苦手意識がある',         llmEn: 'uncomfortable' },
  { min:  73, max: 109, label: '苦手',        en: 'Uneasy',       llm: 'どちらかといえば苦手',   llmEn: 'somewhat uncomfortable' },
  { min: 110, max: 145, label: '普通',        en: 'Neutral',      llm: '普通の関係',             llmEn: 'neutral relationship' },
  { min: 146, max: 181, label: '好き',        en: 'Fond',         llm: '気の置けない友人',       llmEn: 'comfortable friends' },
  { min: 182, max: 218, label: 'とても好き',  en: 'Close',        llm: '深く信頼し合っている',   llmEn: 'deep mutual trust' },
  { min: 219, max: 249, label: '大好き',      en: 'Devoted',      llm: 'かけがえのない存在',     llmEn: 'irreplaceable' },
  { min: 250, max: 255, label: '愛',          en: 'Love',         llm: '唯一無二の存在として深く愛している', llmEn: 'deeply loved as one of a kind' },
];

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────
function getAffectionStage(value) {
  return AFFECTION_STAGES.find(s => value >= s.min && value <= s.max)
    || AFFECTION_STAGES[3]; // デフォルト「普通」
}
function affectionLabel(value) {
  const stage = getAffectionStage(value);
  return isEnglishMode() ? stage.en : stage.label;
}
function affectionLLMLabel(value) {
  const stage = getAffectionStage(value);
  return isEnglishMode() ? stage.llmEn : stage.llm;
}
function affectionStageLabel(stage) {
  return isEnglishMode() ? stage.en : stage.label;
}
function affectionStageLLMLabel(stage) {
  return isEnglishMode() ? stage.llmEn : stage.llm;
}
function clampAffection(value, cap) {
  const c = Number(cap);
  const resolvedCap = Number.isFinite(c)
    ? Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, Math.round(c)))
    : AFFECTION_MAX;
  return Math.max(AFFECTION_MIN, Math.min(resolvedCap, Math.round(value)));
}

// ─────────────────────────────────────────────
// グローバル設定アクセス
// ─────────────────────────────────────────────
function isAffectionEnabled() {
  return getSetting('affectionEnabled', true) !== false;
}
function isAffectionMutable() {
  return getSetting('affectionMutable', true) !== false;
}
function isAffectionForceEdit() {
  return getSetting('affectionForceEdit', false) === true;
}
function isAffectionPerTurn() {
  return getSetting('affectionPerTurn', false) === true;
}

// ─────────────────────────────────────────────
// キャラの親愛度を取得・設定
// ─────────────────────────────────────────────
function getCharAffection(char) {
  return char?.affection ?? AFFECTION_DEFAULT;
}
// キャラクター単位の親愛度キャップ（未設定なら無制限=AFFECTION_MAX）
function getCharAffectionCap(char) {
  const raw = char?.affection_cap;
  if (raw === undefined || raw === null || raw === '') return AFFECTION_MAX;
  const num = Number(raw);
  if (!Number.isFinite(num)) return AFFECTION_MAX;
  return Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, Math.round(num)));
}
// 表示・LLMプロンプト・ステージ判定に使う実効値（内部の生値はキャップを下げても消えない）
function getEffectiveAffection(char) {
  return Math.min(getCharAffection(char), getCharAffectionCap(char));
}
function setCharAffection(char, value) {
  char.affection = clampAffection(value, getCharAffectionCap(char));
}
function isCharAffectionEnabled(char) {
  if (!isAffectionEnabled()) return false;
  return char?.affection_enabled !== false;
}

// ─────────────────────────────────────────────
// 親愛度バーをレンダリング（汎用）
// ─────────────────────────────────────────────
function renderAffectionBar(containerId, value, showValue = false, cap = AFFECTION_MAX) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const pct   = ((value - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
  const stage = getAffectionStage(value);
  el.innerHTML = `
    <div class="affection-bar-wrap">
      <div class="affection-bar-bg">
        <div class="affection-bar-fill" style="width:${pct.toFixed(1)}%"></div>
        ${affectionCapMarkupHtml(cap)}
      </div>
      <div class="affection-label">${affectionStageLabel(stage)}</div>
      ${showValue ? `<div class="affection-value">${value}</div>` : ''}
    </div>
  `;
}

// バー上のキャップ位置（到達不能域）を示す区切りのHTMLを返す。
// キャップが無制限（AFFECTION_MAX）のときは何も描画しない。
function affectionCapMarkupHtml(cap) {
  if (cap === undefined || cap === null || cap >= AFFECTION_MAX) return '';
  const capPct = ((cap - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
  return `<div class="affection-bar-cap" style="left:${capPct.toFixed(1)}%;width:${(100 - capPct).toFixed(1)}%"></div>`;
}

// ─────────────────────────────────────────────
// キャラ編集モーダル：親愛度セクション描画
// ─────────────────────────────────────────────
// 編集中の元の生値・キャップを保持（入力プレビュー用）
let _affectionEditCtx = { rawValue: AFFECTION_DEFAULT, cap: AFFECTION_MAX };

function renderAffectionSection(char) {
  const sec = document.getElementById('affectionSection');
  if (!sec) return;

  const enabled     = isAffectionEnabled();
  const charEnabled = char?.affection_enabled !== false;
  const forceEdit   = isAffectionForceEdit();
  const rawValue    = getCharAffection(char);
  const cap         = getCharAffectionCap(char);
  const value       = Math.min(rawValue, cap); // 実効値（表示・ステージ判定用）
  const stage       = getAffectionStage(value);
  const pct         = ((value - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;

  _affectionEditCtx = { rawValue, cap };

  // 初対面フラグセクションの表示制御（親愛度が有効なときのみ表示）
  const fmSec = document.getElementById('firstMeetingSection');
  if (fmSec) fmSec.style.display = (enabled && charEnabled) ? '' : 'none';

  sec.innerHTML = `
    <div class="sep"></div>
    <div class="section-label">${t('aff.title', '親愛度')}</div>
    <div class="field-group">
      ${!enabled ? `<div style="font-size:12px;color:var(--text-pale);">${t('aff.disabled_global', '※ グローバル設定で無効化されています')}</div>` : ''}
      <div class="num-row">
        <div class="num-label" style="font-size:13px;">${t('aff.use_for_character', 'このキャラクターで使用する')}</div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="editAffectionEnabled"
            style="accent-color:var(--accent);width:18px;height:18px;"
            ${charEnabled ? 'checked' : ''}
            ${!enabled ? 'disabled' : ''}
            onchange="onAffectionEnabledChange(this.checked, ${value})">
        </label>
      </div>
      <div id="affectionDetail" style="${!charEnabled || !enabled ? 'display:none;' : ''}">
        <div class="affection-bar-wrap" style="margin:8px 0 4px;">
          <div class="affection-bar-bg">
            <div class="affection-bar-fill" id="editAffectionFill" style="width:${pct.toFixed(1)}%"></div>
            ${affectionCapMarkupHtml(cap)}
          </div>
          <div class="affection-label" id="editAffectionLabel">${affectionStageLabel(stage)}</div>
          ${forceEdit ? `<div class="affection-value" id="editAffectionValueDisplay">${rawValue}</div>` : ''}
        </div>
        ${forceEdit ? `
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
          <input class="f-input" id="editAffectionInput" type="number"
            min="${AFFECTION_MIN}" max="${AFFECTION_MAX}" value="${rawValue}"
            style="max-width:80px;font-family:monospace;"
            oninput="onAffectionInputChange(parseInt(this.value)||0)">
          <span style="font-size:11px;color:var(--text-pale);">0〜255</span>
        </div>` : ''}
        <div class="num-row" style="margin-top:8px;">
          <div class="num-label" style="font-size:13px;">${t('aff.cap', '親愛度キャップ')}</div>
          <input class="f-input" id="editAffectionCap" type="number"
            min="${AFFECTION_MIN}" max="${AFFECTION_MAX}" value="${cap}"
            style="max-width:80px;font-family:monospace;"
            oninput="onAffectionCapInputChange(parseInt(this.value)||0)">
        </div>
        <div style="font-size:11px;color:var(--text-pale);margin-top:2px;">
          ${t('aff.cap_note', 'この値を超えて親愛度は上昇しません（255＝無制限）')}
        </div>
        <div style="font-size:11px;color:var(--text-pale);margin-top:4px;">
          ${t('aff.current_relationship', '現在の関係性：')}${affectionStageLLMLabel(stage)}
        </div>
      </div>
    </div>
  `;
}

function onAffectionEnabledChange(checked, currentValue) {
  const detail = document.getElementById('affectionDetail');
  if (detail) detail.style.display = checked ? '' : 'none';
}

function onAffectionInputChange(value) {
  const cap     = _affectionEditCtx.cap;
  const clamped = clampAffection(value, cap);
  const stage   = getAffectionStage(clamped);
  const pct     = ((clamped - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
  const fill    = document.getElementById('editAffectionFill');
  const label   = document.getElementById('editAffectionLabel');
  const display = document.getElementById('editAffectionValueDisplay');
  if (fill)    fill.style.width   = pct.toFixed(1) + '%';
  if (label)   label.textContent  = affectionStageLabel(stage);
  if (display) display.textContent = clamped;
}

function onAffectionCapInputChange(capValue) {
  const cap = Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, isNaN(capValue) ? AFFECTION_MAX : capValue));
  _affectionEditCtx.cap = cap;

  const rawValue  = _affectionEditCtx.rawValue;
  const effective = Math.min(rawValue, cap);
  const stage     = getAffectionStage(effective);
  const pct       = ((effective - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;

  const fill  = document.getElementById('editAffectionFill');
  const label = document.getElementById('editAffectionLabel');
  const bg    = fill?.parentElement;
  if (fill)  fill.style.width  = pct.toFixed(1) + '%';
  if (label) label.textContent = affectionStageLabel(stage);

  if (bg) {
    let capMark = document.getElementById('editAffectionCapMark');
    if (cap < AFFECTION_MAX) {
      const capPct = ((cap - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
      if (!capMark) {
        capMark = document.createElement('div');
        capMark.id = 'editAffectionCapMark';
        capMark.className = 'affection-bar-cap';
        bg.appendChild(capMark);
      }
      capMark.style.left  = capPct.toFixed(1) + '%';
      capMark.style.width = (100 - capPct).toFixed(1) + '%';
    } else if (capMark) {
      capMark.remove();
    }
  }
}

// ─────────────────────────────────────────────
// キャラ編集モーダルから親愛度フィールドを収集
// ─────────────────────────────────────────────
function collectAffectionFromUI(existing) {
  if (!isAffectionEnabled()) return {};
  const enabled = document.getElementById('editAffectionEnabled')?.checked ?? false;
  const forceEdit = isAffectionForceEdit();
  let value = existing?.affection ?? AFFECTION_DEFAULT;

  let cap = getCharAffectionCap(existing);
  const capInput = document.getElementById('editAffectionCap');
  if (capInput) {
    const parsedCap = parseInt(capInput.value);
    if (!isNaN(parsedCap)) {
      cap = Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, parsedCap));
    }
  }

  if (forceEdit) {
    const input = document.getElementById('editAffectionInput');
    if (input) {
      const parsed = parseInt(input.value);
      // 入力欄が実際に変更された場合のみクランプして反映する。
      // 触れていなければ生値をそのまま保持し、キャップだけを下げても
      // 保存操作で内部値が切り下げられないようにする。
      if (!isNaN(parsed) && parsed !== value) {
        value = clampAffection(parsed, cap);
      }
    }
  }
  return {
    affection_enabled: enabled,
    affection:         value,
    affection_cap:     cap,
    is_first_meeting:  existing?.is_first_meeting ?? true,
    memory_notes:      existing?.memory_notes     ?? [],
    last_state:        existing?.last_state        ?? { appearance: '', location: '' },
  };
}

// ─────────────────────────────────────────────
// セッションパネル：親愛度増減UI
// ─────────────────────────────────────────────
function renderSessionAffectionCtrl(containerEl) {
  if (!activeChar || !isCharAffectionEnabled(activeChar)) return;
  if (!isAffectionMutable()) return;

  const cap   = getCharAffectionCap(activeChar);
  const value = getEffectiveAffection(activeChar);
  const pct   = ((value - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
  const stage = getAffectionStage(value);

  const div = document.createElement('div');
  div.className = 'field-group';
  div.style.margin = '8px 0';
  div.innerHTML = `
    <div class="section-label" style="margin-bottom:6px;">${t('aff.title', '親愛度')}</div>
    <div class="affection-bar-wrap">
      <div class="affection-bar-bg">
        <div class="affection-bar-fill" id="sessionAffectionFill" style="width:${pct.toFixed(1)}%"></div>
        ${affectionCapMarkupHtml(cap)}
      </div>
      <div class="affection-label" id="sessionAffectionLabel">${affectionStageLabel(stage)}</div>
    </div>
    <div class="affection-ctrl">
      <div class="affection-btn" onclick="changeSessionAffection(-10)" title="-10">－－</div>
      <div class="affection-btn" onclick="changeSessionAffection(-1)"  title="-1">－</div>
      <div style="flex:1;text-align:center;font-size:12px;color:var(--text-pale);" id="sessionAffectionVal">${value}</div>
      <div class="affection-btn" onclick="changeSessionAffection(+1)"  title="+1">＋</div>
      <div class="affection-btn" onclick="changeSessionAffection(+10)" title="+10">＋＋</div>
    </div>
  `;
  containerEl.appendChild(div);
}

async function changeSessionAffection(delta) {
  if (!activeChar) return;
  const cap    = getCharAffectionCap(activeChar);
  const newVal = clampAffection(getCharAffection(activeChar) + delta, cap);
  setCharAffection(activeChar, newVal);

  // UI更新（実効値＝newValはすでにキャップ以下）
  const effective = getEffectiveAffection(activeChar);
  const pct   = ((effective - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
  const stage = getAffectionStage(effective);
  const fill  = document.getElementById('sessionAffectionFill');
  const label = document.getElementById('sessionAffectionLabel');
  const val   = document.getElementById('sessionAffectionVal');
  if (fill)  fill.style.width   = pct.toFixed(1) + '%';
  if (label) label.textContent  = affectionStageLabel(stage);
  if (val)   val.textContent    = effective;

  // サーバー保存
  if (isRestEnabled()) {
    try {
      await restPut(`characters/${activeChar.id}`, activeChar);
    } catch(e) {
      console.warn('[NookResonance] affection save failed:', e.message);
    }
  }
}

// ─────────────────────────────────────────────
// 現在のセッションから親愛度をクイック更新
// ─────────────────────────────────────────────
async function quickAffectionUpdate() {
  if (!activeChar || !activeSession) {
    showToast(t('session.selected_required', 'セッションを選択してください')); return;
  }
  if (!isCharAffectionEnabled(activeChar)) {
    showToast(t('handover.affection_disabled', 'このキャラクターの親愛度が無効です')); return;
  }
  if (isAffectionPerTurn()) {
    alert(t('aff.manual_disabled', 'ターンごと自動計算が有効なため、手動計算は利用できません'));
    return;
  }
  if (!activeSession.turns?.length) {
    showToast(t('turn.none', 'ターンがありません')); return;
  }

  updateStatusBadge(t('aff.analyzing', '親愛度を分析中…'));

  try {
    const char       = activeChar;
    const turns      = activeSession.turns;
    const cap        = getCharAffectionCap(char);
    const affValue   = getCharAffection(char);
    const effValue   = Math.min(affValue, cap);
    const stageLabel = affectionLabel(effValue);
    const llmLabel   = affectionLLMLabel(effValue);

    // セッション内容をテキスト化
    const sessionText = turns.slice(-10).map(t => {
      const parts = [];
      if (t.user_message) parts.push(`ユーザー: ${t.user_message}`);
      if (t.char_message)  parts.push(`${char.name}: ${t.char_message}`);
      return parts.join('\n');
    }).filter(Boolean).join('\n\n');

    if (!sessionText) { showToast(t('aff.no_conversation', '会話内容がありません')); updateStatusBadge('SYNC'); return; }

    // Step1: セッション要約
    updateStatusBadge(t('aff.reading', '会話を読んでいます…'));
    const summary = await getChatCompletion([
      { role: 'system', content: `あなたはキャラクターとの会話を分析するアシスタントです。\nキャラクター: ${char.name}\n現在の親愛度: ${stageLabel}（${llmLabel}）\n\n会話内容を2〜3文で簡潔に要約してください。` },
      { role: 'user',   content: sessionText },
    ]);

    // Step2: 親愛度の増減値
    updateStatusBadge(t('aff.calculating', '親愛度を計算しています…'));
    const deltaRaw = await getChatCompletion([
      { role: 'system', content: `あなたはデータ抽出アシスタントです。会話の要約を読んで、${char.name}との親愛度の増減値を整数1つだけ返してください。範囲: -20〜+20。変化なしは0。数値のみ。` },
      { role: 'user',   content: `要約: ${cleanLLMResponse(summary)}\n\n増減値:` },
    ]);

    const delta   = Math.max(-20, Math.min(20, parseInt(cleanLLMResponse(deltaRaw).replace(/[^-\d]/g, '')) || 0));
    const newVal  = clampAffection(affValue + delta, cap);
    const newStage = affectionLabel(newVal);

    // 確認トースト → 適用
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    const msg  = delta === 0
      ? `${t('aff.no_change', '親愛度に変化なし')} (${stageLabel})`
      : `${t('aff.change', '親愛度: ')}${stageLabel} → ${newStage} (${sign})`;

    if (delta !== 0) {
      if (!confirm(`${msg}\n\n${t('aff.apply_confirm', '適用しますか？')}`)) {
        showToast(t('cancelled', 'キャンセルしました'));
        return;
      }
      char.affection = newVal;
      if (isRestEnabled()) {
        restPut(`characters/${char.id}`, char)
          .catch(e => console.warn('[NookResonance] quickAffection save failed:', e.message));
      }
      showToast(`✓ ${msg}`);
    } else {
      showToast(msg);
    }

  } catch(e) {
    showToast('❌ ' + e.message.slice(0, 50));
    console.error('[NookResonance] quickAffectionUpdate error:', e);
  } finally {
    updateStatusBadge('SYNC');
  }
}

// ─────────────────────────────────────────────
// ターンごと親愛度バックグラウンド計算
// チャット応答後にawaitせず呼ぶ（通知なし）
// ─────────────────────────────────────────────
async function perTurnAffectionUpdate(turn) {
  if (!activeChar || !isCharAffectionEnabled(activeChar)) return;
  if (!isAffectionPerTurn()) return;

  const char      = activeChar;
  const cap       = getCharAffectionCap(char);
  const affValue  = getCharAffection(char);
  const effValue  = Math.min(affValue, cap);
  const stageLabel = affectionLabel(effValue);
  const llmLabel   = affectionLLMLabel(effValue);

  const turnText = [
    turn.user_message ? `ユーザー: ${turn.user_message}` : '',
    turn.char_message  ? `${char.name}: ${turn.char_message}` : '',
  ].filter(Boolean).join('\n');

  if (!turnText) return;

  try {
    const deltaRaw = await getChatCompletion([
      {
        role: 'system',
        content: `あなたはキャラクターとの関係性を分析するアシスタントです。
キャラクター: ${char.name}
現在の親愛度: ${stageLabel}（${llmLabel}）

1ターンの会話を読んで、親愛度の増減値を整数1つだけ返してください。
範囲: -5〜+5。変化なしは0。数値のみ返してください。`,
      },
      { role: 'user', content: turnText },
    ], { noThink: true });

    const delta  = Math.max(-5, Math.min(5, parseInt(cleanLLMResponse(deltaRaw).replace(/[^-\d]/g, '')) || 0));
    if (delta === 0) return;

    char.affection = clampAffection(affValue + delta, cap);

    // バーをサイレント更新（実効値＝char.affectionはすでにキャップ以下）
    const effective = char.affection;
    const pct   = ((effective - AFFECTION_MIN) / (AFFECTION_MAX - AFFECTION_MIN)) * 100;
    const stage = getAffectionStage(effective);
    ['sessionAffectionFill', 'editAffectionFill'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.width = pct.toFixed(1) + '%';
    });
    ['sessionAffectionLabel', 'editAffectionLabel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = affectionStageLabel(stage);
    });
    const valEl = document.getElementById('sessionAffectionVal');
    if (valEl) valEl.textContent = effective;

    // サーバー保存（silent）
    if (isRestEnabled()) {
      restPut(`characters/${char.id}`, char)
        .catch(e => console.warn('[NookResonance] perTurnAffection save failed:', e.message));
    }
  } catch(e) {
    console.warn('[NookResonance] perTurnAffectionUpdate error:', e.message);
  }
}

// ─────────────────────────────────────────────
// 設定モーダル：グローバル親愛度設定の初期化
// ─────────────────────────────────────────────
function initAffectionSettings() {
  const enabled    = document.getElementById('affectionGlobalEnabled');
  const mutable    = document.getElementById('affectionGlobalMutable');
  const forceEdit  = document.getElementById('affectionForceEdit');
  const perTurn    = document.getElementById('affectionPerTurn');
  if (enabled)   enabled.checked   = isAffectionEnabled();
  if (mutable)   mutable.checked   = isAffectionMutable();
  if (forceEdit) forceEdit.checked = isAffectionForceEdit();
  if (perTurn)   perTurn.checked   = isAffectionPerTurn();
}

function saveAffectionSettings() {
  saveSettings({
    affectionEnabled:   document.getElementById('affectionGlobalEnabled')?.checked  ?? true,
    affectionMutable:   document.getElementById('affectionGlobalMutable')?.checked  ?? true,
    affectionForceEdit: document.getElementById('affectionForceEdit')?.checked      ?? false,
    affectionPerTurn:   document.getElementById('affectionPerTurn')?.checked        ?? false,
  });
}
