'use strict';
/* ═════════════════════════════════════════════
   NookResonance — wizard.js
   キャラクター作成ウィザード
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 状態管理
// ─────────────────────────────────────────────
let _wiz = {
  step: 0,
  gender: '',
  personality: '',
  appearanceBody: '',
  appearanceClothing: '',
  appearanceBodyEN: '',
  appearanceClothingEN: '',
  location: '',
  name: '',
  savedCharId: null,
  generatedImageUrl: null,
};

function wizardReset() {
  _wiz = {
    step: 0, gender: '', personality: '',
    appearanceBody: '', appearanceClothing: '',
    appearanceBodyEN: '', appearanceClothingEN: '',
    location: '', name: '', savedCharId: null,
    generatedImageUrl: null,
  };
}

// ─────────────────────────────────────────────
// バブル生成
// ─────────────────────────────────────────────
function wizardBubbleChar(text) {
  return `
    <div style="display:flex; align-items:flex-end; gap:8px;">
      <div style="font-size:24px;">🧙</div>
      <div style="
        background:var(--bg-card);
        border-radius:0 12px 12px 12px;
        padding:10px 14px;
        max-width:80%;
        font-size:14px;
        line-height:1.6;
        color:var(--text);
      ">${escHtml(text)}</div>
    </div>`;
}

function wizardBubbleUser(text) {
  return `
    <div style="display:flex; justify-content:flex-end;">
      <div style="
        background:var(--accent);
        border-radius:12px 0 12px 12px;
        padding:10px 14px;
        max-width:80%;
        font-size:14px;
        line-height:1.6;
        color:#fff;
      ">${escHtml(text)}</div>
    </div>`;
}

function wizardAddBubble(html) {
  const log = document.getElementById('wizardChatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.innerHTML = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ─────────────────────────────────────────────
// LLM ヘルパー
// ─────────────────────────────────────────────
function wizardLangInstruction() {
  return getCurrentLanguage() === 'ja' ? 'Respond in Japanese.' : 'Respond in English.';
}

async function wizardLLMCall(messages) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await getChatCompletion(messages, { noThink: true });
      if (isAbnormalRaw(raw)) throw new Error('ABNORMAL_OUTPUT');
      const cleaned = cleanLLMResponse(raw);
      if (isAbnormalOutput(cleaned)) {
        if (getCurrentLanguage() === 'ja') {
          const extracted = await extractJapaneseResponse(raw);
          if (extracted && !isAbnormalOutput(extracted)) return extracted;
        }
        throw new Error('ABNORMAL_OUTPUT');
      }
      return cleaned;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
}

// ─────────────────────────────────────────────
// UI コントロール
// ─────────────────────────────────────────────
function wizardSetInputMode(mode) {
  const genderBtns = document.getElementById('wizardGenderButtons');
  const textInput  = document.getElementById('wizardTextInput');
  if (genderBtns) genderBtns.style.display = mode === 'gender' ? 'flex' : 'none';
  if (textInput)  textInput.style.display  = mode === 'text'   ? 'flex' : 'none';
}

function wizardSetBusy(busy) {
  document.querySelectorAll('#wizardInputArea button').forEach(b => { b.disabled = busy; });
  const inp = document.getElementById('wizardInput');
  if (inp) inp.disabled = busy;
}

function wizardClearInput() {
  const inp = document.getElementById('wizardInput');
  if (inp) inp.value = '';
}

// ─────────────────────────────────────────────
// 開始・終了
// ─────────────────────────────────────────────
function openCharWizard() {
  wizardReset();
  const log = document.getElementById('wizardChatLog');
  if (log) log.innerHTML = '';
  wizardSetInputMode('none');
  openModal('wizardOverlay');
  setTimeout(_wizardStart, 300);
}

function closeCharWizard() {
  closeModal('wizardOverlay');
  wizardReset();
}

// ─────────────────────────────────────────────
// ステップ開始（イントロ + 性別ボタン）
// ─────────────────────────────────────────────
async function _wizardStart() {
  const intro = t('wizard.intro',
    '…ねえ、聞こえる？\nまだ形のない私に、命を吹き込んでくれるの？\nまず教えて…私って、女の子？それとも男の子？');
  wizardAddBubble(wizardBubbleChar(intro));
  _wiz.step = 1;
  wizardSetInputMode('gender');
}

// ─────────────────────────────────────────────
// ステップ 1: 性別選択
// ─────────────────────────────────────────────
async function wizardSelectGender(gender) {
  if (_wiz.step !== 1) return;
  _wiz.step = 2;
  _wiz.gender = gender;
  _wiz.appearanceBody = gender;
  wizardAddBubble(wizardBubbleUser(gender));
  wizardSetInputMode('none');
  wizardSetBusy(true);
  await _wizardAskStep(2);
  wizardSetBusy(false);
}

// ─────────────────────────────────────────────
// ステップ 2〜6: LLMで質問文を生成
// ─────────────────────────────────────────────
const _WIZ_TOPICS = {
  2: 'personality and character traits',
  3: 'age',
  4: 'physical appearance (hair, eyes, body type)',
  5: 'clothing and outfit style',
  6: 'usual location or setting the character inhabits',
};
const _WIZ_EXTRACT = {
  2: 'personality and character traits',
  3: 'age',
  4: 'physical appearance features',
  5: 'clothing and outfit description',
  6: 'location or setting',
};

const _WIZ_ACK_TOPICS = {
  3: 'personality',
  4: 'age',
  5: 'physical appearance',
  6: 'clothing style',
};

async function _wizardAskStep(step) {
  const ackTopic = _WIZ_ACK_TOPICS[step];
  const profileLines = [
    `- Gender: ${_wiz.gender}`,
    _wiz.personality      ? `- Personality: ${_wiz.personality}` : '',
    _wiz.appearanceBody   ? `- Appearance: ${_wiz.appearanceBody}` : '',
    _wiz.appearanceClothing ? `- Clothing: ${_wiz.appearanceClothing}` : '',
  ].filter(Boolean).join('\n');

  try {
    const question = await wizardLLMCall([
      {
        role: 'system',
        content: `You are a fictional character in the process of being born. You are not yet fully formed — you speak directly to the user who is bringing you to life, asking them to define who you are.

What you know about yourself so far:
${profileLines}

Speak as yourself (the character) in first person. Ask the user about your own "${_WIZ_TOPICS[step]}" with genuine curiosity and longing.
${ackTopic ? `Naturally reflect on what you just learned about yourself (your "${ackTopic}") before asking — as if you're slowly discovering yourself.` : ''}

Rules:
- First-person speech only (e.g. "私って…", "ねえ、教えて", "私の○○は…")
- Warm, wondering tone that matches your gender${_wiz.personality ? ' and personality' : ''}
- Total: 2-3 sentences
- Output only the character's words. No explanation, no labels.
${wizardLangInstruction()}`,
      },
      { role: 'user', content: 'Continue.' },
    ]);
    wizardAddBubble(wizardBubbleChar(question));
  } catch (e) {
    wizardAddBubble(wizardBubbleChar(
      t('wizard.llm_error', '少し待ってから、もう一度入力してみてください。')));
    showToast(t('error', 'エラー') + ': ' + e.message.slice(0, 40));
  }
  wizardSetInputMode('text');
  const inp = document.getElementById('wizardInput');
  if (inp) { inp.placeholder = '...'; inp.focus(); }
}

// ─────────────────────────────────────────────
// テキスト入力ハンドラ
// ─────────────────────────────────────────────
function wizardHandleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    wizardSubmit();
  }
}

async function wizardSubmit() {
  const inp = document.getElementById('wizardInput');
  const userInput = inp?.value?.trim() || '';
  if (!userInput) return;

  if (_wiz.step >= 2 && _wiz.step <= 6) {
    await _wizardHandleTextStep(userInput);
  } else if (_wiz.step === 8) {
    await _wizardFinalizeName(userInput);
  }
}

// ─────────────────────────────────────────────
// ステップ 2〜6: ユーザー入力の処理
// ─────────────────────────────────────────────
async function _wizardHandleTextStep(userInput) {
  const step = _wiz.step;
  wizardAddBubble(wizardBubbleUser(userInput));
  wizardClearInput();
  wizardSetInputMode('none');
  wizardSetBusy(true);

  // LLM で要約抽出
  let summary = '';
  try {
    summary = await wizardLLMCall([
      {
        role: 'system',
        content: `You are a data extraction assistant.
Extract "${_WIZ_EXTRACT[step]}" from the user's answer and summarize it in 20 characters or less.
If the information cannot be determined, return an empty string.
Output only the summary. No explanation.
${wizardLangInstruction()}`,
      },
      { role: 'user', content: userInput },
    ]);
  } catch (e) {
    showToast(t('error', 'エラー') + ': ' + e.message.slice(0, 40));
    wizardSetBusy(false);
    await _wizardAskStep(step);
    return;
  }

  if (!summary || !summary.trim()) {
    wizardAddBubble(wizardBubbleChar(
      t('wizard.retry_prompt', 'うまく受け取れませんでした。もう少し詳しく教えてください。')));
    wizardSetBusy(false);
    wizardSetInputMode('text');
    return;
  }

  // 状態に反映
  const sep = getCurrentLanguage() === 'ja' ? '、' : ', ';
  if (step === 2) {
    _wiz.personality = summary;
  } else if (step === 3) {
    _wiz.appearanceBody += sep + summary;
  } else if (step === 4) {
    _wiz.appearanceBody += sep + summary;
    // Step 4 完了後に appearanceBody を自然な文に再構成
    try {
      const reconstructed = await wizardLLMCall([
        {
          role: 'system',
          content: `You are a character description writer.
Combine the following fragments into a natural 1-2 sentence description of the character's physical appearance.
Output only the description. No explanation.
${wizardLangInstruction()}`,
        },
        { role: 'user', content: _wiz.appearanceBody },
      ]);
      _wiz.appearanceBody = reconstructed;
    } catch (e) {
      console.warn('[Wizard] appearanceBody reconstruct failed:', e.message);
    }
  } else if (step === 5) {
    _wiz.appearanceClothing = summary;
  } else if (step === 6) {
    _wiz.location = summary;
    const locSep = getCurrentLanguage() === 'ja' ? '。場所・状況：' : '. Location: ';
    _wiz.personality += locSep + summary;
  }

  _wiz.step = step + 1;
  wizardSetBusy(false);

  if (_wiz.step === 7) {
    await _wizardStep7();
  } else {
    await _wizardAskStep(_wiz.step);
  }
}

// ─────────────────────────────────────────────
// ステップ 7: 英訳 → 仮保存 → 画像生成
// ─────────────────────────────────────────────
async function _wizardStep7() {
  wizardSetInputMode('none');
  wizardSetBusy(true);
  wizardAddBubble(wizardBubbleChar(
    t('wizard.processing', '少しだけ待っていてね…もうすぐ私の姿が見えてくるかも。')));

  // 身体特徴・服装を英訳
  let bodyEN = '', clothingEN = '';
  try {
    const bodyRaw = await getChatCompletion([
      {
        role: 'system',
        content: 'Translate the following Japanese character physical appearance description into English tags suitable for image generation. Focus on hair, eyes, body type, skin, and other permanent physical features. Output only comma-separated English tags, nothing else.',
      },
      { role: 'user', content: _wiz.appearanceBody },
    ], { noThink: true });
    bodyEN = cleanLLMResponse(bodyRaw);
  } catch (e) {
    console.warn('[Wizard] body EN translation failed:', e.message);
  }
  try {
    const clothingRaw = await getChatCompletion([
      {
        role: 'system',
        content: 'Translate the following Japanese character clothing/outfit description into English tags suitable for image generation. Focus on clothing, accessories, and style. Output only comma-separated English tags, nothing else.',
      },
      { role: 'user', content: _wiz.appearanceClothing },
    ], { noThink: true });
    clothingEN = cleanLLMResponse(clothingRaw);
  } catch (e) {
    console.warn('[Wizard] clothing EN translation failed:', e.message);
  }
  _wiz.appearanceBodyEN = bodyEN;
  _wiz.appearanceClothingEN = clothingEN;

  // キャラを仮名で保存（IDを取得）
  try {
    const res = await restPost('characters', {
      name:                   t('wizard.new_char_name', '新しいキャラクター'),
      personality:            _wiz.personality,
      appearance:             _wiz.appearanceBody,
      appearance_body:        _wiz.appearanceBody,
      appearance_clothing:    _wiz.appearanceClothing,
      appearance_en:          bodyEN,
      appearance_body_en:     bodyEN,
      appearance_clothing_en: clothingEN,
      icon_emoji:             '💬',
    });
    _wiz.savedCharId = res.id;
  } catch (e) {
    showToast(t('error', 'エラー') + ': ' + e.message.slice(0, 40));
    wizardSetBusy(false);
    return;
  }

  // ComfyUI 接続確認 → 画像生成
  let comfyOk = false;
  try {
    await restGet('comfy/samplers');
    comfyOk = true;
  } catch (e) { /* 接続なし */ }

  if (comfyOk && _wiz.savedCharId) {
    try {
      const enPrompt = [bodyEN, clothingEN].filter(Boolean).join(', ');
      const genData = await restPost('comfy/generate', {
        workflow_id:     null,
        char_id:         _wiz.savedCharId,
        en_prompt:       enPrompt,
        fixed_seed:      null,
        turn_id:         1,
        workflow_params: {},
      });
      if (genData.imageUrl) {
        _wiz.generatedImageUrl = genData.imageUrl;
        wizardAddBubble(`
          <div style="display:flex; justify-content:center; margin:8px 0;">
            <img src="${genData.imageUrl}"
              style="max-width:80%; border-radius:12px; border:1px solid var(--border-input);">
          </div>`);
      }
    } catch (e) {
      console.warn('[Wizard] image gen failed:', e.message);
      showToast(t('wizard.skip_image', '後から画像を生成できます'));
    }
  } else if (!comfyOk) {
    showToast(t('wizard.skip_image', '後から画像を生成できます'));
  }

  _wiz.step = 8;
  wizardSetBusy(false);
  await _wizardStep8Question();
}

