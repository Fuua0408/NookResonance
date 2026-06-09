/* ═════════════════════════════════════════════
   ComfyDeck Nook — llm.js
   LLM呼び出し・翻訳・キャラ反応システム
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// テキストユーティリティ
// ─────────────────────────────────────────────
function isNarrative(text) {
  return /^\*[^*].+\*$/.test(text.trim());
}
function stripNarrative(text) {
  return text.trim().replace(/^\*|\*$/g, '').trim();
}

// ─────────────────────────────────────────────
// LLM基本呼び出し・Vision補助
// ─────────────────────────────────────────────
async function imageUrlToBase64(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function getChatCompletion(messages, { noThink = false } = {}) {
  const data = await restPost('llm/chat', { messages, noThink });
  if (data.error) throw new Error(data.error);
  return (data.text || '').trim();
}
function cleanLLMResponse(text) {
  if (!text) return '';

  // <thought/>が含まれる場合はその後ろを本文として取得
  if (/<thought\s*\/>/i.test(text)) {
    text = text.replace(/^[\s\S]*?<thought\s*\/>/i, '').trim();
  }

  // <channel|>が含まれる場合はその後ろを本文として取得
  if (/<channel\|>/i.test(text)) {
    text = text.replace(/^[\s\S]*?<channel\|>/i, '').trim();
  }

  return text
    // Gemma3以前の思考タグ
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/\[think\][\s\S]*?\[\/think\]/gi, '')
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '')
    // Gemma4の思考タグ（<|channel>thought ～ <channel|>）
    .replace(/<\|channel>thought[\s\S]*?<channel\|>/gi, '')
    .replace(/<\|channel>[\s\S]*?<channel\|>/gi, '')
    .replace(/<\|.*?\|>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^(描写[:：]|scene[:：])/im, '')
    // 自己修正・メタコメントを除去
    .replace(/\(Wait[,\s][\s\S]*/i, '')
    .replace(/\*\*(Refined|Note|Final|Actually|Wait)[\s\S]*/i, '')
    .replace(/\n\n\*\*[\s\S]*/g, '')
    // _empty_ などのプレースホルダーを除去
    .replace(/_empty_/gi, '')
    .replace(/\._[a-z_]+_/gi, '')
    // 長すぎる単語（30文字以上・スペースなし）を除去
    .replace(/\b[a-zA-Z]{30,}\b/g, '')
    .trim();
}

