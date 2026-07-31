'use strict';

/* ═════════════════════════════════════════════
   NookResonance — upload.js
   画像添付・意図判定・感想/参考生成モード
   ═════════════════════════════════════════════ */

let _attachedImageDataUrl = null; // base64 data URL (表示・LLM送信用)
let _attachedImageFile    = null; // File オブジェクト（サーバーアップロード用）

// /api/uploads/ の URL に認証トークンを付加する（<img> タグ表示用）
function tokenizeUploadUrl(url) {
  if (!url || !url.startsWith('/api/uploads/')) return url;
  const token = getAuthToken();
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

// ── ファイル選択トリガー ──────────────────────
function triggerImageAttach() {
  document.getElementById('attachImageInput')?.click();
}

// ── ファイル選択後 ────────────────────────────
function onImageAttached(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  _attachedImageFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    _attachedImageDataUrl = e.target.result; // data:image/...;base64,...
    const preview = document.getElementById('attachPreviewImg');
    if (preview) preview.src = _attachedImageDataUrl;
    const area = document.getElementById('attachPreviewArea');
    if (area) area.style.display = '';
  };
  reader.readAsDataURL(file);

  // 同じファイルを再選択できるようにリセット
  event.target.value = '';
}

// ── 添付解除 ──────────────────────────────────
function clearAttachedImage() {
  _attachedImageDataUrl = null;
  _attachedImageFile    = null;
  const preview = document.getElementById('attachPreviewImg');
  if (preview) preview.src = '';
  const area = document.getElementById('attachPreviewArea');
  if (area) area.style.display = 'none';
  const syncCheck = document.getElementById('attachSyncClothing');
  if (syncCheck) syncCheck.checked = false;
}

// ── サーバーへアップロード ────────────────────
async function uploadAttachedImage(file, charId) {
  const formData = new FormData();
  formData.append('char_id', charId); // destination コールバック時に req.body で参照できるよう先に追加
  formData.append('image', file);
  const resp = await fetch('/api/uploads/image', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    body: formData,
  });
  if (!resp.ok) throw new Error(t('chat.upload_failed', '画像のアップロードに失敗しました'));
  const data = await resp.json();
  return data.url;
}

// ── 意図判定 (generate / react) ──────────────
async function classifyImageIntent(jpText, dataUrl) {
  updateStatusBadge(t('status.analyzing_image', '画像を解析中…'));

  // data URL から base64 部分だけ取り出す
  const base64 = dataUrl.split(',')[1];

  const result = await getChatCompletion([
    {
      role: 'system',
      content: `You are classifying the user's intent.
The user has attached an image and written a message.
Reply with ONLY one word: "generate" or "react".
- "generate": user wants to create a new image inspired by or based on the attached image
- "react": user wants the character to look at the image and respond/comment on it
No explanation, no punctuation. One word only.`,
    },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
        { type: 'text', text: jpText || '（プロンプトなし）' },
      ],
    },
  ], { noThink: true });

  const clean = cleanLLMResponse(result).trim().toLowerCase();
  return clean.includes('generate') ? 'generate' : 'react';
}

