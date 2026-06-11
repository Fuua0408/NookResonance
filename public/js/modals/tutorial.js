'use strict';
/* ═════════════════════════════════════════════
   NookResonance — tutorial.js
   インタラクティブチュートリアル
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 状態管理
// ─────────────────────────────────────────────
let _tut = { step: 0, userInput: '', genMode: 'normal', genOn: true };
let _tutOnFinish = null;

function tutorialReset() {
  _tut = { step: 0, userInput: '', genMode: 'normal', genOn: true };
}

// ─────────────────────────────────────────────
// sleep ユーティリティ
// ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
// UI ロック / アンロック
// ─────────────────────────────────────────────
function tutorialLockUI() {
  const ctrl = document.getElementById('tutorialInputControls');
  const inp  = document.getElementById('tutorialInput');
  const btn  = document.getElementById('tutorialBtnSend');
  if (ctrl) ctrl.style.pointerEvents = 'none';
  if (inp)  inp.disabled = true;
  if (btn)  btn.disabled = true;
}

function tutorialUnlockUI() {
  const ctrl = document.getElementById('tutorialInputControls');
  const inp  = document.getElementById('tutorialInput');
  const btn  = document.getElementById('tutorialBtnSend');
  if (ctrl) ctrl.style.pointerEvents = '';
  if (inp)  { inp.disabled = false; inp.focus(); }
  if (btn)  btn.disabled = false;
}

// ─────────────────────────────────────────────
// チャットバブル追加
// ─────────────────────────────────────────────
function tutorialAppendChar(text) {
  const log = document.getElementById('tutorialChatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.innerHTML = wizardBubbleChar(text);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function tutorialAppendUser(text) {
  const log = document.getElementById('tutorialChatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.innerHTML = wizardBubbleUser(text);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ─────────────────────────────────────────────
// ボタン追加ヘルパー
// ─────────────────────────────────────────────
function _tutShowBtn(label, onClick) {
  const log = document.getElementById('tutorialChatLog');
  if (!log) return;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; justify-content:center; margin:8px 0;';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.style.cssText = 'min-width:120px; padding:8px 20px;';
  btn.textContent = label;
  btn.onclick = () => { row.remove(); onClick(); };
  row.appendChild(btn);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

// ─────────────────────────────────────────────
// アニメーション
// ─────────────────────────────────────────────
async function tutorialAnimateToggle(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.closest('label')?.classList.add('tutorial-highlight');
  await sleep(600);
  el.checked = value;
  el.dispatchEvent(new Event('change'));
  await sleep(400);
  el.closest('label')?.classList.remove('tutorial-highlight');
}

async function tutorialAnimateModeBtn(mode) {
  const btnId = mode === 'normal' ? 'tutorialModeBtnNormal' : 'tutorialModeBtnChar';
  const btn = document.getElementById(btnId);
  btn?.classList.add('tutorial-highlight');
  await sleep(600);
  document.getElementById('tutorialModeBtnNormal')?.classList.toggle('active', mode === 'normal');
  document.getElementById('tutorialModeBtnChar')?.classList.toggle('active', mode === 'char');
  await sleep(400);
  btn?.classList.remove('tutorial-highlight');
}

// ─────────────────────────────────────────────
// LLM でキャラのセリフを生成
// ─────────────────────────────────────────────
async function tutorialAskChar(instruction) {
  const messages = [
    {
      role: 'system',
      content: `You are roleplaying as ${activeChar?.name || 'a character'}.
Personality: ${activeChar?.personality || ''}
You are guiding the user through a tutorial of a chat application.
${instruction}
Keep it to 1-3 friendly sentences, in character.
${wizardLangInstruction()}`
    },
    { role: 'user', content: 'Say it.' }
  ];
  return await wizardLLMCall(messages);
}

// ─────────────────────────────────────────────
// chatLog が minCount 以上になり、かつ DOM の変化が収束するまで待機
// children.length だけでなく subtree の変化（画像 src の更新など）も検知するため
// MutationObserver を使用する
// ─────────────────────────────────────────────
async function _waitForChatSettle(chatLog, minCount, settleMs = 2000, timeoutMs = 120000) {
  if (!chatLog) return;
  const interval = 300;
  let elapsed = 0;

  // まず minCount に達するまで待つ（ユーザーメッセージだけでは不十分）
  while (chatLog.children.length < minCount && elapsed < timeoutMs) {
    await sleep(interval);
    elapsed += interval;
  }

  // MutationObserver で subtree を含む全 DOM 変化を監視し、
  // settleMs 間変化なし → 画像生成・LLM 応答が完了したとみなす
  return new Promise(resolve => {
    let stableTimer = null;
    const hardTimeout = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, Math.max(0, timeoutMs - elapsed));

    const resetStable = () => {
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => {
        clearTimeout(hardTimeout);
        observer.disconnect();
        resolve();
      }, settleMs);
    };

    const observer = new MutationObserver(mutations => {
      // syncBadge の定期更新はノイズになるため除外する
      // テキストノード(characterData)は id/closest を持たないため parentElement で確認
      const relevant = mutations.some(m => {
        const el = m.target.nodeType === Node.TEXT_NODE
          ? m.target.parentElement
          : m.target;
        return el?.id !== 'syncBadge' && !el?.closest?.('#syncBadge');
      });
      if (relevant) resetStable();
    });
    observer.observe(chatLog, { childList: true, subtree: true, characterData: true });

    // 初回タイマー起動（変化がなければそのまま settleMs 後に解決）
    resetStable();
  });
}

// ─────────────────────────────────────────────
// submitTurn を呼び出し、結果を tutorialChatLog にコピー
// ─────────────────────────────────────────────
async function tutorialRunTurn(jpText, genOn, genMode, charLead = false, userFocus = false, viewDelay = 7000, copyResult = false) {
  const genToggleEl       = document.getElementById('genToggle');
  const charLeadToggleEl  = document.getElementById('charLeadToggle');
  const userFocusToggleEl = document.getElementById('userFocusToggle');
  const jpInputEl         = document.getElementById('jpInput');
  const overlay           = document.getElementById('tutorialOverlay');

  if (genToggleEl)       genToggleEl.checked       = genOn;
  if (charLeadToggleEl)  charLeadToggleEl.checked  = charLead;
  if (userFocusToggleEl) userFocusToggleEl.checked = userFocus;
  if (jpInputEl)         jpInputEl.value           = jpText;
  genMode_ = genMode;

  // モーダルを非表示にして実際の処理画面を見せる
  if (overlay) {
    overlay.style.transition    = 'opacity 0.3s';
    overlay.style.opacity       = '0';
    overlay.style.pointerEvents = 'none';
    await sleep(350);
  }

  const chatLog    = document.getElementById('chatLog');
  const beforeCount = chatLog ? chatLog.children.length : 0;

  // submitTurn は同期関数（Promise を返さない）。
  // 内部の非同期処理は chatLog への追加という形で進むため、
  // 呼び出し後はメイン chatLog の変化を直接監視する。
  submitTurn();

  // beforeCount+2 = ユーザーメッセージ(+1) + 少なくとも1つのレスポンス(+2) が揃い、
  // さらに 2 秒間変化なし（画像生成・認識・LLM応答が全部完了）になるまで待つ
  await _waitForChatSettle(chatLog, beforeCount + 2, 2000, 120000);

  // 結果を見せる時間
  await sleep(viewDelay);

  // テキストのみのステップはレスポンスをコピー。
  // 画像生成ステップはメインウィンドウで結果を見せる設計のためスキップ。
  if (copyResult) {
    const tutLog = document.getElementById('tutorialChatLog');
    if (chatLog && tutLog) {
      for (let i = beforeCount + 1; i < chatLog.children.length; i++) {
        const clone = chatLog.children[i].cloneNode(true);
        tutLog.appendChild(clone);
      }
      tutLog.scrollTop = tutLog.scrollHeight;
    }
  }

  // オーバーレイは呼び出し元が tutorialFadeInOverlay() で復帰させる
  // （説明バブルを追加してから復帰するため、ここでは触らない）
}

// ─────────────────────────────────────────────
// チュートリアルオーバーレイを復帰させる
// tutorialRunTurn の後、説明バブルを追加してから呼ぶこと
// ─────────────────────────────────────────────
async function tutorialFadeInOverlay() {
  const overlay = document.getElementById('tutorialOverlay');
  if (!overlay) return;
  overlay.style.transition = 'opacity 0.3s';
  overlay.style.opacity    = '1';
  await sleep(350);
  // インラインスタイルを除去して CSS 制御に戻す
  // （残すと closeModal 後も opacity:1 が CSS を上書きしてグレーアウトが残る）
  overlay.style.opacity       = '';
  overlay.style.pointerEvents = '';
  overlay.style.transition    = '';
}

// ─────────────────────────────────────────────
// チュートリアル終了後に実際のUIを初期状態に戻す
// ─────────────────────────────────────────────
function _tutRestoreRealUI() {
  const genToggleEl = document.getElementById('genToggle');
  const charLeadEl  = document.getElementById('charLeadToggle');
  const userFocusEl = document.getElementById('userFocusToggle');
  if (genToggleEl) genToggleEl.checked = true;
  if (charLeadEl)  charLeadEl.checked  = false;
  if (userFocusEl) userFocusEl.checked = false;
  genMode_ = 'normal';
}

// ─────────────────────────────────────────────
// 入力ハンドラ
// ─────────────────────────────────────────────
function tutorialHandleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    tutorialSubmit();
  }
}

async function tutorialSubmit() {
  const inp = document.getElementById('tutorialInput');
  const text = inp?.value?.trim();
  if (!text) return;
  if (inp) inp.value = '';
  tutorialLockUI();
  tutorialAppendUser(text);
  _tut.userInput = text;

  const step = _tut.step;
  if      (step === 1) await _tutStep1Submit(text);
  else if (step === 2) await _tutStep2Submit(text);
  else if (step === 4) await _tutStep4Submit(text);
  else if (step === 5) await _tutStep5Submit(text);
  else if (step === 6) await _tutStep6Submit(text);
}

// ─────────────────────────────────────────────
// openTutorial
// ─────────────────────────────────────────────
function openTutorial(onFinish) {
  if (!activeChar) {
    showToast(t('chat.no_char', 'キャラクターを選択してください'));
    return;
  }
  _tutOnFinish = onFinish || null;
  tutorialReset();
  initSession();
  clearChatLog();

  // チュートリアルUIリセット
  const log = document.getElementById('tutorialChatLog');
  if (log) log.innerHTML = '';
  const inp = document.getElementById('tutorialInput');
  if (inp) inp.value = '';

  // ヘッダーにキャラ情報を反映
  const avatarEl = document.getElementById('tutorialHeaderAvatar');
  const nameEl   = document.getElementById('tutorialHeaderName');
  if (avatarEl) {
    if (activeChar.icon_data) {
      avatarEl.innerHTML = `<img src="${activeChar.icon_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      avatarEl.textContent = activeChar.icon_emoji || '💬';
    }
  }
  if (nameEl) nameEl.textContent = activeChar.name || '';

  // 擬似入力エリアリセット
  const genTgl = document.getElementById('tutorialGenToggle');
  if (genTgl) genTgl.checked = true;
  document.getElementById('tutorialModeBtnNormal')?.classList.add('active');
  document.getElementById('tutorialModeBtnChar')?.classList.remove('active');
  const charLeadWrap    = document.getElementById('tutorialCharLeadToggleWrap');
  const userFocusWrap   = document.getElementById('tutorialUserFocusToggleWrap');
  const charLeadChk     = document.getElementById('tutorialCharLeadToggle');
  const userFocusChk    = document.getElementById('tutorialUserFocusToggle');
  if (charLeadWrap)  charLeadWrap.style.display  = 'none';
  if (userFocusWrap) userFocusWrap.style.display = 'none';
  if (charLeadChk)   charLeadChk.checked  = false;
  if (userFocusChk)  userFocusChk.checked = false;

  tutorialLockUI();
  openModal('tutorialOverlay');
  setTimeout(() => _tutStep1(), 300);
}

// ─────────────────────────────────────────────
// skipTutorial（スキップ & Step 7 完了共通）
// ─────────────────────────────────────────────
function skipTutorial() {
  tutorialReset();
  // フェードアニメーションの残留インラインスタイルを除去してから閉じる
  const _ov = document.getElementById('tutorialOverlay');
  if (_ov) { _ov.style.opacity = ''; _ov.style.transition = ''; _ov.style.pointerEvents = ''; }
  closeModal('tutorialOverlay');
  _tutRestoreRealUI();
  activeSession = null;
  clearChatLog();

  if (typeof _tutOnFinish === 'function') {
    const cb = _tutOnFinish;
    _tutOnFinish = null;
    cb();
  } else {
    _tutStartFreshSession();
  }
}

// 設定画面からのチュートリアル終了後: 新規セッション開始 + グリーティング表示
async function _tutStartFreshSession() {
  if (!activeChar) { openCharModal(); return; }
  initSession();
  clearChatLog();
  appendDateSep(new Date().toLocaleDateString(
    getCurrentLanguage() === 'ja' ? 'ja-JP' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  ));
  try {
    const greeting = await tutorialAskChar(
      'Just say hi and start talking to the user naturally, as you normally would. Do not mention the tutorial or the app.'
    );
    const tIdx = activeSession?.turns?.length ?? 0;
    appendCharMessage(greeting, tIdx);
    const turn = {
      turn_id: tIdx + 1,
      jp_prompt: null, en_prompt: null, image_url: null,
      user_message: null, char_message: greeting,
      is_narrative: false, gen_mode: null,
    };
    if (activeSession?.turns) activeSession.turns.push(turn);
    await saveTurnToSession(null).catch(() => {});
  } catch(e) {
    console.warn('[Tutorial] greeting error:', e);
  }
}

// ─────────────────────────────────────────────
// Step 1: 生成あり・通常モード
// ─────────────────────────────────────────────
async function _tutStep1() {
  _tut.step = 1;
  let msg;
  try {
    msg = await tutorialAskChar(
      'Ask the user to imagine what you are wearing and what you are doing right now, then type it in. Be curious and playful.'
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? '今私がどんな格好で何してると思う？　想像して入力してみて！'
      : "What do you think I'm wearing and doing right now? Imagine it and type it in!";
  }
  tutorialAppendChar(msg);
  await tutorialAnimateToggle('tutorialGenToggle', true);
  await tutorialAnimateModeBtn('normal');
  tutorialUnlockUI();
}

async function _tutStep1Submit(text) {
  try {
    await tutorialRunTurn(text, true, 'normal', false, false, 10000, false);
  } catch(e) {
    console.warn('[Tutorial] step1 error:', e);
  }
  let msg;
  try {
    msg = await tutorialAskChar(
      'Tell the user how normal image generation works: the image appears, then you react. Suggest trying character-led mode next with enthusiasm.'
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? 'こんな感じで画像が生成されるよ！　次はキャラ主導モードを試してみよう'
      : "That's how image generation works! Next, let's try character-led mode!";
  }
  tutorialAppendChar(msg);
  await tutorialFadeInOverlay();
  await sleep(1000);
  await _tutStep2();
}

// ─────────────────────────────────────────────
// Step 2: 生成あり・キャラ主導モード
// ─────────────────────────────────────────────
async function _tutStep2() {
  _tut.step = 2;
  let msg;
  try {
    msg = await tutorialAskChar(
      "Explain that in 'character-led' mode, you react to the user's message first, then the image is generated from your reaction. Ask the user to write what they want you to do."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? 'キャラ主導モードはね、私が先に反応してから画像になるんだ。何かしてほしいことを書いてみて！'
      : "In character-led mode, I react first and then the image is generated! Write something you'd like me to do!";
  }
  tutorialAppendChar(msg);
  await tutorialAnimateModeBtn('char');
  tutorialUnlockUI();
}

async function _tutStep2Submit(text) {
  try {
    await tutorialRunTurn(text, true, 'char', false, false, 7000, false);
  } catch(e) {
    console.warn('[Tutorial] step2 error:', e);
  }
  let msg;
  try {
    msg = await tutorialAskChar(
      "Tell the user you reacted first and then the image was generated from your reaction. Now introduce conversation mode — chatting without images."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? '私が反応してから画像になったでしょ？　次は会話モードを見てみよう'
      : "You saw how I reacted first, then the image appeared! Next, let's look at conversation mode.";
  }
  tutorialAppendChar(msg);
  await tutorialFadeInOverlay();
  await sleep(1000);
  await _tutStep3();
}

// ─────────────────────────────────────────────
// Step 3: 生成なし説明（ユーザー入力なし）
// ─────────────────────────────────────────────
async function _tutStep3() {
  _tut.step = 3;
  let msg;
  try {
    msg = await tutorialAskChar(
      "Explain that when you just want to chat without images, the user should uncheck the generate toggle. Keep it simple and brief."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? '画像じゃなくてお話ししたいときは、このチェックを外してね'
      : "When you just want to chat without images, just uncheck the generate toggle!";
  }
  tutorialAppendChar(msg);
  await tutorialAnimateToggle('tutorialGenToggle', false);
  const charLeadWrap = document.getElementById('tutorialCharLeadToggleWrap');
  if (charLeadWrap) charLeadWrap.style.display = '';

  _tutShowBtn(
    t('tutorial.understood', 'わかった！'),
    () => _tutStep4()
  );
}

// ─────────────────────────────────────────────
// Step 4: 会話・通常モード
// ─────────────────────────────────────────────
async function _tutStep4() {
  _tut.step = 4;
  let msg;
  try {
    msg = await tutorialAskChar(
      "Tell the user that in conversation normal mode they can just chat with you naturally. Invite them to say something."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? '会話の通常モードはこんな感じで普通に話せるよ！'
      : "In conversation normal mode, we can just chat naturally! Go ahead and say something!";
  }
  tutorialAppendChar(msg);
  await tutorialAnimateToggle('tutorialCharLeadToggle', false);
  tutorialUnlockUI();
}

async function _tutStep4Submit(text) {
  try {
    await tutorialRunTurn(text, false, 'normal', false, false, 5000);
  } catch(e) {
    console.warn('[Tutorial] step4 error:', e);
  }
  let msg;
  try {
    msg = await tutorialAskChar(
      "Excitedly introduce the character-led conversation mode as the next thing to show the user."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? '次はキャラ主導の会話モード！'
      : "Next up: character-led conversation mode!";
  }
  tutorialAppendChar(msg);
  await tutorialFadeInOverlay();
  await sleep(1000);
  await _tutStep5();
}

// ─────────────────────────────────────────────
// Step 5: 会話・キャラ主導モード
// ─────────────────────────────────────────────
async function _tutStep5() {
  _tut.step = 5;
  let msg;
  try {
    msg = await tutorialAskChar(
      "Explain that in character-led conversation mode, you proactively keep the conversation going and take initiative. Ask the user to try sending a message."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? 'キャラ主導の会話モードはね、私がどんどん話しかけていくモードだよ！何か送ってみて！'
      : "In character-led conversation mode, I proactively keep talking to you! Try sending a message!";
  }
  tutorialAppendChar(msg);
  await tutorialAnimateToggle('tutorialCharLeadToggle', true);
  tutorialUnlockUI();
}

async function _tutStep5Submit(text) {
  try {
    await tutorialRunTurn(text, false, 'normal', true, false, 5000);
  } catch(e) {
    console.warn('[Tutorial] step5 error:', e);
  }
  let msg;
  try {
    msg = await tutorialAskChar(
      "Tell the user you'll now show them the last feature: the advanced USER focus mode."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? '最後に上級者向けのモードを紹介するね！'
      : "Finally, I'll show you the advanced USER focus mode!";
  }
  tutorialAppendChar(msg);
  await tutorialFadeInOverlay();
  await sleep(1000);
  await _tutStep6();
}

// ─────────────────────────────────────────────
// Step 6: USERフォーカスモード
// ─────────────────────────────────────────────
async function _tutStep6() {
  _tut.step = 6;
  let msg;
  try {
    msg = await tutorialAskChar(
      "Explain that USER focus mode lets the user be the star of image generation by entering their own appearance. Ask them to describe what they look like first."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? 'USERフォーカスモードは、あなた自身の外見を入力すると、あなたを主役に画像を生成できる上級者モードだよ！　まずあなたの外見を教えて'
      : "USER focus mode lets you be the star of image generation by entering your appearance! First, describe what you look like!";
  }
  tutorialAppendChar(msg);

  const genTgl = document.getElementById('tutorialGenToggle');
  if (genTgl) genTgl.checked = true;
  const charLeadWrap  = document.getElementById('tutorialCharLeadToggleWrap');
  const userFocusWrap = document.getElementById('tutorialUserFocusToggleWrap');
  if (charLeadWrap)  charLeadWrap.style.display  = 'none';
  if (userFocusWrap) userFocusWrap.style.display = '';
  await tutorialAnimateToggle('tutorialUserFocusToggle', true);
  tutorialUnlockUI();
}

async function _tutStep6Submit(text) {
  try {
    await tutorialRunTurn(text, true, 'normal', false, true, 10000, false);
  } catch(e) {
    console.warn('[Tutorial] step6 error:', e);
  }
  await tutorialFadeInOverlay();
  await _tutStep7();
}

// ─────────────────────────────────────────────
// Step 7: 完了
// ─────────────────────────────────────────────
async function _tutStep7() {
  _tut.step = 7;
  let msg;
  try {
    msg = await tutorialAskChar(
      "Give a warm, enthusiastic farewell — the tutorial is complete. Tell the user you're really looking forward to spending lots of time together! Also mention that if they ever get confused or want to learn more, they can check the manual."
    );
  } catch(e) {
    msg = getCurrentLanguage() === 'ja'
      ? 'これで説明は全部！　困ったときはマニュアルを見てね。いっぱい話そうね！'
      : "That's everything! If you ever get confused, check the manual. I'm really looking forward to chatting with you lots!";
  }
  tutorialAppendChar(msg);
  _tutShowBtn(
    t('tutorial.start', 'はじめる！'),
    () => skipTutorial()
  );
}