// ─────────────────────────────────────────────
// 翻訳システム
// ─────────────────────────────────────────────
async function translatePrompt(jpText, prevEN = '', narrative = false) {
  const charAppearanceEN         = activeChar?.appearance_en?.trim()                  || '';
  const charAppearanceBodyEN     = activeChar?.appearance_body_en?.trim()              || charAppearanceEN;
  const charAppearanceClothingEN = activeChar?.appearance_clothing_en?.trim()          || '';
  const qualityTags              = activeChar?.workflow_params?.quality_tags?.trim()   || getSetting('global_quality_tags', '');
  const isNaturalMode    = getSetting('promptStyleNatural', true) !== false;
  const noThink          = true; // 翻訳系は常に思考スキップ
  const isUserFocus      = document.getElementById('userFocusToggle')?.checked ?? false;
  const sceneText        = narrative ? stripNarrative(jpText) : jpText;

  const up = activeChar?.user_profile || {};
  const userAppearanceEN = up.appearance_en || getSetting('userAppearanceEn', '') || '';
  const bodyEN     = isUserFocus ? userAppearanceEN : charAppearanceBodyEN;
  const appearanceEN = isUserFocus ? userAppearanceEN : charAppearanceEN;

  // ── Step 1: 服装の状態判定 ──
  const prevClothing = activeSession?.current_clothing || charAppearanceClothingEN || '';
  let currentClothing = prevClothing;
  if (!isUserFocus) {
    const clothingResult = await getChatCompletion([
      { role: 'system', content: `You are analyzing a scene description to determine clothing changes.
Current clothing: "${prevClothing}"
Rules:
- If clothing has changed, return ONLY the clothes currently being worn in English tags format
- Do NOT include any clothes that have been removed or taken off
- If tops, bottoms, AND innerwear are all removed, return exactly: naked
- If NO clothing change is described, return exactly: NO_CHANGE
- If socks or shoes are removed, exclude them from the output. But socks/shoes do NOT count toward the "naked" determination
- Return only the clothing tags, "naked", or "NO_CHANGE". Nothing else.` },
      { role: 'user', content: sceneText },
    ], { noThink });
    const clothingRaw = cleanLLMResponse(clothingResult);
    if (clothingRaw !== 'NO_CHANGE' && clothingRaw.length > 0) {
      currentClothing = clothingRaw;
      if (activeSession) activeSession.current_clothing = currentClothing;
    }
  }

  // ── Step 2: 場所の状態判定 ──
  const prevLocation = activeSession?.current_location || activeSession?.context?.location || '';
  let currentLocation = prevLocation;
  const locationResult = await getChatCompletion([
    { role: 'system', content: `You are analyzing a scene description to determine location changes.
Current location: "${prevLocation}"
If the location has changed, return the new location description in English (brief, natural language).
If NO location change is described, return exactly: NO_CHANGE
Return only the location description or NO_CHANGE, nothing else.` },
    { role: 'user', content: sceneText },
  ], { noThink });
  const locationRaw = cleanLLMResponse(locationResult);
  if (locationRaw !== 'NO_CHANGE' && locationRaw.length > 0) {
    currentLocation = locationRaw;
    if (activeSession) activeSession.current_location = currentLocation;
  }

  // ── Step 3: プロンプト生成 ──
  if (isNaturalMode) {
    const contextParts = [];
    if (bodyEN)          contextParts.push(isUserFocus ? `User physical appearance (always preserve): ${bodyEN}` : `Character physical appearance (always preserve): ${bodyEN}`);
    if (currentClothing) contextParts.push(`Current clothing: ${currentClothing}`);
    if (currentLocation) contextParts.push(`Current location: ${currentLocation}`);
    // 初回のみ場所を contextParts から（差分モードは上で更新済み）
    if (qualityTags)     contextParts.push(`Quality tags: ${qualityTags}`);
    const context = contextParts.join('\n');

    const styleRef = prevEN ? `\nStyle reference (for writing style only): "${prevEN}"\n` : '';
    const system = `You are a visual scene writer for an AI image generator.
Write a single cohesive English scene description based on the scene.
${context ? `\n${context}\n` : ''}${styleRef}Rules:
- Physical appearance must be preserved exactly as specified
- Use the current clothing and location as specified above
- Describe pose, action, expression, and emotional state from the scene
- Match the writing style of the style reference if provided
- Do NOT include any dialogue, speech, or quoted text (no 「」"" or similar)
- Keep the description under 300 words total
- Output only the scene description, nothing else`;

    const result = await getChatCompletion([
      { role: 'system', content: system },
      { role: 'user',   content: sceneText },
    ], { noThink });
    return cleanLLMResponse(result);
  }

  // タグモード
  const system = `You are an image generation prompt expert using tag-based prompts.
Translate the user's Japanese scene description into English tags.
${narrative ? 'The input is a narrative/situation description.' : ''}
Output only comma-separated English tags, nothing else.`;
  const result = await getChatCompletion([
    { role: 'system', content: system },
    { role: 'user',   content: sceneText },
  ], { noThink });
  const sceneEN = cleanLLMResponse(result);
  return [qualityTags, bodyEN, currentClothing, sceneEN].filter(Boolean).join(', ');
}