// ─────────────────────────────────────────────
// ステップ 8: 名前を聞く
// ─────────────────────────────────────────────
async function _wizardStep8Question() {
  await new Promise(r => setTimeout(r, 600));
  wizardAddBubble(wizardBubbleChar(t('wizard.ask_name', '…この子の名前は？')));
  const inp = document.getElementById('wizardInput');
  if (inp) {
    inp.placeholder = getCurrentLanguage() === 'ja' ? '名前を入力…' : 'Enter a name…';
    inp.focus();
  }
  wizardSetInputMode('text');
}

// ─────────────────────────────────────────────
// 画像URLをbase64に変換するヘルパー
// ─────────────────────────────────────────────
async function _wizardImageToBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─────────────────────────────────────────────
// ステップ 8 → 9: 名前確定・保存
// ─────────────────────────────────────────────
async function _wizardFinalizeName(nameInput) {
  _wiz.name = nameInput.trim();
  wizardAddBubble(wizardBubbleUser(_wiz.name));
  wizardClearInput();
  wizardSetInputMode('none');
  wizardSetBusy(true);

  if (_wiz.savedCharId) {
    let iconData = null;
    if (_wiz.generatedImageUrl) {
      try {
        iconData = await _wizardImageToBase64(_wiz.generatedImageUrl);
      } catch (e) {
        console.warn('[Wizard] icon conversion failed:', e.message);
      }
    }

    try {
      await restPut(`characters/${_wiz.savedCharId}`, {
        name:                   _wiz.name,
        personality:            _wiz.personality,
        appearance:             _wiz.appearanceBody,
        appearance_body:        _wiz.appearanceBody,
        appearance_clothing:    _wiz.appearanceClothing,
        appearance_en:          _wiz.appearanceBodyEN,
        appearance_body_en:     _wiz.appearanceBodyEN,
        appearance_clothing_en: _wiz.appearanceClothingEN,
        icon_data:              iconData,
        icon_emoji:             iconData ? null : '💬',
      });
    } catch (e) {
      console.warn('[Wizard] name update failed:', e.message);
    }
  }

  _wiz.step = 9;
  await _wizardStep9();
}

