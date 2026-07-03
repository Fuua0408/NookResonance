/* ═════════════════════════════════════════════
   ComfyDeck Nook — js/modals/prompt-edit.js
   プロンプト直接修正モーダル
   ═════════════════════════════════════════════ */

function showPromptDialog(turn) {
  const jp = turn.jp_prompt || t('misc.none', '（なし）');
  const en = turn.en_prompt || t('misc.none', '（なし）');

  document.getElementById('promptModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'promptModal';
  modal.style.cssText = `
    position:fixed; inset:0; z-index:500;
    background:rgba(61,46,30,0.4);
    display:flex; align-items:flex-end;
  `;
  // アンカー情報
  const anchors   = activeSession?.anchors || [];
  const activeIdx = activeSession?.active_anchor_idx ?? -1;
  const anchorInfo = anchors.length
    ? anchors.map((a, i) => `#${i+1} Turn ${a.turn_idx + 1}${i === activeIdx ? ' (' + t('misc.active', 'アクティブ') + ')' : ''}`).join(', ')
    : null;

  modal.innerHTML = `
    <div style="
      width:100%; max-width:560px; margin:0 auto;
      background:var(--bg); border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      display:flex; flex-direction:column; max-height:80vh;
    ">
      <div style="width:36px;height:4px;background:var(--border-input);border-radius:2px;margin:10px auto 0;flex-shrink:0;"></div>
      <div style="padding:12px 16px;display:flex;align-items:center;border-bottom:0.5px solid var(--border);flex-shrink:0;">
        <div style="font-family:var(--font-serif);font-size:16px;font-weight:500;color:var(--text);">${t('prompt.title', 'プロンプト確認')}</div>
        <button id="promptModalClose"
          style="margin-left:auto;width:30px;height:30px;border-radius:50%;background:var(--accent-light);border:none;cursor:pointer;font-size:14px;color:var(--text-mid);">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;">
        ${anchorInfo ? `
        <div style="background:var(--accent-light);border-radius:var(--radius-sm);padding:8px 12px;font-size:11px;color:var(--accent);">
          ${t('misc.anchor_set', '⚓ アンカー設定中：')}${escHtml(anchorInfo)}
        </div>` : ''}
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">JP Prompt</div>
          <div id="promptJP" style="
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            user-select:text;-webkit-user-select:text;
          "></div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">EN Prompt</div>
          <div id="promptEN" style="
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            user-select:text;-webkit-user-select:text;
          "></div>
        </div>
      </div>
      <div style="padding:10px 16px 24px;border-top:0.5px solid var(--border);display:flex;gap:8px;flex-shrink:0;">
        <button id="promptCopyEN"
          style="flex:1;padding:10px;background:var(--accent-light);border:0.5px solid var(--border-input);border-radius:var(--radius-md);font-size:13px;color:var(--text-mid);cursor:pointer;font-family:var(--font-sans);">
          ${t('prompt.copy_en', 'ENをコピー')}
        </button>
        <button id="promptCopyJP"
          style="flex:1;padding:10px;background:var(--accent-light);border:0.5px solid var(--border-input);border-radius:var(--radius-md);font-size:13px;color:var(--text-mid);cursor:pointer;font-family:var(--font-sans);">
          ${t('prompt.copy_jp', 'JPをコピー')}
        </button>
      </div>
    </div>
  `;

  // テキストはtextContentで安全にセット
  modal.querySelector('#promptJP').textContent = jp;
  modal.querySelector('#promptEN').textContent = en;

  // イベントをJSで直接バインド
  modal.querySelector('#promptModalClose').addEventListener('click', () => modal.remove());
  modal.querySelector('#promptCopyEN').addEventListener('click', () =>
    navigator.clipboard.writeText(en).then(() => showToast(t('prompt.copied_en', 'ENをコピーしました'))));
  modal.querySelector('#promptCopyJP').addEventListener('click', () =>
    navigator.clipboard.writeText(jp).then(() => showToast(t('prompt.copied_jp', 'JPをコピーしました'))));
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  document.body.appendChild(modal);
}

async function openPromptEditModal(turnIdx) {
  const turn = activeSession?.turns?.[turnIdx];
  if (!turn) return;

  document.getElementById('promptEditModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'promptEditModal';
  modal.style.cssText = `
    position:fixed; inset:0; z-index:500;
    background:rgba(61,46,30,0.4);
    display:flex; align-items:flex-end;
  `;

  const _isEN = isEnglishMode();

  modal.innerHTML = `
    <div style="
      width:100%; max-width:560px; margin:0 auto;
      background:var(--bg); border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      display:flex; flex-direction:column; max-height:92vh;
    ">
      <div style="width:36px;height:4px;background:var(--border-input);border-radius:2px;margin:10px auto 0;flex-shrink:0;"></div>
      <div style="padding:12px 16px;display:flex;align-items:center;border-bottom:0.5px solid var(--border);flex-shrink:0;">
        <div style="font-family:var(--font-serif);font-size:16px;font-weight:500;color:var(--text);">${t('prompt_edit.title', 'プロンプトを直接修正')}</div>
        <button id="peClose"
          style="margin-left:auto;width:30px;height:30px;border-radius:50%;background:var(--accent-light);border:none;cursor:pointer;font-size:14px;color:var(--text-mid);">✕</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;">

        <!-- 日本語 -->
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('prompt_edit.jp_label', '日本語（任意）')}</div>
          <textarea id="peJP" rows="3" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            font-family:var(--font-sans);resize:vertical;
          " placeholder="${t('prompt_edit.jp_placeholder', '日本語でシーンを記述（任意）')}"></textarea>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <select id="peTranslateMode" style="
              padding:8px 6px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm) 0 0 var(--radius-sm);
              color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);
              border-right:none;flex-shrink:0;
            ">
              <option value="diff">${t('prompt_edit.mode_diff', '差分')}</option>
              <option value="full">${t('prompt_edit.mode_full', 'フル')}</option>
              <option value="direct">${t('prompt_edit.mode_direct', '直訳')}</option>
            </select>
            <button id="peBtnJpToEn" style="
              padding:8px 10px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:0 var(--radius-sm) var(--radius-sm) 0;
              color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;flex-shrink:0;
            ">↓ ${t('prompt_edit.translate', 'JP→EN')}</button>
            <button id="peBtnEnToJp" style="
              flex:1;padding:8px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;
            ">${t('prompt_edit.back_translate', '↑ EN→JP')}</button>
          </div>
        </div>

        <!-- 英語 -->
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('prompt_edit.en_label', '英語（必須）')}</div>
          <textarea id="peEN" rows="5" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:12px;color:var(--text);line-height:1.6;
            font-family:monospace;resize:vertical;
          " placeholder="${t('prompt_edit.en_placeholder', '英語プロンプト（必須）')}"></textarea>
        </div>

        <!-- Seed -->
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">Seed</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <input id="peSeed" type="number" style="
              flex:1;padding:8px 10px;font-size:13px;
              background:var(--bg-log);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text);
              font-family:monospace;
            " placeholder="${t('prompt_edit.seed_placeholder', 'Seed値')}">
            <button id="peBtnRandSeed" style="
              padding:8px 12px;font-size:13px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;
            ">${t('prompt_edit.random_seed', '🎲 ランダム')}</button>
          </div>
          <div id="peSeedNote" style="font-size:11px;color:var(--text-pale);margin-top:4px;">${t('misc.seed_loading', 'Seed取得中…')}</div>
        </div>

        <!-- 外見・場所 -->
        <div style="border-top:0.5px solid var(--border);padding-top:12px;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('prompt_edit.appearance_label', '現在の外見')}</div>
          ${_isEN ? '' : `
          <textarea id="peAppearanceJP" rows="1" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:8px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            font-family:var(--font-sans);resize:vertical;margin-bottom:4px;
          " placeholder="${t('prompt_edit.jp_placeholder_short', '日本語で入力（任意）')}"></textarea>
          <div style="display:flex;gap:6px;margin-bottom:6px;">
            <button id="peBtnAppearanceJpToEn" style="
              flex:1;padding:6px 8px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;
            ">↓ JP→EN</button>
            <button id="peBtnAppearanceEnToJp" style="
              flex:1;padding:6px 8px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;
            ">↑ EN→JP</button>
          </div>`}
          <textarea id="peAppearance" rows="2" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            font-family:var(--font-sans);resize:vertical;
          " placeholder="${t('prompt_edit.appearance_placeholder', '現在の外見を入力')}"></textarea>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('prompt_edit.location_label', '現在の場所')}</div>
          ${_isEN ? '' : `
          <textarea id="peLocationJP" rows="1" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:8px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            font-family:var(--font-sans);resize:vertical;margin-bottom:4px;
          " placeholder="${t('prompt_edit.jp_placeholder_short', '日本語で入力（任意）')}"></textarea>
          <div style="display:flex;gap:6px;margin-bottom:6px;">
            <button id="peBtnLocationJpToEn" style="
              flex:1;padding:6px 8px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;
            ">↓ JP→EN</button>
            <button id="peBtnLocationEnToJp" style="
              flex:1;padding:6px 8px;font-size:12px;
              background:var(--accent-light);border:0.5px solid var(--border-input);
              border-radius:var(--radius-sm);color:var(--text-mid);cursor:pointer;
              font-family:var(--font-sans);white-space:nowrap;
            ">↑ EN→JP</button>
          </div>`}
          <textarea id="peLocation" rows="2" style="
            width:100%;box-sizing:border-box;
            background:var(--bg-log);border:0.5px solid var(--border-input);
            border-radius:var(--radius-sm);padding:10px 12px;
            font-size:13px;color:var(--text);line-height:1.6;
            font-family:var(--font-sans);resize:vertical;
          " placeholder="${t('prompt_edit.location_placeholder', '現在の場所を入力')}"></textarea>
        </div>

        <!-- プレビュー -->
        <div id="pePreviewArea" style="display:none;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;font-weight:500;">${t('prompt_edit.preview_label', 'プレビュー')}</div>
          <div id="pePreviewImg" style="
            width:100%;border-radius:var(--radius-lg);overflow:hidden;
            border:0.5px solid var(--border-input);background:var(--accent-light);
            min-height:80px;display:flex;align-items:center;justify-content:center;
            font-size:12px;color:var(--text-pale);
          ">${t('prompt_edit.preview_placeholder', '生成後に表示されます')}</div>
        </div>

      </div>

      <!-- フッターボタン -->
      <div style="padding:10px 16px 24px;border-top:0.5px solid var(--border);display:flex;gap:8px;flex-shrink:0;">
        <button id="peBtnSaveState" style="
          flex:1;padding:11px;font-size:13px;
          background:var(--accent-light);border:0.5px solid var(--border-input);
          border-radius:var(--radius-md);color:var(--text-mid);cursor:pointer;
          font-family:var(--font-sans);
        ">${t('prompt_edit.save_state', '状態を保存')}</button>
        <button id="peBtnCancel" style="
          flex:1;padding:11px;font-size:13px;
          background:var(--accent-light);border:0.5px solid var(--border-input);
          border-radius:var(--radius-md);color:var(--text-mid);cursor:pointer;
          font-family:var(--font-sans);
        ">${t('cancel', 'キャンセル')}</button>
        <button id="peBtnPreview" style="
          flex:1;padding:11px;font-size:13px;
          background:var(--accent-light);border:0.5px solid var(--border-input);
          border-radius:var(--radius-md);color:var(--accent);cursor:pointer;
          font-family:var(--font-sans);font-weight:500;
        ">${t('prompt_edit.preview', '🖼 プレビュー')}</button>
        <button id="peBtnApply" style="
          flex:2;padding:11px;font-size:13px;
          background:var(--accent);border:none;
          border-radius:var(--radius-md);color:var(--bg);cursor:pointer;
          font-family:var(--font-sans);font-weight:500;
        ">${t('prompt_edit.apply', '差し替え')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 初期値をセット
  const peJP   = modal.querySelector('#peJP');
  const peEN   = modal.querySelector('#peEN');
  const peSeed = modal.querySelector('#peSeed');

  peJP.value = turn.jp_prompt || '';
  peEN.value = turn.en_prompt || '';

  const peAppearance = modal.querySelector('#peAppearance');
  const peLocation   = modal.querySelector('#peLocation');
  peAppearance.value = activeSession?.context?.appearance || activeSession?.current_clothing || '';
  peLocation.value   = activeSession?.context?.location   || activeSession?.current_location || '';

  // Seed初期化: gen_metaがあればそこから即取得、なければhistory逆引き
  const seedNote = modal.querySelector('#peSeedNote');
  if (turn.gen_meta?.seed !== undefined) {
    peSeed.value = turn.gen_meta.seed;
    seedNote.textContent = `(Seed: ${turn.gen_meta.seed})`;
  } else if (turn.image_url) {
    seedNote.textContent = t('misc.seed_loading', 'Seed取得中…');
    fetchSeedFromHistory(turn.image_url).then(seed => {
      if (seed !== null) {
        peSeed.value = seed;
        seedNote.textContent = `(Seed: ${seed})`;
      } else {
        const rnd = Math.floor(Math.random() * 2 ** 32);
        peSeed.value = rnd;
        seedNote.textContent = t('misc.seed_fail', '（Seed取得失敗・ランダム値を設定しました）');
      }
    });
  } else {
    const rnd = Math.floor(Math.random() * 2 ** 32);
    peSeed.value = rnd;
    seedNote.textContent = '';
  }

  // 閉じる
  const closeModal = () => modal.remove();
  modal.querySelector('#peClose').addEventListener('click', closeModal);
  modal.querySelector('#peBtnCancel').addEventListener('click', closeModal);

  // ランダムSeed
  modal.querySelector('#peBtnRandSeed').addEventListener('click', () => {
    peSeed.value = Math.floor(Math.random() * 2 ** 32);
  });

  // JP→EN翻訳（モード切替対応）
  modal.querySelector('#peBtnJpToEn').addEventListener('click', async () => {
    const jpText = peJP.value.trim();
    if (!jpText) { showToast(t('prompt_edit.no_jp', '日本語を入力してください')); return; }

    const mode = modal.querySelector('#peTranslateMode').value;
    const btn  = modal.querySelector('#peBtnJpToEn');
    btn.textContent = '⏳…'; btn.disabled = true;
    try {
      const narrative = isNarrative(jpText);
      let result;

      if (mode === 'diff') {
        // 差分: アンカー＞前ターンEN＞空（初回）
        const anchor = getAnchorEN();
        const prevEN = anchor || (turnIdx === 0 ? '' : (activeSession.turns[turnIdx - 1]?.en_prompt || ''));
        result = await translatePrompt(jpText, prevEN, narrative, { skipStateUpdate: true });

      } else if (mode === 'full') {
        // フル: 外見・quality_tags込みで初回モード相当（prevEN=''）
        result = await translatePrompt(jpText, '', narrative, { skipStateUpdate: true });

      } else {
        // ダイレクト: 外見・quality_tags・前EN一切なし、promptStyleNaturalに従う
        const isNaturalMode = getSetting('promptStyleNatural', true) !== false;
        const sceneText = narrative ? stripNarrative(jpText) : jpText;
        let system;
        if (isNaturalMode) {
          system = [
            'You are a visual scene writer for an AI image generator.',
            narrative ? 'The user input is a narrative/situation description.' : '',
            'Translate the following Japanese into a single cohesive English scene description.',
            'Do not add any character appearance or quality tags — describe only what is given.',
            'Output only the English scene description, nothing else.',
          ].filter(Boolean).join('\n');
        } else {
          system = [
            'Translate the following Japanese text into English tags for image generation.',
            'Output only comma-separated English tags, nothing else. No explanations, no extra text.',
          ].join('\n');
        }
        const raw = await getChatCompletion([
          { role: 'system', content: system },
          { role: 'user',   content: sceneText },
        ], { noThink: true });
        result = cleanLLMResponse(raw);
      }

      peEN.value = result;
      showToast(t('toast.translated', '✓ 翻訳しました'));
    } catch(e) {
      showToast(t('toast.translate_error', '❌ 翻訳エラー: ') + e.message.slice(0, 40));
    } finally {
      btn.textContent = '↓ ' + t('prompt_edit.translate', 'JP→EN'); btn.disabled = false;
    }
  });

  // EN→JP逆変換
  modal.querySelector('#peBtnEnToJp').addEventListener('click', async () => {
    const enText = peEN.value.trim();
    if (!enText) { showToast(t('prompt_edit.no_en', '英語プロンプトを入力してください')); return; }
    const btn = modal.querySelector('#peBtnEnToJp');
    btn.textContent = '⏳…'; btn.disabled = true;
    try {
      const result = await getChatCompletion([
        {
          role: 'system',
          content: 'Translate the following English image generation prompt into natural Japanese. Output only the Japanese translation, nothing else.',
        },
        { role: 'user', content: enText },
      ], { noThink: true });
      peJP.value = cleanLLMResponse(result);
      showToast(t('toast.back_translated', '✓ 逆変換しました'));
    } catch(e) {
      showToast(t('toast.translate_error', '❌ 変換エラー: ') + e.message.slice(0, 40));
    } finally {
      btn.textContent = t('prompt_edit.back_translate', '↑ EN→JP'); btn.disabled = false;
    }
  });

  // isGenerating監視：生成中はプレビュー・差し替えをdisabled
  const btnPreview = modal.querySelector('#peBtnPreview');
  const btnApply   = modal.querySelector('#peBtnApply');
  const _syncGenBtns = () => {
    const busy = isGenerating;
    // 自分自身が生成中（テキストが変わっている）のときは個別に制御するので
    // isGeneratingがtrueかつdisabledでないボタンだけをロック
    if (busy) {
      if (!btnPreview.dataset.selfBusy) btnPreview.disabled = true;
      if (!btnApply.dataset.selfBusy)   btnApply.disabled   = true;
    } else {
      if (!btnPreview.dataset.selfBusy) btnPreview.disabled = false;
      if (!btnApply.dataset.selfBusy)   btnApply.disabled   = false;
    }
  };
  const _genPollTimer = setInterval(_syncGenBtns, 300);
  // モーダルが閉じたらポーリング停止
  const _origCloseModal = closeModal;
  const _patchedClose = () => { clearInterval(_genPollTimer); _origCloseModal(); };
  modal.querySelector('#peClose').removeEventListener('click', _origCloseModal);
  modal.querySelector('#peBtnCancel').removeEventListener('click', _origCloseModal);
  modal.querySelector('#peClose').addEventListener('click', _patchedClose);
  modal.querySelector('#peBtnCancel').addEventListener('click', _patchedClose);

  // 外見・場所の相互翻訳（ENモード以外）
  if (!_isEN) {
    const _stateTranslate = async (jpEl, enEl, jpToEn, btnJp, btnEn) => {
      if (jpToEn) {
        const jpText = jpEl.value.trim();
        if (!jpText) { showToast(t('prompt_edit.no_jp', '日本語を入力してください')); return; }
        btnJp.textContent = '⏳…'; btnJp.disabled = true;
        try {
          const raw = await getChatCompletion([
            { role: 'system', content: 'Translate the following Japanese character appearance or location description into English tags for an AI image generator. Output comma-separated English tags only, nothing else.' },
            { role: 'user',   content: jpText },
          ], { noThink: true });
          enEl.value = cleanLLMResponse(raw);
          showToast(t('toast.translated', '✓ 翻訳しました'));
        } catch(e) {
          showToast(t('toast.translate_error', '❌ 翻訳エラー: ') + e.message.slice(0, 40));
        } finally {
          btnJp.textContent = '↓ JP→EN'; btnJp.disabled = false;
        }
      } else {
        const enText = enEl.value.trim();
        if (!enText) { showToast(t('prompt_edit.no_en', '英語プロンプトを入力してください')); return; }
        btnEn.textContent = '⏳…'; btnEn.disabled = true;
        try {
          const raw = await getChatCompletion([
            { role: 'system', content: 'Translate the following English character appearance or location description into natural Japanese. Output only the Japanese translation, nothing else.' },
            { role: 'user',   content: enText },
          ], { noThink: true });
          jpEl.value = cleanLLMResponse(raw);
          showToast(t('toast.back_translated', '✓ 逆変換しました'));
        } catch(e) {
          showToast(t('toast.translate_error', '❌ 変換エラー: ') + e.message.slice(0, 40));
        } finally {
          btnEn.textContent = '↑ EN→JP'; btnEn.disabled = false;
        }
      }
    };

    const peAppearanceJP = modal.querySelector('#peAppearanceJP');
    const btnAppJpToEn   = modal.querySelector('#peBtnAppearanceJpToEn');
    const btnAppEnToJp   = modal.querySelector('#peBtnAppearanceEnToJp');
    btnAppJpToEn.addEventListener('click', () => _stateTranslate(peAppearanceJP, peAppearance, true,  btnAppJpToEn, btnAppEnToJp));
    btnAppEnToJp.addEventListener('click', () => _stateTranslate(peAppearanceJP, peAppearance, false, btnAppJpToEn, btnAppEnToJp));

    const peLocationJP  = modal.querySelector('#peLocationJP');
    const btnLocJpToEn  = modal.querySelector('#peBtnLocationJpToEn');
    const btnLocEnToJp  = modal.querySelector('#peBtnLocationEnToJp');
    btnLocJpToEn.addEventListener('click', () => _stateTranslate(peLocationJP, peLocation, true,  btnLocJpToEn, btnLocEnToJp));
    btnLocEnToJp.addEventListener('click', () => _stateTranslate(peLocationJP, peLocation, false, btnLocJpToEn, btnLocEnToJp));
  }

  // 状態を保存（ENテキストが空でもappearance/locationだけ保存）
  modal.querySelector('#peBtnSaveState').addEventListener('click', async () => {
    if (!activeSession.context) activeSession.context = { summary: '', appearance: '', location: '' };
    activeSession.context.appearance = peAppearance.value;
    activeSession.context.location   = peLocation.value;
    activeSession.current_clothing   = peAppearance.value;
    activeSession.current_location   = peLocation.value;
    await saveTurnToSession(null);
    showToast(t('toast.state_saved', '✓ 状態を保存しました'));
    _patchedClose();
  });

  // プレビュー生成（モーダル内のみ、チャットに影響なし）
  btnPreview.addEventListener('click', async () => {
    const enText = peEN.value.trim();
    if (!enText) { showToast(t('prompt_edit.no_en', '英語プロンプトを入力してください')); return; }
    if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }

    const seedVal = parseInt(peSeed.value) || null;
    btnPreview.textContent = '⏳…';
    btnPreview.dataset.selfBusy = '1';
    btnPreview.disabled = true;
    btnApply.disabled   = true;

    const previewArea = modal.querySelector('#pePreviewArea');
    const previewImg  = modal.querySelector('#pePreviewImg');
    previewArea.style.display = '';
    previewImg.textContent = t('chat.generating', '生成中…');

    try {
      const { imageUrl } = await generateImage(enText, seedVal);
      previewImg.innerHTML = '';
      const img = document.createElement('img');
      img.src = imageUrl;
      img.style.cssText = 'width:100%;border-radius:var(--radius-lg);display:block;';
      previewImg.appendChild(img);
      modal._previewUrl = imageUrl;
    } catch(e) {
      previewImg.textContent = t('toast.gen_fail', '❌ 生成失敗: ') + e.message.slice(0, 40);
      showToast(t('toast.preview_fail', '❌ プレビュー失敗: ') + e.message.slice(0, 40));
    } finally {
      btnPreview.textContent = t('prompt_edit.preview', '🖼 プレビュー');
      delete btnPreview.dataset.selfBusy;
      btnPreview.disabled = false;
      btnApply.disabled   = false;
    }
  });

  // 差し替え（en_promptとimage_urlのみ更新）
  btnApply.addEventListener('click', async () => {
    const enText = peEN.value.trim();
    if (!enText) { showToast(t('prompt_edit.no_en', '英語プロンプトを入力してください')); return; }
    if (isGenerating) { showToast(t('chat.generating', '生成中です')); return; }

    btnApply.textContent = '⏳…';
    btnApply.dataset.selfBusy = '1';
    btnApply.disabled   = true;
    btnPreview.disabled = true;

    try {
      const seedVal = parseInt(peSeed.value) || null;
      const prevImageUrl = turn.image_url;
      const { imageUrl, meta: editMeta } = await generateImage(enText, seedVal);

      // turn を更新（en_prompt / image_url / gen_meta）
      turn.en_prompt  = enText;
      turn.image_url  = imageUrl;
      turn.gen_meta   = { ...editMeta, anchor_turn_idx: activeSession.active_anchor_idx ?? null };

      // context更新
      if (!activeSession.context) activeSession.context = { summary: '', appearance: '', location: '' };
      activeSession.context.appearance = peAppearance.value;
      activeSession.context.location   = peLocation.value;
      activeSession.current_clothing   = peAppearance.value;
      activeSession.current_location   = peLocation.value;

      // DOM更新
      updateTurnImage(turnIdx, imageUrl);

      // フォトモードの場合はカルーセルも更新
      if (typeof isPhotoMode === 'function' && isPhotoMode()) {
        let slideIdx = _photoCarouselSlides.findIndex(s => s.turnIdx === turnIdx);
        if (slideIdx < 0) {
          slideIdx = _photoCarouselSlides.findIndex(s => s.url === prevImageUrl);
        }
        if (slideIdx >= 0) {
          _photoCarouselSlides[slideIdx].url = imageUrl;
          renderPhotoCarousel();
          photoCarouselGoTo(slideIdx);
        }
        // プロンプト表示も更新
        if (typeof updatePhotoTurnPrompt === 'function') updatePhotoTurnPrompt(turnIdx, enText);
      }

      // サーバー保存
      await saveTurnToSession(null);

      showToast(t('toast.prompt_replaced', '✓ プロンプトと画像を差し替えました'));
      _patchedClose();
    } catch(e) {
      showToast('❌ ' + e.message.slice(0, 50));
      btnApply.textContent = t('prompt_edit.apply', '差し替え');
      delete btnApply.dataset.selfBusy;
      btnApply.disabled   = false;
      btnPreview.disabled = false;
    }
  });
}