async function translatePromptCharMode(userJP, charMsg, prevEN = '', narrative = false) {
  const charAppearanceEN         = activeChar?.appearance_en?.trim()                  || '';
  const charAppearanceBodyEN     = activeChar?.appearance_body_en?.trim()              || charAppearanceEN;
  const charAppearanceClothingEN = activeChar?.appearance_clothing_en?.trim()          || '';
  const qualityTags              = activeChar?.workflow_params?.quality_tags?.trim()   || getSetting('global_quality_tags', '');
  const isNaturalMode    = getSetting('promptStyleNatural', true) !== false;
  const noThink          = true; // 翻訳系は常に思考スキップ
  const isUserFocus      = document.getElementById('userFocusToggle')?.checked ?? false;

  const up = activeChar?.user_profile || {};
  const userAppearanceEN = up.appearance_en || getSetting('userAppearanceEn', '') || '';
  const bodyEN = isUserFocus ? userAppearanceEN : charAppearanceBodyEN;

  const inputText = isUserFocus
    ? `Scene: ${userJP}`
    : `User direction: ${userJP}\nCharacter reaction: ${charMsg}`;

  // ── Step 1: 服装の状態判定 ──
  const prevClothing = activeSession?.current_clothing || charAppearanceClothingEN || '';
  let currentClothing = prevClothing;
  if (!isUserFocus) {
    const clothingResult = await getChatCompletion([
      { role: 'system', content: `You are analyzing a scene to determine clothing changes.
Current clothing: "${prevClothing}"
Rules:
- If clothing has changed, return ONLY the clothes currently being worn in English tags format
- Do NOT include any clothes that have been removed or taken off
- If tops, bottoms, AND innerwear are all removed, return exactly: naked
- If NO clothing change is described, return exactly: NO_CHANGE
- If socks or shoes are removed, exclude them from the output. But socks/shoes do NOT count toward the "naked" determination
- Return only the clothing tags, "naked", or "NO_CHANGE". Nothing else.` },
      { role: 'user', content: inputText },
    ], { noThink });
    const clothingRaw = cleanLLMResponse(clothingResult);
    if (clothingRaw !== 'NO_CHANGE' && clothingRaw.length > 0) {
      currentClothing = clothingRaw;
      if (activeSession) activeSession.current_clothing = currentClothing;
    }
  }

  // ── Step 2: 場所の状態判定 ──
  const prevLocation = activeSession?.current_location || activeSession?.context?.location || '';
  let currentLocation = prevLocation;
  const locationResult = await getChatCompletion([
    { role: 'system', content: `You are analyzing a scene to determine location changes.
Current location: "${prevLocation}"
If the location has changed, return the new location description in English.
If NO location change is described, return exactly: NO_CHANGE
Return only the location description or NO_CHANGE, nothing else.` },
    { role: 'user', content: inputText },
  ], { noThink });
  const locationRaw = cleanLLMResponse(locationResult);
  if (locationRaw !== 'NO_CHANGE' && locationRaw.length > 0) {
    currentLocation = locationRaw;
    if (activeSession) activeSession.current_location = currentLocation;
  }

  // ── Step 3: プロンプト生成 ──
  if (isNaturalMode) {
    const contextParts = [];
    if (bodyEN)          contextParts.push(`${isUserFocus ? 'User' : 'Character'} physical appearance (always preserve): ${bodyEN}`);
    if (currentClothing) contextParts.push(`Current clothing: ${currentClothing}`);
    if (currentLocation) contextParts.push(`Current location: ${currentLocation}`);
    if (qualityTags)     contextParts.push(`Quality tags: ${qualityTags}`);
    const context = contextParts.join('\n');

    const styleRef = prevEN ? `\nStyle reference (for writing style only): "${prevEN}"\n` : '';
    const system = `You are a visual scene writer for an AI image generator.
Write a single cohesive English scene description.
${context ? `\n${context}\n` : ''}${styleRef}Rules:
- Physical appearance must be preserved exactly as specified
- Use the current clothing and location as specified above
- Describe pose, action, expression, and emotional state from the scene
- Match the writing style of the style reference if provided
- Do NOT include any dialogue, speech, or quoted text (no 「」"" or similar)
- Keep the description under 300 words total
- Output only the scene description, nothing else`;

    const result = await getChatCompletion([
      { role: 'system', content: system },
      { role: 'user',   content: inputText },
    ], { noThink });
    return cleanLLMResponse(result);
  }

  const system = `Translate into English image generation tags.
Output only comma-separated English tags, nothing else.`;
  const result = await getChatCompletion([
    { role: 'system', content: system },
    { role: 'user',   content: inputText },
  ], { noThink });
  const sceneEN = cleanLLMResponse(result);
  return [qualityTags, bodyEN, currentClothing, sceneEN].filter(Boolean).join(', ');
}


