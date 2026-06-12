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
  greeting: null,
  imageBase64:        null,
  inferredAppearance: '',
  inferredClothing:   '',
  inferredLocation:   '',
  selectedIconData:   null,
};

function wizardReset() {
  _wiz = {
    step: 0, gender: '', personality: '',
    appearanceBody: '', appearanceClothing: '',
    appearanceBodyEN: '', appearanceClothingEN: '',
    location: '', name: '', savedCharId: null,
    generatedImageUrl: null,
    greeting: null,
    imageBase64: null,
    inferredAppearance: '',
    inferredClothing:   '',
    inferredLocation:   '',
    selectedIconData:   null,
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
  const choiceDiv = document.getElementById('wizardTutorialChoiceDiv');
  if (choiceDiv) choiceDiv.remove();
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

  if (typeof _wiz.step === 'number' && _wiz.step >= 2 && _wiz.step <= 6) {
    await _wizardHandleTextStep(userInput);
  } else if (_wiz.step === 8) {
    await _wizardFinalizeName(userInput);
  } else if (_wiz.step === 'img_appearance_edit') {
    await _imageWizardHandleAppearanceEdit(userInput);
  } else if (_wiz.step === 'img_appearance_text') {
    await _imageWizardHandleAppearanceText(userInput);
  } else if (_wiz.step === 'img_personality') {
    await _imageWizardHandlePersonality(userInput);
  } else if (_wiz.step === 'img_location') {
    await _imageWizardHandleLocation(userInput);
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
    await _wizardFromStep7();
  } else {
    await _wizardAskStep(_wiz.step);
  }
}

// ─────────────────────────────────────────────
// 【共通後半】ステップ 7: 英訳 → 仮保存 → 画像生成
// ─────────────────────────────────────────────
async function _wizardFromStep7() {
  wizardSetInputMode('none');
  wizardSetBusy(true);
  wizardAddBubble(wizardBubbleChar(
    t('wizard.processing', '少しだけ待っていてね…もうすぐ私の姿が見えてくるかも。')));

  const isImageWizard = !!_wiz.imageBase64;

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

  let imageGenSucceeded = false;

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
        imageGenSucceeded = true;
      }
    } catch (e) {
      console.warn('[Wizard] image gen failed:', e.message);
      showToast(t('wizard.skip_image', '後から画像を生成できます'));
    }
  } else if (!comfyOk) {
    showToast(t('wizard.skip_image', '後から画像を生成できます'));
  }

  // 画像ウィザード: アイコン選択 or フォールバック
  if (isImageWizard) {
    if (imageGenSucceeded) {
      wizardAddBubble(wizardBubbleChar(
        t('wizard.image_icon_choice', 'アイコンはどっちにする？')
      ));
      wizardAddBubble(`
        <div style="display:flex; gap:12px; justify-content:center; margin:8px 0;">
          <div style="text-align:center;">
            <img src="${_wiz.imageBase64}"
              style="width:80px; height:80px; object-fit:cover; border-radius:50%;
                     border:2px solid var(--border-input); cursor:pointer;"
              onclick="_imageWizardSelectIcon('upload')" id="iconChoiceUpload">
            <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">
              ${t('wizard.image_icon_ref', '参考画像')}
            </div>
          </div>
          <div style="text-align:center;">
            <img src="${_wiz.generatedImageUrl}"
              style="width:80px; height:80px; object-fit:cover; border-radius:50%;
                     border:2px solid var(--border-input); cursor:pointer;"
              onclick="_imageWizardSelectIcon('generated')" id="iconChoiceGenerated">
            <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">
              ${t('wizard.image_icon_gen', '生成画像')}
            </div>
          </div>
        </div>`);
      wizardSetBusy(false);
      return; // _imageWizardSelectIcon() へ続く
    } else {
      // フォールバック: アップロード画像をアイコンとして保存
      _wiz.selectedIconData = _wiz.imageBase64;
      if (_wiz.savedCharId && _wiz.imageBase64) {
        try {
          await restPut(`characters/${_wiz.savedCharId}`, {
            icon_data:  _wiz.imageBase64,
            icon_emoji: null,
          });
        } catch(e) {
          console.warn('[ImageWizard] icon update failed:', e.message);
        }
      }
    }
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
    if (_wiz.imageBase64) {
      // 画像ウィザード: アイコン選択ステップで確定した画像を使う
      iconData = _wiz.selectedIconData || _wiz.imageBase64;
    } else if (_wiz.generatedImageUrl) {
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
// ステップ 9: キャラ自己紹介 → チュートリアル誘導
// ─────────────────────────────────────────────
async function _wizardStep9() {
  let greeting = '';
  try {
    greeting = await wizardLLMCall([
      {
        role: 'system',
        content: `You are roleplaying as a newly created character with the following profile:
- Name: ${_wiz.name}
${_wiz.gender ? `- Gender: ${_wiz.gender}\n` : ''}- Personality: ${_wiz.personality}
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
  _wiz.greeting = greeting;
  wizardSetBusy(false);

  await new Promise(r => setTimeout(r, 1000));

  // 使い方説明の提案
  wizardAddBubble(wizardBubbleChar(
    t('wizard.offer_tutorial', '使い方を説明しようか？')
  ));
  wizardShowTutorialChoice();
}

// ─────────────────────────────────────────────
// チュートリアル誘導 UI
// ─────────────────────────────────────────────
function wizardShowTutorialChoice() {
  wizardSetInputMode('none');
  const inputArea = document.getElementById('wizardInputArea');
  if (!inputArea) return;
  const existing = document.getElementById('wizardTutorialChoiceDiv');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'wizardTutorialChoiceDiv';
  div.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn-primary';
  yesBtn.textContent = t('wizard.tutorial_yes', 'うん！');
  yesBtn.onclick = wizardTutorialYes;

  const noBtn = document.createElement('button');
  noBtn.className = 'btn-secondary';
  noBtn.textContent = t('wizard.tutorial_no', '大丈夫！');
  noBtn.onclick = wizardTutorialNo;

  div.appendChild(yesBtn);
  div.appendChild(noBtn);
  inputArea.appendChild(div);
}

// YES → チュートリアルへ（会話開始はチュートリアル完了後）
async function wizardTutorialYes() {
  const charId  = _wiz.savedCharId;
  const greeting = _wiz.greeting;

  closeModal('wizardOverlay');
  wizardReset();

  await fetchCharsFromServer();
  const newChar = loadChars().find(c => c.id === charId);

  if (newChar) {
    activeChar = newChar;
    if (typeof updateHeaderChar === 'function') updateHeaderChar();
    if (typeof updatePhotoUI === 'function') updatePhotoUI();
    if (typeof autoShowCharInfoIfNeeded === 'function') autoShowCharInfoIfNeeded();
    showToast(t('wizard.complete', '✓ キャラクターを作成しました！'));
  }

  // チュートリアル終了後にセッション開始・グリーティング投入
  openTutorial(() => {
    if (!activeChar) { openCharModal(); return; }
    initSession();
    clearChatLog();
    appendDateSep(new Date().toLocaleDateString(
      getCurrentLanguage() === 'ja' ? 'ja-JP' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' }
    ));
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
  });
}

// NO → 通常のチャット開始
async function wizardTutorialNo() {
  const charId  = _wiz.savedCharId;
  const greeting = _wiz.greeting;

  closeModal('wizardOverlay');
  wizardReset();

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
    renderCharList();
    openModal('charOverlay');
    showToast(t('wizard.complete', '✓ キャラクターを作成しました！'));
  }
}

// ─────────────────────────────────────────────
// 【画像ウィザード】openImageWizard() + ImageStep0〜4
// ─────────────────────────────────────────────

function openImageWizard() {
  wizardReset();
  const log = document.getElementById('wizardChatLog');
  if (log) log.innerHTML = '';
  wizardSetInputMode('none');
  openModal('wizardOverlay');
  const titleEl = document.querySelector('#wizardOverlay .sheet-title');
  if (titleEl) titleEl.textContent = t('wizard.image_title', '画像からキャラクター作成');
  setTimeout(_imageWizardStart, 300);
}

// ImageStep 0: 画像アップロード
function _imageWizardStart() {
  wizardAddBubble(wizardBubbleChar(
    t('wizard.image_upload_prompt', 'どんな子を作りたいか、参考になる画像を見せてくれると嬉しいな！')
  ));

  const inputArea = document.getElementById('wizardInputArea');
  if (!inputArea) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  fileInput.onchange = _imageWizardOnFileSelected;

  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn-primary';
  uploadBtn.textContent = t('wizard.image_upload_btn', '📁 画像を選ぶ');
  uploadBtn.onclick = () => fileInput.click();

  const wrapper = document.createElement('div');
  wrapper.id = 'imageWizardUploadArea';
  wrapper.style.cssText = 'display:flex; gap:8px; align-items:center;';
  wrapper.appendChild(fileInput);
  wrapper.appendChild(uploadBtn);
  inputArea.appendChild(wrapper);
}

function _imageWizardOnFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onloadend = async () => {
    const dataUrl = reader.result;
    _wiz.imageBase64 = dataUrl;

    wizardAddBubble(`
      <div style="display:flex; justify-content:center; margin:8px 0;">
        <img src="${dataUrl}" style="max-width:80%; border-radius:12px; border:1px solid var(--border-input);">
      </div>`);

    const uploadArea = document.getElementById('imageWizardUploadArea');
    if (uploadArea) uploadArea.style.display = 'none';

    wizardSetBusy(true);
    await _imageWizardStep1();
  };
  reader.readAsDataURL(file);
}

// ImageStep 1: 外見・場所の読み取り
async function _imageWizardStep1() {
  wizardAddBubble(wizardBubbleChar(
    t('wizard.image_reading', 'ちょっと待ってね、よく見てみるね…')
  ));

  try {
    const result = await getChatCompletion([
      {
        role: 'system',
        content: `You are an assistant that reads character appearance from images.
Analyze the image and output the following in Japanese (for display to the user).

Reply ONLY with valid JSON in this exact format (no other text):
{"appearance":"(physical features: body type, hair, eyes, skin, etc. in natural Japanese)","clothing":"(clothing, accessories, etc. in natural Japanese)","location":"(location or situation inferred from background in natural Japanese, empty string if unknown)"}`,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: _wiz.imageBase64 } },
          { type: 'text', text: 'Please read the appearance, clothing, and location of the character in this image.' },
        ],
      },
    ], { noThink: true });

    const jsonStr = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    _wiz.inferredAppearance = parsed.appearance || '';
    _wiz.inferredClothing   = parsed.clothing   || '';
    _wiz.inferredLocation   = parsed.location   || '';
    await _imageWizardStep2();
  } catch (e) {
    console.warn('[ImageWizard] step1 failed:', e.message);
    _wiz.inferredAppearance = '';
    _wiz.inferredClothing   = '';
    _wiz.inferredLocation   = '';
    wizardAddBubble(wizardBubbleChar(
      t('wizard.image_read_failed', 'うまく読み取れなかったな…外見を教えてもらえる？')
    ));
    await _imageWizardStep2();
  }
}

// ImageStep 2: 外見の確認
async function _imageWizardStep2() {
  if (_wiz.inferredAppearance || _wiz.inferredClothing) {
    try {
      const message = await wizardLLMCall([
        {
          role: 'system',
          content: `You are a guide helping to create a character.
Introduce the following appearance information in natural conversational Japanese, as if speaking to the user.
Keep it to 2-3 sentences. End with a note like "変えたいところがあれば教えてね！"
${wizardLangInstruction()}`,
        },
        {
          role: 'user',
          content: `Appearance: ${_wiz.inferredAppearance}\nClothing: ${_wiz.inferredClothing}`,
        },
      ]);
      wizardAddBubble(wizardBubbleChar(message));
    } catch (e) {
      wizardAddBubble(wizardBubbleChar(`${_wiz.inferredAppearance} / ${_wiz.inferredClothing}`));
    }

    wizardSetBusy(false);
    const inputArea = document.getElementById('wizardInputArea');
    if (!inputArea) return;

    const btnDiv = document.createElement('div');
    btnDiv.id = 'imageWizardAppearanceBtns';
    btnDiv.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

    const keepBtn = document.createElement('button');
    keepBtn.className = 'btn-primary';
    keepBtn.textContent = t('wizard.image_confirm_keep', 'このまま');
    keepBtn.onclick = async () => {
      btnDiv.remove();
      wizardAddBubble(wizardBubbleUser(t('wizard.image_confirm_keep', 'このまま')));
      _wiz.appearanceBody     = _wiz.inferredAppearance;
      _wiz.appearanceClothing = _wiz.inferredClothing;
      wizardSetBusy(true);
      await _imageWizardStep3();
    };

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary';
    editBtn.textContent = t('wizard.image_confirm_edit', '変える');
    editBtn.onclick = () => {
      btnDiv.remove();
      wizardAddBubble(wizardBubbleUser(t('wizard.image_confirm_edit', '変える')));
      wizardAddBubble(wizardBubbleChar(
        t('wizard.image_edit_prompt', '変えたいところを細かく教えてね！')
      ));
      _wiz.step = 'img_appearance_edit';
      wizardSetInputMode('text');
    };

    btnDiv.appendChild(keepBtn);
    btnDiv.appendChild(editBtn);
    inputArea.appendChild(btnDiv);
  } else {
    // 読み取り失敗: テキスト入力で外見を受け取る
    _wiz.step = 'img_appearance_text';
    wizardSetInputMode('text');
    wizardSetBusy(false);
  }
}

async function _imageWizardHandleAppearanceEdit(userInput) {
  wizardAddBubble(wizardBubbleUser(userInput));
  wizardClearInput();
  wizardSetInputMode('none');
  wizardSetBusy(true);
  try {
    const merged = await wizardLLMCall([
      {
        role: 'system',
        content: `You are a character appearance editor.
Apply the user's requested changes to the original appearance information below.
Original appearance: ${_wiz.inferredAppearance}
Original clothing: ${_wiz.inferredClothing}
Reply ONLY with valid JSON in this exact format (no other text):
{"appearance":"...","clothing":"..."}
Output values in Japanese.`,
      },
      { role: 'user', content: userInput },
    ]);
    const jsonStr = merged.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    _wiz.appearanceBody     = parsed.appearance || _wiz.inferredAppearance;
    _wiz.appearanceClothing = parsed.clothing   || _wiz.inferredClothing;
  } catch (e) {
    console.warn('[ImageWizard] merge failed:', e.message);
    _wiz.appearanceBody     = _wiz.inferredAppearance;
    _wiz.appearanceClothing = _wiz.inferredClothing;
  }
  await _imageWizardStep3();
}

async function _imageWizardHandleAppearanceText(userInput) {
  wizardAddBubble(wizardBubbleUser(userInput));
  wizardClearInput();
  wizardSetInputMode('none');
  wizardSetBusy(true);
  _wiz.appearanceBody     = userInput;
  _wiz.appearanceClothing = '';
  await _imageWizardStep3();
}

// ImageStep 3: 性格設定
async function _imageWizardStep3() {
  try {
    const question = await wizardLLMCall([
      {
        role: 'system',
        content: `You are a guide helping to create a character.
Based on the character's appearance below, ask the user about what kind of personality this character has.
Speak in warm, natural conversational Japanese. Keep it to 1-2 sentences.
${wizardLangInstruction()}`,
      },
      {
        role: 'user',
        content: `Appearance: ${_wiz.appearanceBody}\nClothing: ${_wiz.appearanceClothing}`,
      },
    ]);
    wizardAddBubble(wizardBubbleChar(question));
  } catch (e) {
    wizardAddBubble(wizardBubbleChar(
      t('wizard.llm_error', 'この子の性格はどんな感じ？')
    ));
  }
  _wiz.step = 'img_personality';
  wizardSetInputMode('text');
  wizardSetBusy(false);
}

async function _imageWizardHandlePersonality(userInput) {
  wizardAddBubble(wizardBubbleUser(userInput));
  wizardClearInput();
  wizardSetInputMode('none');
  wizardSetBusy(true);
  try {
    const summary = await wizardLLMCall([
      {
        role: 'system',
        content: `You are a data extraction assistant.
Extract "personality and character traits" from the user's answer and summarize it in 20 characters or less.
Output only the summary. No explanation.
${wizardLangInstruction()}`,
      },
      { role: 'user', content: userInput },
    ]);
    _wiz.personality = summary || userInput;
  } catch (e) {
    _wiz.personality = userInput;
  }
  await _imageWizardStep4();
}

// ImageStep 4: 場所の確認
async function _imageWizardStep4() {
  try {
    const locationQuestion = await wizardLLMCall([
      {
        role: 'system',
        content: `You are a guide helping to create a character.
Based on the character information below, ask the user about where the character usually is or what their typical situation is.
The image suggested "${_wiz.inferredLocation || 'unknown'}" as the location, so use that as a base and ask naturally in a "...そんな感じ？" style.
Since this comes after the personality step, match the tone to the character's personality.
Keep it to 1-2 sentences.
${wizardLangInstruction()}`,
      },
      {
        role: 'user',
        content: `Personality: ${_wiz.personality}\nInferred location: ${_wiz.inferredLocation}`,
      },
    ]);
    wizardAddBubble(wizardBubbleChar(locationQuestion));
  } catch (e) {
    wizardAddBubble(wizardBubbleChar(
      t('wizard.llm_error', 'いつもどんな場所にいることが多い？')
    ));
  }
  _wiz.step = 'img_location';
  wizardSetInputMode('text');
  wizardSetBusy(false);
}

async function _imageWizardHandleLocation(userInput) {
  wizardAddBubble(wizardBubbleUser(userInput));
  wizardClearInput();
  wizardSetInputMode('none');
  wizardSetBusy(true);
  _wiz.location = userInput;
  const locSep = getCurrentLanguage() === 'ja' ? '。場所・状況：' : '. Location: ';
  _wiz.personality += locSep + userInput;
  await _wizardFromStep7();
}

// アイコン選択（画像ウィザード専用）
async function _imageWizardSelectIcon(choice) {
  document.getElementById('iconChoiceUpload')?.style.setProperty('pointer-events', 'none');
  document.getElementById('iconChoiceGenerated')?.style.setProperty('pointer-events', 'none');
  wizardSetBusy(true);

  let iconData;
  if (choice === 'upload') {
    iconData = _wiz.imageBase64;
  } else {
    try {
      iconData = await _wizardImageToBase64(_wiz.generatedImageUrl);
    } catch(e) {
      iconData = _wiz.imageBase64;
    }
  }

  _wiz.selectedIconData = iconData;

  if (_wiz.savedCharId && iconData) {
    try {
      await restPut(`characters/${_wiz.savedCharId}`, { icon_data: iconData, icon_emoji: null });
    } catch(e) {
      console.warn('[ImageWizard] icon update failed:', e.message);
    }
  }

  _wiz.step = 8;
  wizardSetBusy(false);
  await _wizardStep8Question();
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
