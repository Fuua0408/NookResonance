/* ═════════════════════════════════════════════
   ComfyDeck Nook — js/modals/backport.js
   プロンプト → キャラ設定バックポート
   ═════════════════════════════════════════════ */

async function openBackportModal(turnIdx) {
  const turn = activeSession?.turns?.[turnIdx];
  const enPrompt = turn?.en_prompt;

  if (!activeChar) {
    showToast(t('toast.no_char', 'キャラクターを選択してください'));
    return;
  }
  if (!enPrompt) {
    showToast(t('backport.no_prompt', 'ENプロンプトがありません'));
    return;
  }

  document.getElementById('backportModal')?.remove();

  const isJP = getCurrentLanguage() === 'ja';

  const modal = document.createElement('div');
  modal.id = 'backportModal';
  modal.style.cssText = `
    position:fixed; inset:0; z-index:500;
    background:rgba(61,46,30,0.4);
    display:flex; align-items:flex-end;
  `;

  const jpBodySection = isJP ? `
    <div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('backport.body_jp_label', '身体JP（appearance_body）')}</div>
      <textarea id="bpBodyJP" rows="3" style="
        width:100%;box-sizing:border-box;
        background:var(--bg-log);border:0.5px solid var(--border-input);
        border-radius:var(--radius-sm);padding:10px 12px;
        font-size:12px;color:var(--text);line-height:1.6;
        font-family:var(--font-sans);resize:vertical;
      "></textarea>
    </div>` : '';

  const jpClothingSection = isJP ? `
    <div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('backport.clothing_jp_label', '服装JP（appearance_clothing）')}</div>
      <textarea id="bpClothingJP" rows="3" style="
        width:100%;box-sizing:border-box;
        background:var(--bg-log);border:0.5px solid var(--border-input);
        border-radius:var(--radius-sm);padding:10px 12px;
        font-size:12px;color:var(--text);line-height:1.6;
        font-family:var(--font-sans);resize:vertical;
      "></textarea>
    </div>` : '';

  modal.innerHTML = `
    <div style="
      width:100%; max-width:560px; margin:0 auto;
      background:var(--bg); border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      display:flex; flex-direction:column; max-height:90vh;
    ">
      <div style="width:36px;height:4px;background:var(--border-input);border-radius:2px;margin:10px auto 0;flex-shrink:0;"></div>
      <div style="padding:12px 16px;display:flex;align-items:center;border-bottom:0.5px solid var(--border);flex-shrink:0;">
        <div style="font-family:var(--font-serif);font-size:16px;font-weight:500;color:var(--text);">📥 ${t('backport.title', 'キャラ設定に保存')}</div>
        <button id="bpClose"
          style="margin-left:auto;width:30px;height:30px;border-radius:50%;background:var(--accent-light);border:none;cursor:pointer;font-size:14px;color:var(--text-mid);">✕</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;">

        <!-- 元プロンプト -->
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('backport.source_label', '元プロンプト')}</div>
          <div id="bpSourcePrompt" style="
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:12px;color:var(--text);line-height:1.6;
            font-family:monospace;user-select:text;-webkit-user-select:text;
          "></div>
        </div>

        <!-- 身体EN -->
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('backport.body_label', '身体EN（appearance_body_en）')}</div>
          <textarea id="bpBody" rows="4" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:12px;color:var(--text);line-height:1.6;
            font-family:monospace;resize:vertical;
          "></textarea>
        </div>

        ${jpBodySection}

        <!-- 服装EN -->
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('backport.clothing_label', '服装EN（appearance_clothing_en）')}</div>
          <textarea id="bpClothing" rows="4" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:12px;color:var(--text);line-height:1.6;
            font-family:monospace;resize:vertical;
          "></textarea>
        </div>

        ${jpClothingSection}

        <!-- 警告 -->
        <div style="
          background:var(--accent-light);border-radius:var(--radius-sm);
          padding:8px 12px;font-size:11px;color:var(--accent);
        ">⚠ ${t('backport.warning', '現在のキャラ設定を上書きします')}</div>

      </div>

      <!-- フッターボタン -->
      <div style="padding:10px 16px 24px;border-top:0.5px solid var(--border);display:flex;gap:8px;flex-shrink:0;">
        <button id="bpCancel" style="
          flex:1;padding:11px;font-size:13px;
          background:var(--accent-light);border:0.5px solid var(--border-input);
          border-radius:var(--radius-md);color:var(--text-mid);cursor:pointer;
          font-family:var(--font-sans);
        ">${t('backport.cancel', 'キャンセル')}</button>
        <button id="bpSave" style="
          flex:2;padding:11px;font-size:13px;
          background:var(--accent);border:none;
          border-radius:var(--radius-md);color:var(--bg);cursor:pointer;
          font-family:var(--font-sans);font-weight:500;
        ">${t('backport.save', '保存')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const sourceEl   = modal.querySelector('#bpSourcePrompt');
  const bodyTA     = modal.querySelector('#bpBody');
  const clothingTA = modal.querySelector('#bpClothing');
  const bodyJPTA   = modal.querySelector('#bpBodyJP');
  const clothingJPTA = modal.querySelector('#bpClothingJP');
  const saveBtn    = modal.querySelector('#bpSave');

  sourceEl.textContent = enPrompt;

  // 分類中の初期状態
  const classifyingText = t('backport.classifying', '分類中…');
  bodyTA.disabled     = true;
  clothingTA.disabled = true;
  bodyTA.value        = classifyingText;
  clothingTA.value    = classifyingText;
  if (isJP) {
    bodyJPTA.disabled     = true;
    clothingJPTA.disabled = true;
    bodyJPTA.value        = classifyingText;
    clothingJPTA.value    = classifyingText;
  }

  const closeModal = () => modal.remove();
  modal.querySelector('#bpClose').addEventListener('click', closeModal);
  modal.querySelector('#bpCancel').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // LLM分類（JP モード時は日本語訳も同時取得）
  const systemPromptEN = `You are a character appearance data classifier for an AI image generator.
Given a comma-separated English prompt, split it into two categories:
1. "body": permanent physical features (hair color, hair style, eye color, body type, skin tone, facial features, etc.)
2. "clothing": outfit and accessories (clothes, shoes, hat, jewelry, bag, etc.)

Rules:
- Output ONLY valid JSON: {"body":"...","clothing":"..."}
- Each value is comma-separated English tags
- If a tag is ambiguous, assign it to the most appropriate category
- Do not include quality tags (masterpiece, best quality, etc.) in either category
- No explanation, no markdown`;

  const systemPromptJP = `You are a character appearance data classifier for an AI image generator.
Given a comma-separated English prompt, split it into two categories and translate each into natural Japanese:
1. "body": permanent physical features (hair color, hair style, eye color, body type, skin tone, facial features, etc.)
2. "clothing": outfit and accessories (clothes, shoes, hat, jewelry, bag, etc.)

Rules:
- Output ONLY valid JSON: {"body":"...","clothing":"...","body_ja":"...","clothing_ja":"..."}
- "body" and "clothing" values are comma-separated English tags
- "body_ja" and "clothing_ja" are natural Japanese descriptions of each category (written in Japanese)
- Do not include quality tags (masterpiece, best quality, etc.) in either category
- No explanation, no markdown`;

  try {
    const noThink = getSetting('noThinkTranslate', false) === true;
    const raw = await getChatCompletion([
      { role: 'system', content: isJP ? systemPromptJP : systemPromptEN },
      { role: 'user',   content: enPrompt },
    ], { noThink });

    const parsed = JSON.parse(cleanLLMResponse(raw));

    bodyTA.value     = (parsed.body     || '').trim();
    clothingTA.value = (parsed.clothing || '').trim();
    if (isJP) {
      bodyJPTA.value     = (parsed.body_ja     || '').trim();
      clothingJPTA.value = (parsed.clothing_ja || '').trim();
    }
  } catch (e) {
    showToast(t('backport.classify_fail', '⚠ LLM分類失敗。手動で入力してください'));
    bodyTA.value     = '';
    clothingTA.value = '';
    if (isJP) {
      bodyJPTA.value     = '';
      clothingJPTA.value = '';
    }
  } finally {
    bodyTA.disabled     = false;
    clothingTA.disabled = false;
    if (isJP) {
      bodyJPTA.disabled     = false;
      clothingJPTA.disabled = false;
    }
  }

  // 保存
  saveBtn.addEventListener('click', async () => {
    saveBtn.textContent = '⏳…';
    saveBtn.disabled    = true;

    try {
      activeChar.appearance_body_en     = bodyTA.value.trim();
      activeChar.appearance_clothing_en = clothingTA.value.trim();
      if (isJP) {
        activeChar.appearance_body     = bodyJPTA.value.trim();
        activeChar.appearance_clothing = clothingJPTA.value.trim();
      }

      const idx = _charsFullCache.findIndex(c => c.id === activeChar.id);
      if (idx >= 0) _charsFullCache[idx] = activeChar;

      await saveChar(activeChar);
      showToast(t('backport.saved', '✓ キャラ設定を更新しました'));
      closeModal();
    } catch (e) {
      showToast('❌ ' + e.message.slice(0, 50));
      saveBtn.textContent = t('backport.save', '保存');
      saveBtn.disabled    = false;
    }
  });
}