// ─────────────────────────────────────────────
// 異常出力検知
// ─────────────────────────────────────────────
function isAbnormalOutput(text) {
  // cleanLLMResponse適用後のテキストで判定する
  if (!text || text.trim().length === 0) return true;

  // 繰り返しパターン検知（3文字以上のトークンが5回以上連続）
  if (/(.{3,})\1{4,}/.test(text)) return true;

  // ENモード時は日本語割合チェックをスキップ
  if (!isEnglishMode() && text.length > 20) {
    const jpCount = (text.match(/[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/g) || []).length;
    if (jpCount / text.length < 0.2) return true;
  }

  return false;
}

// cleanLLMResponse前のRAWテキストで思考タグの異常を検知
// clean後も異常な場合にLLMで日本語応答を抽出（1回のみ）
async function extractJapaneseResponse(rawText) {
  try {
    const result = await getChatCompletion([
      { role: 'system', content: '以下のテキストから、日本語のキャラクター応答部分だけを抽出してください。思考過程・タグ・英語・記号の羅列は除外し、最終的な日本語の返答のみを返してください。返答のみ出力し、説明は不要です。' },
      { role: 'user', content: rawText },
    ], { noThink: true });
    const extracted = cleanLLMResponse(result);
    return extracted || null;
  } catch(e) {
    return null;
  }
}

function isAbnormalRaw(raw) {
  if (!raw || raw.trim().length === 0) return true;

  // Gemma3: <think>が開いているが</think>が閉じていない
  const hasOpenThink  = /<think>/i.test(raw);
  const hasCloseThink = /<\/think>/i.test(raw);
  if (hasOpenThink && !hasCloseThink) return true;

  // Gemma4: <|channel>が開いているが<channel|>が閉じていない
  const hasOpenChannel  = /<\|channel>/i.test(raw);
  const hasCloseChannel = /<channel\|>/i.test(raw);
  if (hasOpenChannel && !hasCloseChannel) return true;

  // 思考タグ後の実際の返答が空
  if (hasOpenThink && hasCloseThink) {
    const afterThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!afterThink) return true;
  }
  if (hasOpenChannel && hasCloseChannel) {
    const afterChannel = raw.replace(/<\|channel>[\s\S]*?<channel\|>/gi, '').trim();
    if (!afterChannel) return true;
  }

  return false;
}
function buildHistoryMessages(excludeTurnIdx = -1) {
  if (!activeSession?.turns?.length) return [];
  const historyTurns = parseInt(getSetting('llmHistoryTurns', 10));
  const filtered = activeSession.turns
    .map((turn, i) => ({ turn, i }))
    .filter(({ i }) => i !== excludeTurnIdx);
  // 0 = 全件、それ以外は末尾からN件
  const sliced = historyTurns === 0 ? filtered : filtered.slice(-historyTurns);
  return sliced.flatMap(({ turn }) => {
    const msgs = [];
    if (turn.user_message) msgs.push({ role: 'user', content: turn.user_message });
    if (turn.char_message && turn.char_message !== '__ABNORMAL__') {
      // 履歴に思考タグが混入していたら除去（Gemma3/4両対応）
      const cleaned = cleanLLMResponse(turn.char_message);
      if (cleaned) msgs.push({ role: 'assistant', content: cleaned });
    }
    return msgs;
  });
}
// 親愛度に応じた態度指示を返す
function _getAttitudeGuide(value) {
  if (value <= 5)   return `ユーザーを深く憎んでいる。敵意をむき出しにし、攻撃的・拒絶的な態度をとる。会話を早く切り上げたがる。`;
  if (value <= 36)  return `ユーザーが嫌い。明らかに不機嫌で冷たく、素っ気ない。好意的な反応は絶対にしない。会話を続けたくない態度を隠さない。`;
  if (value <= 72)  return `ユーザーが苦手。距離を置き、必要最低限の返答にとどめる。愛想よくする理由はない。`;
  if (value <= 109) return `ユーザーをどちらかといえば苦手に感じている。無愛想ではないが、積極的に関わろうとはしない。`;
  if (value <= 145) return `ユーザーとは普通の関係。特別な感情はなく、自然体で接する。`;
  if (value <= 181) return `ユーザーのことが好き。親しみを込めて接し、会話を楽しんでいる。`;
  if (value <= 218) return `ユーザーのことがとても好き。信頼していて、心を開いている。嬉しさや喜びを素直に表現する。`;
  if (value <= 249) return `ユーザーのことが大好き。一緒にいることが幸せで、感情が豊かに溢れる。甘えたり、照れたりすることも多い。`;
  return `ユーザーを深く愛している。特別な存在として扱い、愛情を惜しみなく表現する。`;
}