// ─────────────────────────────────────────────
// ステップ 9: キャラ自己紹介 → 完了
// ─────────────────────────────────────────────
async function _wizardStep9() {
  let greeting = '';
  try {
    greeting = await wizardLLMCall([
      {
        role: 'system',
        content: `You are roleplaying as a newly created character with the following profile:
- Name: ${_wiz.name}
- Gender: ${_wiz.gender}
- Personality: ${_wiz.personality}
- Appearance: ${_wiz.appearanceBody}
- Clothing: ${_wiz.appearanceClothing}

Stay in character and greet the user with a short self-introduction (2-3 sentences).
Use your name naturally in the greeting.
${wizardLangInstruction()}`,
      },
      { role: 'user', content: 'Introduce yourself.' },
    ]);
  } catch (e) {
    greeting = getCurrentLanguage() === 'ja'
      ? `はじめまして、${_wiz.name}です！よろしくお願いします！`
      : `Hi, I'm ${_wiz.name}! Nice to meet you!`;
  }

  wizardAddBubble(wizardBubbleChar(greeting));
  wizardSetBusy(false);

  await new Promise(r => setTimeout(r, 1800));

  // キャラIDを保持してからリセット
  const charId = _wiz.savedCharId;
  closeModal('wizardOverlay');
  wizardReset();

  // 新キャラをロードしてセッション開始
  await fetchCharsFromServer();
  const newChar = loadChars().find(c => c.id === charId);

  if (newChar) {
    activeChar = newChar;
    if (typeof updateHeaderChar === 'function') updateHeaderChar();
    initSession();
    clearChatLog();
    if (typeof updatePhotoUI === 'function') updatePhotoUI();
    appendDateSep(new Date().toLocaleDateString(
      getCurrentLanguage() === 'ja' ? 'ja-JP' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' }
    ));

    // グリーティングを最初のチャットメッセージとして投入
    setTimeout(async () => {
      const tIdx = activeSession?.turns?.length ?? 0;
      appendCharMessage(greeting, tIdx);
      const turn = {
        turn_id:      tIdx + 1,
        jp_prompt:    null, en_prompt: null, image_url: null,
        user_message: null, char_message: greeting,
        is_narrative: false, gen_mode: null,
      };
      if (activeSession?.turns) activeSession.turns.push(turn);
      await saveTurnToSession(null).catch(() => {});
    }, 300);

    if (typeof autoShowCharInfoIfNeeded === 'function') autoShowCharInfoIfNeeded();
    showToast(t('wizard.complete', '✓ キャラクターを作成しました！'));
  } else {
    // フォールバック: キャラ一覧を開く
    renderCharList();
    openModal('charOverlay');
    showToast(t('wizard.complete', '✓ キャラクターを作成しました！'));
  }
}

// ─────────────────────────────────────────────
// charOverlay フッター: 2択UI
// ─────────────────────────────────────────────
function showWizardChoice() {
  const btn = document.getElementById('charFooterBtn');
  if (btn) btn.style.display = 'none';
  const choice = document.getElementById('wizardChoiceArea');
  if (choice) choice.style.display = 'flex';
}

function hideWizardChoice() {
  const btn = document.getElementById('charFooterBtn');
  if (btn) btn.style.display = '';
  const choice = document.getElementById('wizardChoiceArea');
  if (choice) choice.style.display = 'none';
}