// ── 画像→キャラ融合プロンプト生成 ───────────────
// syncClothing=true  : 画像の服装も抽出してプロンプトに含める
// syncClothing=false : 画像から服装を抽出しない。キャラのデフォルト服装を使う
async function reversePromptFromImage(dataUrl, jpText, syncClothing = false) {
  const base64 = dataUrl.split(',')[1];

  const charBodyEN    = (activeChar?.appearance_body_en?.trim()
                      || activeChar?.appearance_en?.trim()) || '';
  const charClothingEN = activeSession?.current_clothing?.trim()
                       || activeChar?.appearance_clothing_en?.trim() || '';
  const qualityTags   = activeChar?.workflow_params?.quality_tags?.trim()
                      || getSetting('global_quality_tags', '');
  const triggerWords  = typeof getLoRATriggerWords === 'function' ? getLoRATriggerWords() : '';

  const extractItems = syncClothing
    ? '- Outfit / clothing (what the person is wearing)\n- Art style, lighting, color tone\n- Scene / background / location\n- Pose, action, expression (if relevant)'
    : '- Art style, lighting, color tone\n- Scene / background / location\n- Pose, action, expression (if relevant)';

  const result = await getChatCompletion([
    {
      role: 'system',
      content: `You are an image generation prompt expert for Stable Diffusion / Flux.
Analyze the attached reference image and extract ONLY the following elements as English comma-separated tags:
${extractItems}
Do NOT extract physical features of the person (face, hair, body type, eye color, skin, etc.).
${jpText ? `Also incorporate the user's direction: "${jpText}"` : ''}
Output only comma-separated English tags, nothing else.`,
    },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
        { type: 'text', text: 'Extract tags from this image.' },
      ],
    },
  ], { noThink: true });

  const imageTags = cleanLLMResponse(result);

  // 服装ソース：syncClothing=ON なら画像タグから、OFF ならキャラのデフォルト服装
  const clothingPart = syncClothing ? '' : charClothingEN;

  return [triggerWords, qualityTags, charBodyEN, clothingPart, imageTags].filter(Boolean).join(', ');
}

// ── メイン：画像付きターン送信 ────────────────
async function submitTurnWithImage() {
  if (!activeChar) { showToast(t('chat.no_char', 'キャラクターを選択してください')); openCharModal(); return; }
  if (!activeSession) { showToast(t('toast.no_session', 'セッションを選択してください')); return; }

  const jpText  = document.getElementById('jpInput')?.value?.trim() || '';
  const dataUrl = _attachedImageDataUrl;

  isGenerating = true;
  setBtnState(true);

  try {
    // 1. アップロード
    let uploadedUrl = null;
    try {
      uploadedUrl = await uploadAttachedImage(_attachedImageFile, activeChar.id);
    } catch(e) {
      throw new Error(t('chat.upload_failed', '画像のアップロードに失敗しました') + ': ' + e.message);
    }

    // 2. 意図判定
    const intent = await classifyImageIntent(jpText, dataUrl);

    const tIdx = activeSession.turns.length;
    const turn = {
      turn_id:            tIdx + 1,
      jp_prompt:          jpText || null,
      en_prompt:          null,
      image_url:          null,
      attached_image_url: uploadedUrl,
      char_message:       null,
      user_message:       jpText || null,
      generated:          intent === 'generate',
      gen_mode:           intent === 'generate' ? 'image_generate' : 'image_react',
      is_narrative:       false,
      created_at:         new Date().toISOString(),
    };

    // ユーザーメッセージ（テキスト + 添付画像サムネイル）を先に表示
    appendUserMessageWithImage(jpText, uploadedUrl, tIdx);

    if (intent === 'generate') {
      // ── 参考生成モード ──
      const syncClothing = document.getElementById('attachSyncClothing')?.checked ?? false;

      updateStatusBadge(t('status.translating', '翻訳中…'));
      let enPrompt;
      try {
        enPrompt = await reversePromptFromImage(dataUrl, jpText, syncClothing);
      } catch(e) {
        throw new Error(t('chat.translate_failed', '翻訳に失敗しました: ') + e.message);
      }
      turn.en_prompt = enPrompt;

      // 「服装に反映する」ON のときだけ current_clothing を画像由来の imageTags から更新
      if (syncClothing && activeSession) {
        const imagePart = enPrompt.split(',').slice(-8).join(',').trim();
        if (imagePart) activeSession.current_clothing = imagePart;
      }

      updateStatusBadge(t('status.generating', '画像生成中…'));
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

      // キャラが生成画像を見て反応
      updateStatusBadge(t('status.char_thinking', 'キャラクターが考え中…'));
      let charMsg;
      try {
        charMsg = await getCharResponse(imageUrl, jpText);
      } catch(e) {
        if (e.message === 'ABNORMAL_OUTPUT') {
          turn.char_message = '__ABNORMAL__';
          appendCharMessage('__ABNORMAL__', tIdx);
          await saveTurnToSession(turn);
          showToast(t('chat.abnormal_response', '⚠ 応答が異常でした。長押しして再生成してください'));
          return;
        }
        throw new Error(t('chat.char_response_failed', 'キャラクターの応答に失敗しました: ') + e.message);
      }
      turn.char_message = charMsg;
      if (typeof applyToolInvocationsToTurn === 'function') applyToolInvocationsToTurn(turn);
      if (typeof removeToolIndicator === 'function') removeToolIndicator();
      appendCharMessage(charMsg, tIdx);
      if (typeof renderToolSummary === 'function') renderToolSummary(tIdx, turn.tool_invocations);

    } else {
      // ── 感想モード (react) ──
      updateStatusBadge(t('status.char_thinking', 'キャラクターが考え中…'));
      let charMsg;
      try {
        // data URL は fetch() で取れるため getCharResponse にそのまま渡せる
        charMsg = await getCharResponse(dataUrl, jpText);
      } catch(e) {
        if (e.message === 'ABNORMAL_OUTPUT') {
          turn.char_message = '__ABNORMAL__';
          appendCharMessage('__ABNORMAL__', tIdx);
          await saveTurnToSession(turn);
          showToast(t('chat.abnormal_response', '⚠ 応答が異常でした。長押しして再生成してください'));
          return;
        }
        throw new Error(t('chat.char_response_failed', 'キャラクターの応答に失敗しました: ') + e.message);
      }
      turn.char_message = charMsg;
      if (typeof applyToolInvocationsToTurn === 'function') applyToolInvocationsToTurn(turn);
      if (typeof removeToolIndicator === 'function') removeToolIndicator();
      appendCharMessage(charMsg, tIdx);
      if (typeof renderToolSummary === 'function') renderToolSummary(tIdx, turn.tool_invocations);

      // 服装状態の追跡（感想モードでも服装変化を見逃さない）
      if (!(document.getElementById('userFocusToggle')?.checked ?? false)) {
        try {
          updateStatusBadge(t('status.tracking_state', '状態を確認中…'));
          const trackInput = `User direction: ${jpText || '(no input)'}\nCharacter reaction: ${charMsg}`;
          await trackClothingState(trackInput);
        } catch(e) {
          console.warn('[NookResonance] clothing tracking failed (image-react turn):', e.message);
        }
      }
    }

    await saveTurnToSession(turn);

    // 入力欄クリア
    const inp = document.getElementById('jpInput');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }
    clearAttachedImage();

    if (typeof perTurnAffectionUpdate === 'function') {
      perTurnAffectionUpdate(turn).catch(() => {});
    }

  } catch(e) {
    showToast('❌ ' + (e.message || t('chat.error', 'エラーが発生しました')).slice(0, 60));
    console.error('[Nook] submitTurnWithImage error:', e);
  } finally {
    if (typeof removeToolIndicator === 'function') removeToolIndicator();
    isGenerating = false;
    setBtnState(false);
    updateStatusBadge('SYNC');
  }
}

// ── 添付画像付きユーザーメッセージ描画 ────────
function appendUserMessageWithImage(text, imageUrl, turnIdx = null) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'user-msg';
  if (turnIdx !== null) div.dataset.turnIdx = turnIdx;

  const imgHtml = imageUrl
    ? `<img src="${tokenizeUploadUrl(imageUrl)}" style="max-height:80px; border-radius:6px; display:block; margin-bottom:4px;">`
    : '';
  const textHtml = text ? `<div class="user-bubble">${escHtml(text)}</div>` : '';
  div.innerHTML = `<div class="user-bubble" style="padding:6px;">${imgHtml}${textHtml}</div>`;

  log.appendChild(div);
  scrollLogToBottom();
}