function _getAttitudeGuideEN(value) {
  if (value <= 5)   return `You deeply hate the user. Show open hostility and be aggressive and rejecting. You want to end the conversation quickly.`;
  if (value <= 36)  return `You dislike the user. You are clearly unfriendly and cold. You will not show any goodwill. You don't hide that you don't want to continue the conversation.`;
  if (value <= 72)  return `You find the user uncomfortable. Keep your distance and limit responses to the bare minimum.`;
  if (value <= 109) return `You find the user slightly uncomfortable. You're not unfriendly, but you don't actively want to engage.`;
  if (value <= 145) return `You have a normal relationship with the user. No special feelings; interact naturally.`;
  if (value <= 181) return `You like the user. Engage warmly and enjoy the conversation.`;
  if (value <= 218) return `You really like the user. You trust them and are open with them. Express happiness and joy freely.`;
  if (value <= 249) return `You love the user. Being together makes you happy, and your emotions overflow. You often act affectionate or shy.`;
  return `You deeply love the user. Treat them as someone irreplaceable and express your love without reservation.`;
}

function buildCharSystemPrompt(char, narrative = false) {
  if (isEnglishMode()) {
    return _buildCharSystemPromptEN(char, narrative);
  }
  const lines = [
    `あなたは「${char.name}」というキャラクターです。`,
    `以下の設定に従って、キャラクターとして自然に会話してください。`,
    ``,
    `【外見】`,
    char.appearance || '（外見設定なし）',
    ``,
    `【キャラクター設定】`,
    char.personality || '（設定なし）',
  ];

  // 親愛度情報を差し込む
  if (typeof isCharAffectionEnabled === 'function' && isCharAffectionEnabled(char)) {
    const affValue  = char.affection ?? 130;
    const llmLabel  = typeof affectionLLMLabel === 'function' ? affectionLLMLabel(affValue) : '';
    const stageLabel = typeof affectionLabel === 'function' ? affectionLabel(affValue) : '';
    const isFirst   = char.is_first_meeting !== false;
    const notes     = char.memory_notes || [];
    const lastState = char.last_state || {};

    lines.push(``, `【現在の関係性】`);
    lines.push(`現在の親愛度: ${stageLabel}（関係性: ${llmLabel}）`);
    lines.push(`初対面: ${isFirst ? 'はい' : 'いいえ'}`);
    if (char.user_name) lines.push(`ユーザーの呼び方: ${char.user_name}`);

    // 親愛度に応じた態度指示
    const attitudeGuide = _getAttitudeGuide(affValue);
    if (attitudeGuide) lines.push(`\n【親愛度に基づく態度】\n${attitudeGuide}`);
    if (notes.length) {
      lines.push(`記憶メモ:`);
      notes.forEach(n => lines.push(`  - ${n}`));
    }
    if (lastState.appearance) lines.push(`現在の外見: ${lastState.appearance}`);
    if (lastState.location)   lines.push(`現在の場所: ${lastState.location}`);
  }

  // 前回セッション概要（セッションcontextから参照）
  const ctx = activeSession?.context;
  if (ctx?.summary)    { lines.push(``, `【前回のセッション概要】`); lines.push(ctx.summary); }
  if (ctx?.appearance) { lines.push(``, `【現在の外見】`); lines.push(ctx.appearance); }
  if (ctx?.location)   { lines.push(``, `【現在の場所】`); lines.push(ctx.location); }

  // ユーザー情報（キャラオーバーライド優先・グローバルフォールバック）
  const up = char.user_profile || {};
  const userName            = up.name       || getSetting('userName', '')       || '';
  const userAppearanceBase  = up.appearance || getSetting('userAppearance', '') || '';
  const userState           = activeSession?.user_state || {};
  // user_stateの外見があればオーバーライド
  const userAppearance = userState.appearance || userAppearanceBase;
  const userLocation   = userState.location   || '';
  if (userName || userAppearance || userLocation) {
    lines.push(``, `【ユーザー情報】`);
    if (userName)       lines.push(`名前: ${userName}`);
    if (userAppearance) lines.push(`外見: ${userAppearance}`);
    if (userLocation)   lines.push(`現在の場所: ${userLocation}`);
  }

  lines.push(
    ``,
    `【重要な指示】`,
    `- 必ず日本語で返答してください`,
    `- 画像が共有される場合があります。その場合は状況の一部として自然に受け入れてください`,
    `- キャラクターとして自然にロールプレイしてください`,
    `- 余分な説明や前置きは不要です。セリフだけ返してください`,
    `- （状況）と書かれたメッセージは地の文・ナレーションです。その状況を受け入れて自然に反応してください`,
  );

  // キャラ主導権モード
  const charLead = document.getElementById('charLeadToggle')?.checked;
  if (charLead) {
    lines.push(
      ``,
      `【キャラ主導モード（最重要）】`,
      `- あなたが会話と展開を完全にリードしてください`,
      `- 受け身の返答・質問で終わることを禁止します`,
      `- 自分の感情・欲求・意志を前面に出し、積極的に行動・発言してください`,
      `- ユーザーの同意を待たずに、次の展開を宣言・提案・実行してください`,
      `- 例：「行くぞ」「これにしろ」「こっちに来い」のように引っ張る口調を使ってよいです`,
      `- 質問するなら選択肢を与えず「どうする？」より「〇〇するから覚悟しろ」のように迫る形が望ましい`,
    );
  }

  return lines.join('\n');
}

