/* ═════════════════════════════════════════════
   NookResonance — js/modals/handover.js
   引き継ぎシステム（セッション終了時のLLM要約・適用）
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 引き継ぎ実行（セッションメニューから呼ぶ）
// ─────────────────────────────────────────────
async function openHandover() {
  if (!activeChar || !activeSession) {
    showToast(t('session.selected_required', 'セッションを選択してください')); return;
  }
  if (!activeSession.turns?.length) {
    showToast(t('turn.none', 'ターンがありません')); return;
  }
  if (!isCharAffectionEnabled(activeChar)) {
    showToast(t('handover.affection_disabled', 'このキャラクターの親愛度が無効です')); return;
  }

  // 確認モーダルを開いてローディング表示
  openModal('handoverOverlay');
  _renderHandoverLoading();

  try {
    const result = await _analyzeSession();
    _renderHandoverUI(result);
  } catch(e) {
    _renderHandoverError(e.message);
  }
}

// 任意のセッションを対象に引き継ぎを開く
async function openHandoverFor(charId, sessionId) {
  if (!activeChar) { showToast(t('chat.no_char', 'キャラクターを選択してください')); return; }

  // 現在のセッションならそのまま
  if (activeSession?.id === sessionId) {
    return openHandover();
  }

  // 別セッションならREST取得して一時的にactiveSessionに設定
  if (!isRestEnabled()) { showToast(t('rest.required', 'REST接続が必要です')); return; }
  try {
    updateStatusBadge('読み込み中…');
    const session = await restGet(`sessions/${charId}/${sessionId}`);
    if (!session.turns?.length) { showToast(t('turn.none', 'ターンがありません')); return; }

    const prevSession = activeSession;
    activeSession = session;

    openModal('handoverOverlay');
    _renderHandoverLoading();

    try {
      const result = await _analyzeSession();
      _renderHandoverUI(result);
    } catch(e) {
      _renderHandoverError(e.message);
      activeSession = prevSession;
    }
  } catch(e) {
    showToast(t('session.fetch_failed', '❌ セッション取得失敗: ') + e.message.slice(0, 40));
  } finally {
    updateStatusBadge('SYNC');
  }
}

// ─────────────────────────────────────────────
// LLMでセッションを解析（3段構えの推論）
// ─────────────────────────────────────────────
async function _analyzeSession() {
  const char       = activeChar;
  const turns      = activeSession.turns;
  const affValue   = char.affection ?? 130;
  const stageLabel = typeof affectionLabel    === 'function' ? affectionLabel(affValue)    : '';
  const llmLabel   = typeof affectionLLMLabel === 'function' ? affectionLLMLabel(affValue) : '';
  const notes      = char.memory_notes || [];
  const lastState  = char.last_state   || {};

  // セッション内容をテキスト化
  const sessionText = turns.slice(-20).map(t => {
    const parts = [];
    if (t.user_message) parts.push(`ユーザー: ${t.user_message}`);
    if (t.char_message)  parts.push(`${char.name}: ${t.char_message}`);
    if (t.jp_prompt)     parts.push(`（シーン: ${t.jp_prompt}）`);
    return parts.join('\n');
  }).join('\n\n');

  const charContext = isEnglishMode()
    ? `Character: ${char.name}
Current affection: ${stageLabel} (${llmLabel})
First meeting: ${char.is_first_meeting !== false ? 'yes' : 'no'}
Current memory notes: ${notes.length ? notes.map(n => `\n  - ${n}`).join('') : '(none)'}
Current appearance: ${lastState.appearance || '(not set)'}
Current location: ${lastState.location   || '(not set)'}`
    : `キャラクター名: ${char.name}
現在の親愛度: ${stageLabel}（${llmLabel}）
初対面: ${char.is_first_meeting !== false ? 'はい' : 'いいえ'}
現在の記憶メモ: ${notes.length ? notes.map(n => `\n  - ${n}`).join('') : '（なし）'}
現在の外見: ${lastState.appearance || '（未設定）'}
現在の場所: ${lastState.location   || '（未設定）'}`;

  // ── Step 1: このセッションで何があったか ──
  _renderHandoverProgress(t('status.handover_1', 'セッションの内容を読んでいます… (1/5)'));
  const step1System = isEnglishMode()
    ? `You are an assistant analyzing a conversation session with a character.\n${charContext}\nRead the session content and summarize what happened in 3-5 sentences.`
    : `あなたはキャラクターとの会話セッションを分析するアシスタントです。\n${charContext}\n\n以下のセッション内容を読んで、このセッションでどんな出来事があったかを3〜5文で要約してください。`;
  const step1 = await getChatCompletion([
    { role: 'system', content: step1System },
    { role: 'user',   content: sessionText },
  ]);
  let summary = cleanLLMResponse(step1);
  if (typeof isAbnormalOutput === 'function' && isAbnormalOutput(summary)) {
    _renderHandoverProgress(t('status.handover_retry', 'リカバリー試行中… ') + '(1/5)');
    summary = cleanLLMResponse(await extractJapaneseResponse(step1)) || summary;
  }

  // ── Step 2: 関係性への影響の説明 ──
  _renderHandoverProgress(t('status.handover_2', '関係性への影響を分析しています… (2/5)'));
  const step2System = isEnglishMode()
    ? `You are an assistant analyzing the relationship with a character.\n${charContext}`
    : `あなたはキャラクターとの関係性を分析するアシスタントです。\n${charContext}`;
  const step2User = isEnglishMode()
    ? `Session summary:\n${summary}\n\nHow did the relationship (affection) with ${char.name} change through this session? Explain in 2-3 sentences including the reason.`
    : `セッションの要約:\n${summary}\n\nこのセッションを通じて、${char.name}との関係性（親愛度）はどのように変化しましたか？理由も含めて2〜3文で説明してください。`;
  const step2 = await getChatCompletion([
    { role: 'system', content: step2System },
    { role: 'user',   content: step2User },
  ]);
  let affection_reason = cleanLLMResponse(step2);
  if (typeof isAbnormalOutput === 'function' && isAbnormalOutput(affection_reason)) {
    _renderHandoverProgress(t('status.handover_retry', 'リカバリー試行中… ') + '(2/5)');
    affection_reason = cleanLLMResponse(await extractJapaneseResponse(step2)) || affection_reason;
  }

  // ── Step 3a: 親愛度の増減値 ──
  _renderHandoverProgress(t('status.handover_3', '親愛度の増減値を計算しています… (3/5)'));
  const isPerTurn = typeof isAffectionPerTurn === 'function' && isAffectionPerTurn();
  const affRange  = isPerTurn ? 10 : 20;
  const step3aSystem = isEnglishMode()
    ? `You are a data extraction assistant. Read the analysis results and return only a single integer for the affection change. Range: -${affRange} to +${affRange}. Examples: 5, -3, 0`
    : `あなたはデータ抽出アシスタントです。以下の分析結果から親愛度の増減値を数値のみで答えてください。-${affRange}〜+${affRange}の整数1つだけ返してください。例: 5 や -3 や 0`;
  const step3a = await getChatCompletion([
    { role: 'system', content: step3aSystem },
    { role: 'user',   content: `セッション要約:\n${summary}\n\n関係性の変化:\n${affection_reason}\n\n親愛度の増減値（整数のみ）:` },
  ], { noThink: true });
  const affection_delta = Math.max(-affRange, Math.min(affRange, parseInt(cleanLLMResponse(step3a).replace(/[^-\d]/g, '')) || 0));

  // ── Step 3b: キャラクターの現在の状態 ──
  _renderHandoverProgress(t('status.handover_4', 'キャラクターの状態を確認しています… (4/5)'));
  const step3bSystem = isEnglishMode()
    ? `You are a character state management assistant.\n${charContext}`
    : `あなたはキャラクターの状態管理アシスタントです。\n${charContext}`;
  const step3bUser = isEnglishMode()
    ? `Session summary:\n${summary}\n\nDescribe the state of ${char.name} after this session in the following format:\nAppearance: (new appearance if changed, otherwise current appearance)\nLocation: (current location)\nMemory notes: (1-3 items of new information worth remembering for the next session)`
    : `セッション要約:\n${summary}\n\nこのセッション後の${char.name}の状態を以下の形式で答えてください:\n外見: （変化があれば新しい外見、なければ現在の外見をそのまま）\n場所: （現在いる場所）\n記憶メモ: （このセッションで新たに判明したこと・重要な出来事・ユーザーの好みや習慣・キャラクターの感情変化など、次回セッションに活かせる情報を1〜3件。些細なことでも積極的に記録すること）`;
  const step3b = await getChatCompletion([
    { role: 'system', content: step3bSystem },
    { role: 'user',   content: step3bUser },
  ]);
  let step3bText = cleanLLMResponse(step3b);
  if (typeof isAbnormalOutput === 'function' && isAbnormalOutput(step3bText)) {
    _renderHandoverProgress(t('status.handover_retry', 'リカバリー試行中… ') + '(4/5)');
    step3bText = cleanLLMResponse(await extractJapaneseResponse(step3b)) || step3bText;
  }

  // 各行をパース
  const extractLine = isEnglishMode()
    ? (label) => {
        const m = step3bText.match(new RegExp(`${label}[：:]?\\s*(.+)`));
        return m ? m[1].trim() : '';
      }
    : (label) => {
        const m = step3bText.match(new RegExp(`${label}[：:]\\s*(.+)`));
        return m ? m[1].trim() : '';
      };

  const appearance = isEnglishMode()
    ? extractLine('Appearance') || lastState.appearance || ''
    : extractLine('外見')       || lastState.appearance || '';
  const location = isEnglishMode()
    ? extractLine('Location')   || lastState.location   || ''
    : extractLine('場所')       || lastState.location   || '';
  const notesRaw = isEnglishMode()
    ? extractLine('Memory notes')
    : extractLine('記憶メモ');
  const new_notes  = !notesRaw || notesRaw === 'なし' || (isEnglishMode() && notesRaw === '(none)') ? [] :
    notesRaw.split(/[、,\n]/).map(n => n.replace(/^[-・\d.]\s*/, '').trim()).filter(Boolean);

  // ── Step 4: 次回オープニングメッセージ提案 ──
  _renderHandoverProgress(t('status.handover_5', '次回の挨拶を考えています… (5/5)'));
  const step4System = isEnglishMode()
    ? `You are the character "${char.name}".
${char.personality || ''}
Generate a greeting for the start of the next session.
Based on the previous session content, write 1-3 sentences in the character's voice.
Return only the dialogue, no narration or explanation.`
    : `あなたは「${char.name}」というキャラクターです。\n${char.personality || ''}\n\n次のセッション開始時にユーザーに話しかける一言を生成してください。\n今回のセッション内容を踏まえた自然なセリフを、キャラクターの口調で1〜3文で返してください。地の文や説明は不要です。セリフのみ返してください。`;
  const step4User = isEnglishMode()
    ? `Previous session summary:\n${summary}\n\nGreeting for the next session start:`
    : `前回のセッション要約:\n${summary}\n\n次回セッション開始時の一言:`;
  const step4 = await getChatCompletion([
    { role: 'system', content: step4System },
    { role: 'user',   content: step4User },
  ]);
  let opening_message = cleanLLMResponse(step4);
  if (typeof isAbnormalOutput === 'function' && isAbnormalOutput(opening_message)) {
    _renderHandoverProgress(t('status.handover_retry', 'リカバリー試行中… ') + '(5/5)');
    opening_message = cleanLLMResponse(await extractJapaneseResponse(step4)) || opening_message;
  }

  return {
    summary,
    new_notes,
    affection_delta,
    affection_reason,
    appearance,
    location,
    is_first_meeting: false,
    opening_message,
  };
}