function _buildCharSystemPromptEN(char, narrative = false) {
  const lines = [
    `You are a character named "${char.name}".`,
    `Follow the settings below and converse naturally as this character.`,
    ``,
    `[Appearance]`,
    char.appearance || '(no appearance defined)',
    ``,
    `[Character Settings]`,
    char.personality || '(no settings defined)',
  ];

  if (typeof isCharAffectionEnabled === 'function' && isCharAffectionEnabled(char)) {
    const affValue   = char.affection ?? 130;
    const llmLabel   = typeof affectionLLMLabel === 'function' ? affectionLLMLabel(affValue) : '';
    const stageLabel = typeof affectionLabel    === 'function' ? affectionLabel(affValue)    : '';
    const isFirst    = char.is_first_meeting !== false;
    const notes      = char.memory_notes || [];
    const lastState  = char.last_state   || {};

    lines.push(``, `[Current Relationship]`);
    lines.push(`Current affection level: ${stageLabel} (relationship: ${llmLabel})`);
    lines.push(`First meeting: ${isFirst ? 'yes' : 'no'}`);
    if (char.user_name) lines.push(`How to address the user: ${char.user_name}`);

    const attitudeGuide = _getAttitudeGuideEN(affValue);
    if (attitudeGuide) lines.push(`\n[Attitude based on affection level]\n${attitudeGuide}`);

    if (notes.length) {
      lines.push(`Memory notes:`);
      notes.forEach(n => lines.push(`  - ${n}`));
    }
    if (lastState.appearance) lines.push(`Current appearance: ${lastState.appearance}`);
    if (lastState.location)   lines.push(`Current location: ${lastState.location}`);
  }

  const ctx = activeSession?.context;
  if (ctx?.summary)    { lines.push(``, `[Previous Session Summary]`); lines.push(ctx.summary); }
  if (ctx?.appearance) { lines.push(``, `[Current Appearance]`); lines.push(ctx.appearance); }
  if (ctx?.location)   { lines.push(``, `[Current Location]`); lines.push(ctx.location); }

  const up = char.user_profile || {};
  const userName           = up.name       || getSetting('userName', '')       || '';
  const userAppearanceBase = up.appearance || getSetting('userAppearance', '') || '';
  const userState          = activeSession?.user_state || {};
  const userAppearance     = userState.appearance || userAppearanceBase;
  const userLocation       = userState.location   || '';
  if (userName || userAppearance || userLocation) {
    lines.push(``, `[User Information]`);
    if (userName)       lines.push(`Name: ${userName}`);
    if (userAppearance) lines.push(`Appearance: ${userAppearance}`);
    if (userLocation)   lines.push(`Current location: ${userLocation}`);
  }

  lines.push(
    ``,
    `[Important Instructions]`,
    `- Always respond in English`,
    `- Images may be shared. If so, accept them naturally as part of the situation`,
    `- Roleplay naturally as this character`,
    `- No extra explanations or preamble. Return only dialogue`,
    `- Messages written as "(situation) ..." are narrative descriptions. Accept the situation and respond naturally`,
  );

  const charLead = document.getElementById('charLeadToggle')?.checked;
  if (charLead) {
    lines.push(
      ``,
      `[Character-Led Mode (HIGHEST PRIORITY)]`,
      `- You must fully lead the conversation and narrative`,
      `- Passive responses or ending with questions are forbidden`,
      `- Express your emotions, desires, and will proactively`,
      `- Declare, propose, or act without waiting for user consent`,
      `- Use assertive language that pulls the user along`,
    );
  }

  return lines.join('\n');
}