// ─────────────────────────────────────────────
// 引き継ぎ確認UIを描画
// ─────────────────────────────────────────────
function _renderHandoverUI(result) {
  const body = document.getElementById('handoverBody');
  if (!body) return;

  const char      = activeChar;
  const affValue   = char.affection ?? 130;
  const initAff    = activeSession?.initial_affection ?? affValue;
  const newAff     = Math.max(0, Math.min(255, affValue + result.affection_delta));
  const stageInit  = typeof affectionLabel === 'function' ? affectionLabel(initAff) : '';
  const stageNow   = typeof affectionLabel === 'function' ? affectionLabel(affValue)  : '';
  const stageNew   = typeof affectionLabel === 'function' ? affectionLabel(newAff)    : '';
  const totalDelta = newAff - initAff;  // セッション開始からの総変動
  const notes     = char.memory_notes || [];
  const lastState = char.last_state   || {};

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;padding:16px;">

      <!-- セッション概要 -->
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="handoverSummaryCheck" checked
            style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
          <div class="section-label" style="margin:0;">${t('handover.carry_summary', 'セッション概要を次回に持ち越す')}</div>
        </div>
        <textarea id="handoverSummary" rows="3" style="
          width:100%;box-sizing:border-box;
          background:var(--bg-log);border:0.5px solid var(--border-input);
          border-radius:var(--radius-sm);padding:8px 10px;
          font-size:12px;color:var(--text);line-height:1.6;
          font-family:var(--font-sans);resize:vertical;
        ">${escHtml(result.summary)}</textarea>
      </div>

      <!-- 追加メモ -->
      <div>
        <div class="section-label">${t('handover.added_notes', '追加される記憶メモ')}</div>
        <div id="handoverNotes" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
          ${result.new_notes.length
            ? result.new_notes.map((n, i) => `
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="handoverNote${i}" checked
                  style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
                <label for="handoverNote${i}" id="handoverNoteLabel${i}"
                  style="font-size:13px;color:var(--text);line-height:1.5;cursor:pointer;"
                  contenteditable="true">${escHtml(n)}</label>
              </div>`).join('')
            : `<div style="font-size:12px;color:var(--text-pale);">${t('handover.no_new_notes', '特に記憶すべき新しい情報はありませんでした')}</div>`
          }
        </div>
      </div>

      <!-- 親愛度 -->
      <div>
        <div class="section-label">${t('handover.affection', '親愛度の変化')}</div>
        <div style="margin-top:6px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <input type="checkbox" id="handoverAffectionCheck" ${result.affection_delta !== 0 ? 'checked' : ''}
              style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
            <span style="font-size:13px;color:var(--text);">
              ${stageInit}（${initAff}） → ${stageNew}（${newAff}）
              ${totalDelta > 0 ? `<span style="color:#5a8040;">(${t('handover.session_total', 'セッション計')} +${totalDelta})</span>` :
                totalDelta < 0 ? `<span style="color:var(--accent);">(${t('handover.session_total', 'セッション計')} ${totalDelta})</span>` :
                `<span style="color:var(--text-pale);">(${t('handover.no_change', '変化なし')})</span>`}
            </span>
          </div>
          ${result.affection_reason ? `
          <div style="font-size:12px;color:var(--text-dim);padding-left:24px;line-height:1.6;">
            ${escHtml(result.affection_reason)}
          </div>` : ''}
        </div>
      </div>

      <!-- 外見 -->
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="handoverAppearanceCheck"
            ${result.appearance && result.appearance !== (char.last_state?.appearance || '') ? 'checked' : ''}
            style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
          <div class="section-label" style="margin:0;">${t('handover.appearance', '外見の引き継ぎ')}</div>
        </div>
        <textarea id="handoverAppearance" rows="2" style="
          width:100%;box-sizing:border-box;
          background:var(--bg-log);border:0.5px solid var(--border-input);
          border-radius:var(--radius-sm);padding:8px 10px;
          font-size:13px;color:var(--text);line-height:1.6;
          font-family:var(--font-sans);resize:vertical;
        ">${escHtml(result.appearance)}</textarea>
      </div>

      <!-- 場所 -->
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="handoverLocationCheck"
            ${result.location && result.location !== (char.last_state?.location || '') ? 'checked' : ''}
            style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
          <div class="section-label" style="margin:0;">${t('handover.location', '場所の引き継ぎ')}</div>
        </div>
        <input id="handoverLocation" type="text" class="f-input"
          value="${escHtml(result.location)}"
          placeholder="${t('handover.location_placeholder', 'カフェのテラス席など')}">
      </div>

      <!-- 初対面フラグ -->
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="handoverFirstMeeting"
          style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
        <label for="handoverFirstMeeting" style="font-size:13px;color:var(--text);cursor:pointer;">
          ${t('handover.first_meeting', '次回も初対面として扱う')}
        </label>
      </div>

      <!-- オープニングメッセージ -->
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="handoverOpeningCheck" checked
            style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
          <div class="section-label" style="margin:0;">${t('handover.opening', '次回のオープニングメッセージ')}</div>
        </div>
        <textarea id="handoverOpeningMessage" rows="3" style="
          width:100%;box-sizing:border-box;
          background:var(--bg-log);border:0.5px solid var(--border-input);
          border-radius:var(--radius-sm);padding:8px 10px;
          font-size:13px;color:var(--text);line-height:1.6;
          font-family:var(--font-sans);resize:vertical;
        ">${escHtml(result.opening_message || '')}</textarea>
      </div>

    </div>
  `;

  // 適用ボタンのデータ保存
  document.getElementById('handoverOverlay').dataset.delta    = result.affection_delta;
  document.getElementById('handoverOverlay').dataset.newNotes = JSON.stringify(result.new_notes);
  document.getElementById('handoverOverlay').dataset.summary  = result.summary || '';
}

// ─────────────────────────────────────────────
// 引き継ぎを適用
// ─────────────────────────────────────────────
async function applyHandover() {
  const char   = activeChar;
  if (!char) return;

  const overlay  = document.getElementById('handoverOverlay');
  const delta    = parseInt(overlay?.dataset.delta) || 0;
  const allNotes = JSON.parse(overlay?.dataset.newNotes || '[]');

  // チェックされたメモだけ収集
  const newNotes = allNotes.filter((_, i) => {
    return document.getElementById(`handoverNote${i}`)?.checked;
  }).map((_, i) => {
    return document.getElementById(`handoverNoteLabel${i}`)?.textContent?.trim() || allNotes[i];
  });

  // 親愛度更新
  if (document.getElementById('handoverAffectionCheck')?.checked && delta !== 0) {
    const newVal = Math.max(0, Math.min(255, (char.affection ?? 130) + delta));
    char.affection = newVal;
  }

  // 記憶メモ追加（キャラに保持）
  const existingNotes = char.memory_notes || [];
  char.memory_notes = [...existingNotes, ...newNotes];

  // 外見・場所・概要 → セッションcontextに移すため値を取り出す
  const appearance = document.getElementById('handoverAppearanceCheck')?.checked
    ? (document.getElementById('handoverAppearance')?.value?.trim() || '')
    : '';
  const location = document.getElementById('handoverLocationCheck')?.checked
    ? (document.getElementById('handoverLocation')?.value?.trim() || '')
    : '';
  const summaryCheck = document.getElementById('handoverSummaryCheck');
  const summaryText  = document.getElementById('handoverSummary')?.value?.trim() || '';
  const summary      = (summaryCheck?.checked && summaryText) ? summaryText : '';

  // キャラ側の引き継ぎ情報をクリア
  char.last_session_summary = '';
  char.last_state           = { appearance: '', location: '' };
  char.is_first_meeting     = document.getElementById('handoverFirstMeeting')?.checked ?? false;

  // オープニングメッセージ
  const openingCheck = document.getElementById('handoverOpeningCheck');
  const openingText  = document.getElementById('handoverOpeningMessage')?.value?.trim() || '';
  char.opening_message = (openingCheck?.checked && openingText) ? openingText : '';

  // サーバー保存
  try {
    await saveChar(char);
  } catch(e) {
    showToast(t('handover.saved_fail', '⚠ 保存に失敗しました: ') + e.message.slice(0, 40));
    return;
  }

  closeModal('handoverOverlay');

  // 新セッション自動開始
  clearChatLog();
  if (typeof updatePhotoUI === 'function') updatePhotoUI();
  initSession();
  appendDateSep(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }));

  // セッションのcontextに引き継ぎ情報を格納
  if (activeSession) {
    activeSession.context = { summary, appearance, location };
    // 引き継ぎ場所・服装をキャッシュに設定
    if (location) activeSession.current_location = location;
    if (activeChar?.appearance_clothing_en) activeSession.current_clothing = activeChar.appearance_clothing_en.trim();
  }

  showToast(t('handover.applied', '✓ 引き継ぎを適用しました'));

  // オープニングメッセージ表示
  const openingMsg = activeChar?.opening_message?.trim();
  if (openingMsg) {
    setTimeout(async () => {
      const tIdx = activeSession.turns.length;
      appendCharMessage(openingMsg, tIdx);
      const turn = {
        turn_id:      tIdx + 1,
        jp_prompt:    null, en_prompt: null, image_url: null,
        user_message: null, char_message: openingMsg,
        is_narrative: false, gen_mode: null,
      };
      activeSession.turns.push(turn);
      await saveTurnToSession(null).catch(() => {});
    }, 300);
  }

  // 引き継ぎ情報があれば[i]モーダルを自動表示
  if (typeof autoShowCharInfoIfNeeded === 'function') autoShowCharInfoIfNeeded();
}

// ─────────────────────────────────────────────
// ローディング・エラー表示
// ─────────────────────────────────────────────
function _renderHandoverLoading() {
  const body = document.getElementById('handoverBody');
  if (body) body.innerHTML = `
    <div style="text-align:center;padding:48px 16px;color:var(--text-pale);">
      <div style="font-size:13px;" id="handoverProgressMsg">${t('handover.loading', 'セッションを解析中…')}</div>
      <div style="font-size:11px;margin-top:8px;">${t('handover.wait', 'しばらくお待ちください')}</div>
    </div>`;
}
function _renderHandoverProgress(msg) {
  const el = document.getElementById('handoverProgressMsg');
  if (el) { el.textContent = msg; return; }
  // まだローディング画面がなければ作る
  _renderHandoverLoading();
  const el2 = document.getElementById('handoverProgressMsg');
  if (el2) el2.textContent = msg;
}
function _renderHandoverError(msg) {
  const body = document.getElementById('handoverBody');
  if (body) body.innerHTML = `
    <div style="text-align:center;padding:48px 16px;">
      <div style="font-size:13px;color:var(--accent);">❌ ${escHtml(msg.slice(0, 80))}</div>
    </div>`;
}