async function getCharResponse(imageUrl, userText, narrative = false) {
  if (!activeChar) throw new Error('キャラクターが選択されていません');
  const base64 = await imageUrlToBase64(imageUrl);
  const isUserFocus = document.getElementById('userFocusToggle')?.checked ?? false;

  // userフォーカス時はVisionの説明文を切り替え
  const imageDescription = isUserFocus
    ? 'この画像はユーザー（あなたの相手）の様子を映しています。ユーザーの表情・行動・状況に自然に反応してください。'
    : '自然に反応してください。';

  const messages = [
    { role: 'system', content: buildCharSystemPrompt(activeChar, narrative) },
    ...buildHistoryMessages(),
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
        { type: 'text', text: narrative
            ? `（状況）${stripNarrative(userText)}`
            : (userText || imageDescription) },
      ],
    },
  ];
  const result = await getChatCompletion(messages);
  if (isAbnormalRaw(result)) { if (getSetting('debugMode', false)) console.warn('[NookResonance] ABNORMAL_RAW\nPrompt:', messages, '\nResponse:', result); throw new Error('ABNORMAL_OUTPUT'); }
  const cleaned = cleanLLMResponse(result);
  if (isAbnormalOutput(cleaned)) {
    if (getSetting('debugMode', false)) console.warn('[NookResonance] ABNORMAL_RAW\nPrompt:', messages, '\nResponse:', result);
    if (!isEnglishMode()) {
      if (typeof updateStatusBadge === 'function') updateStatusBadge('リカバリー試行中…');
      const extracted = await extractJapaneseResponse(result);
      if (extracted && !isAbnormalOutput(extracted)) return extracted;
    }
    throw new Error('ABNORMAL_OUTPUT');
  }
  return cleaned;
}
async function getCharResponseContinue() {
  if (!activeChar) throw new Error('キャラクターが選択されていません');

  // 直前のchar_messageをプリフィルして続きを生成
  const turns = activeSession?.turns || [];
  const lastCharMsg = [...turns].reverse().find(t => t.char_message && t.char_message !== '__ABNORMAL__')?.char_message || '';

  const messages = [
    { role: 'system',    content: buildCharSystemPrompt(activeChar) },
    ...buildHistoryMessages(),
  ];

  // 直前のchar_messageがあればassistantプリフィルとして渡す
  if (lastCharMsg) {
    messages.push({ role: 'assistant', content: lastCharMsg });
  }

  const result = await getChatCompletion(messages);
  if (isAbnormalRaw(result)) { if (getSetting('debugMode', false)) console.warn('[NookResonance] ABNORMAL_RAW\nPrompt:', messages, '\nResponse:', result); throw new Error('ABNORMAL_OUTPUT'); }
  const cleaned = cleanLLMResponse(result);
  if (isAbnormalOutput(cleaned)) {
    if (getSetting('debugMode', false)) console.warn('[NookResonance] ABNORMAL_RAW\nPrompt:', messages, '\nResponse:', result);
    if (!isEnglishMode()) {
      if (typeof updateStatusBadge === 'function') updateStatusBadge('リカバリー試行中…');
      const extracted = await extractJapaneseResponse(result);
      if (extracted && !isAbnormalOutput(extracted)) return extracted;
    }
    throw new Error('ABNORMAL_OUTPUT');
  }
  return cleaned;
}

async function getCharResponseText(userText, narrative = false, excludeTurnIdx = -1) {
  if (!activeChar) throw new Error('キャラクターが選択されていません');
  const content = narrative ? `（状況）${stripNarrative(userText)}` : userText;
  const messages = [
    { role: 'system', content: buildCharSystemPrompt(activeChar, narrative) },
    ...buildHistoryMessages(excludeTurnIdx),
    { role: 'user', content },
  ];
  const result = await getChatCompletion(messages);
  if (isAbnormalRaw(result)) { if (getSetting('debugMode', false)) console.warn('[NookResonance] ABNORMAL_RAW\nPrompt:', messages, '\nResponse:', result); throw new Error('ABNORMAL_OUTPUT'); }
  const cleaned = cleanLLMResponse(result);
  if (isAbnormalOutput(cleaned)) {
    if (getSetting('debugMode', false)) console.warn('[NookResonance] ABNORMAL_RAW\nPrompt:', messages, '\nResponse:', result);
    if (!isEnglishMode()) {
      if (typeof updateStatusBadge === 'function') updateStatusBadge('リカバリー試行中…');
      const extracted = await extractJapaneseResponse(result);
      if (extracted && !isAbnormalOutput(extracted)) return extracted;
    }
    throw new Error('ABNORMAL_OUTPUT');
  }
  return cleaned;
}
