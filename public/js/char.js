/* ═════════════════════════════════════════════
   ComfyDeck Nook — char.js
   キャラクター操作・LoRA管理・ST連携・アバター
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// SillyTavern連携
// ─────────────────────────────────────────────
function _parseSTDescription(desc) {
  // <キー=値> 形式のタグを全部抽出
  const tags = {};
  const tagRe = /<([^=>\r\n]+)=([^>\r\n]*)>/g;
  let m;
  while ((m = tagRe.exec(desc)) !== null) {
    tags[m[1].trim()] = m[2].trim();
  }
  // {{user}}: 以降の会話例を除去した残りをプレーンテキストとして取得
  const withoutTags = desc.replace(/<[^>]+>/g, '').replace(/\{\{user\}\}:[\s\S]*/g, '').trim();
  return { tags, plain: withoutTags };
}
async function handleCharImport(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = ''; // 同じファイルを再選択できるようリセット

  let json;
  try {
    const text = await file.text();
    json = JSON.parse(text);
  } catch(e) {
    showToast(t('char.import_json_failed', '❌ JSONの読み込みに失敗しました'));
    return;
  }

  // data フィールドがあれば優先（v3形式）
  const card = json.data || json;
  const name     = card.name     || '';
  const desc     = card.description || '';
  const firstMes = card.first_mes   || '';
  const mesEx    = card.mes_example || '';

  if (!name) { showToast(t('char.import_missing_name', '❌ name フィールドがありません')); return; }

  // ── NookResonance / Nook 高速パス（LLM不要）──
  const ext           = card.extensions || json.extensions || {};
  const nookResonance = ext.nookresonance;
  const legacyCard    = ext['alc' + 'ove'];
  const nook          = ext.nook_v2 || ext.nook;  // nook_v2はNook旧新形式、nookは最旧形式

  const isNookResonance = nookResonance?._format === 'NookResonance';
  const isLegacyCard    = legacyCard?._format === ('Alc' + 'ove');
  const isNook          = nook?._format === 'ComfyDeck Nook';  // nook_v2のみ高速パス対象

  if (isNookResonance || isLegacyCard || isNook) {
    const src = isNookResonance ? nookResonance : (isLegacyCard ? legacyCard : nook);
    const wp  = isNook && nook === ext.nook ? (ext.nook?.workflow_params || {}) : null;
    // workflow_paramsがフラットでないnook最旧形式への対応
    const get = (flat, wpKey) => flat ?? wp?.[wpKey] ?? '';

    // descriptionから外見/設定を分離
    const m = desc.match(/【外見】([\s\S]*?)【キャラクター設定】([\s\S]*)/);
    const appearance  = m ? m[1].trim() : '';
    const personality = m ? m[2].trim() : desc;

    setFieldValue('editName',        name);
    setFieldValue('editUserName',    src.user_name    || '');
    setFieldValue('editAppearance',  appearance);
    setFieldValue('editPersonality', personality);
    const cacheEl = document.getElementById('enCacheDisplay');
    if (cacheEl) cacheEl.textContent = src.appearance_en || t('misc.not_generated', '（未生成）');

    const wfSel = document.getElementById('editWfSelect');
    if (wfSel && src.workflow_id) wfSel.value = src.workflow_id;

    setFieldValue('editQualityTags', get(src.quality_tags, 'quality_tags'));
    setFieldValue('editNegative',    get(src.negative,     'negative'));
    setFieldValue('editSteps',       get(src.steps,        'steps'));
    setFieldValue('editCfg',         get(src.cfg,          'cfg'));
    setFieldValue('editWidth',       get(src.width,        'width'));
    setFieldValue('editHeight',      get(src.height,       'height'));

    // Sampler/Scheduler（select要素はfetchSamplerList後に復元）
    const sSel  = document.getElementById('editSampler');
    const scSel = document.getElementById('editScheduler');
    const sampler   = get(src.sampler,   'sampler');
    const scheduler = get(src.scheduler, 'scheduler');
    if (sSel)  { sSel.value  = sampler;   sSel._restoreVal  = sampler; }
    if (scSel) { scSel.value = scheduler; scSel._restoreVal = scheduler; }

    // LoRA
    const loras = src.loras || wp?.loras || [];
    initLoraList(loras.map(l => ({ ...l, enabled: l.enabled !== false })));

    // アイコン
    if (src.icon_data) {
      _editingIconData = src.icon_data;
      showAvatarPreview(src.icon_data);
    }

    showToast(`✓ 「${name}」をインポートしました（${(isNookResonance || isLegacyCard) ? 'NookResonance' : 'Nook'}形式）`);
    return;
  }

  // ── SillyTavern形式：LLM解析フロー ──

  showToast(t('char.llm_analyzing', '⏳ LLMで解析中…'));
  const btn = document.querySelector('#charEditOverlay .btn-secondary[onclick*="charImportFile"]')
           || document.querySelector('#charImportFile')?.previousElementSibling;

  // LLMにdescriptionを渡してappearance/personalityに分離
  let appearance = '', personality = '';
  try {
    const { tags, plain } = _parseSTDescription(desc);

    // LLMに分離を依頼
    const prompt = `以下はSillyTavernのキャラクターカードのdescriptionです。
内容を「外見特徴」と「キャラクター設定」の2つに分けてください。

description:
${desc}

ルール:
- 外見特徴: 体型・髪・目・服装など見た目に関する情報のみ
- キャラクター設定: 性格・職業・趣味・体質・場所・エピソードなど外見以外の情報
- 会話例（{{user}}:〜）はキャラクター設定の末尾に「【会話例】」として追記
- first_mes（最初のセリフ）: ${firstMes}
- mes_example: ${mesEx}
- first_mesとmes_exampleがある場合はキャラクター設定末尾に追記

必ず以下のJSON形式のみで返してください（他のテキスト不要）:
{"appearance":"...","personality":"..."}`;

    const raw = await getChatCompletion([
      { role: 'system', content: 'You are a character data parser. Output only valid JSON, nothing else.' },
      { role: 'user',   content: prompt },
    ]);
    const cleaned = cleanLLMResponse(raw).replace(/^```json|```$/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    appearance  = parsed.appearance  || '';
    personality = parsed.personality || '';
  } catch(e) {
    // LLM失敗時はdescriptionをそのままpersonalityに入れる
    console.warn('[Nook] import LLM parse failed:', e.message);
    appearance  = '';
    personality = desc;
    showToast(t('char.llm_analysis_failed', '⚠ LLM解析失敗。descriptionをそのまま設定に入れました'));
  }

  // フォームに展開
  setFieldValue('editName',        name);
  setFieldValue('editAppearance',  appearance);
  setFieldValue('editPersonality', personality);

  // appearance_en を生成
  if (appearance) {
    try {
      const enResult = await getChatCompletion([
        {
          role: 'system',
          content: 'Translate the following Japanese character appearance description into English tags suitable for image generation. Output only comma-separated English tags, nothing else.',
        },
        { role: 'user', content: appearance },
      ]);
      const en = cleanLLMResponse(enResult);
      const cacheEl = document.getElementById('enCacheDisplay');
      if (cacheEl) cacheEl.textContent = en;
      // editCharOverlayのcharId未設定なのでappearance_enは保存時にフォームから取得される
      // → saveCharFromUI側で enCacheDisplay の値を使う必要がある
      // enCacheDisplay → char.appearance_en のマッピングはsaveCharFromUI内で処理済み
    } catch(e) {
      console.warn('[Nook] import EN gen failed:', e.message);
    }
  }

  showToast(`✓ 「${name}」をインポートしました。内容を確認して保存してください`);
}
function exportCharJSON(char) {
  const now = new Date().toISOString();

  // appearance + personality を description にまとめる
  let desc = '';
  if (char.appearance) desc += `【外見】
${char.appearance}

`;
  if (char.personality) desc += `【キャラクター設定】
${char.personality}`;
  desc = desc.trim();

  // NookResonance固有情報をextensionsに保存
  const p = char.workflow_params || {};
  const extensions = {
    // NookResonance形式
    nookresonance: {
      _format:       'NookResonance',
      appearance_en: char.appearance_en || '',
      workflow_id:   char.workflow_id   || '',
      icon_data:     char.icon_data     || '',
      icon_emoji:    char.icon_emoji    || '',
      user_name:     char.user_name     || '',
      quality_tags:  p.quality_tags     || '',
      negative:      p.negative         || '',
      steps:         p.steps            ?? '',
      cfg:           p.cfg              ?? '',
      width:         p.width            ?? '',
      height:        p.height           ?? '',
      sampler:       p.sampler          || '',
      scheduler:     p.scheduler        || '',
      loras:         (p.loras || []).map(l => ({
        name:          l.name          || '',
        strengthModel: l.strengthModel ?? 1,
        strengthClip:  l.strengthClip  ?? 1,
        triggerWords:  l.triggerWords  || '',
        enabled:       l.enabled !== false,
      })),
    },
    // 旧nook形式（後方互換）
    nook: {
      appearance_en:   char.appearance_en  || '',
      workflow_id:     char.workflow_id     || '',
      workflow_params: char.workflow_params || {},
      icon_data:       char.icon_data       || '',
      icon_emoji:      char.icon_emoji      || '',
    },
    talkativeness: '0.5',
    fav: false,
    world: '',
    depth_prompt: { prompt: '', depth: 4, role: 'system' },
  };

  const cardData = {
    name:                     char.name || '',
    description:              desc,
    personality:              '',
    scenario:                 '',
    first_mes:                '',
    mes_example:              '',
    creator_notes:            'Exported from ComfyDeck Nook',
    system_prompt:            '',
    post_history_instructions:'',
    tags:                     [],
    creator:                  '',
    character_version:        '',
    alternate_greetings:      [],
    extensions,
    group_only_greetings:     [],
  };

  const card = {
    name:           char.name || '',
    description:    desc,
    personality:    '',
    scenario:       '',
    first_mes:      '',
    mes_example:    '',
    creatorcomment: 'Exported from ComfyDeck Nook',
    avatar:         'none',
    talkativeness:  '0.5',
    fav:            false,
    tags:           [],
    spec:           'chara_card_v3',
    spec_version:   '3.0',
    data:           cardData,
    create_date:    char.created_at || now,
  };

  const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safeName = (char.name || 'char').replace(/[\/:*?"<>|]/g, '_');
  a.href     = url;
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`✓ 「${char.name}」をエクスポートしました`);
}

// ─────────────────────────────────────────────
// キャラクター編集
// ─────────────────────────────────────────────
async function generateAppearanceEN() {
  // 後方互換：旧フィールド用（現在はgenerateAppearanceBodyENを使う）
  return generateAppearanceBodyEN();
}

async function generateAppearanceBodyEN() {
  const jpText = document.getElementById('editAppearanceBody')?.value?.trim();
  if (!jpText) { showToast(t('char.body_required', '身体の特徴を入力してください')); return; }
  try {
    const noThink = getSetting('noThinkTranslate', false) === true;
    const result = await getChatCompletion([
      { role: 'system', content: 'Translate the following Japanese character physical appearance description into English tags suitable for image generation. Focus on hair, eyes, body type, skin, and other permanent physical features. Output only comma-separated English tags, nothing else.' },
      { role: 'user', content: jpText },
    ], { noThink });
    const en = cleanLLMResponse(result);
    const el = document.getElementById('enCacheBodyDisplay');
    if (el) el.textContent = en;
    showToast(t('toast.en_gen_ok', '身体特徴EN変換完了'));
  } catch(e) {
    showToast(t('toast.en_gen_fail', 'EN変換エラー: ') + e.message.slice(0, 40));
  }
}

async function generateAppearanceClothingEN() {
  const jpText = document.getElementById('editAppearanceClothing')?.value?.trim();
  if (!jpText) { showToast(t('char.clothing_required', '服装を入力してください')); return; }
  try {
    const noThink = getSetting('noThinkTranslate', false) === true;
    const result = await getChatCompletion([
      { role: 'system', content: 'Translate the following Japanese character clothing/outfit description into English tags suitable for image generation. Focus on clothing, accessories, and style. Output only comma-separated English tags, nothing else.' },
      { role: 'user', content: jpText },
    ], { noThink });
    const en = cleanLLMResponse(result);
    const el = document.getElementById('enCacheClothingDisplay');
    if (el) el.textContent = en;
    showToast(t('toast.en_gen_ok', '服装EN変換完了'));
  } catch(e) {
    showToast(t('toast.en_gen_fail', 'EN変換エラー: ') + e.message.slice(0, 40));
  }
}

async function generateAppearanceAllEN() {
  await generateAppearanceBodyEN();
  await generateAppearanceClothingEN();
  showToast(t('toast.en_gen_ok', '✓ 両方のEN変換完了'));
}
// キャラオーバーライドのユーザー外見EN生成
async function generateUserProfileAppearanceEN() {
  const jpText = document.getElementById('editUserProfileAppearance')?.value?.trim();
  if (!jpText) { showToast(t('char.appearance_required', '外見特徴を入力してください')); return; }
  try {
    const noThink = getSetting('noThinkTranslate', false) === true;
    const result = await getChatCompletion([
      {
        role: 'system',
        content: 'Translate the following Japanese character appearance description into English tags suitable for image generation. Output only comma-separated English tags, nothing else.',
      },
      { role: 'user', content: jpText },
    ], { noThink });
    const en = cleanLLMResponse(result);
    const el = document.getElementById('editUserProfileAppearanceEn');
    if (el) el.value = en;
    showToast(t('toast.en_gen_ok', 'EN変換完了'));
  } catch(e) {
    showToast(t('toast.en_gen_fail', 'EN変換エラー: ') + e.message.slice(0, 40));
  }
}

// グローバルユーザーの外見EN生成
async function generateUserAppearanceEN() {
  const jpText = document.getElementById('userAppearance')?.value?.trim();
  if (!jpText) { showToast(t('char.appearance_required', '外見特徴を入力してください')); return; }
  try {
    const noThink = getSetting('noThinkTranslate', false) === true;
    const result = await getChatCompletion([
      {
        role: 'system',
        content: 'Translate the following Japanese character appearance description into English tags suitable for image generation. Output only comma-separated English tags, nothing else.',
      },
      { role: 'user', content: jpText },
    ], { noThink });
    const en = cleanLLMResponse(result);
    const el = document.getElementById('userAppearanceEn');
    if (el) el.value = en;
    const cache = document.getElementById('userEnCacheDisplay');
    if (cache) cache.textContent = en;
    showToast(t('toast.en_gen_ok', 'EN変換完了'));
  } catch(e) {
    showToast(t('toast.en_gen_fail', 'EN変換エラー: ') + e.message.slice(0, 40));
  }
}
function openCharEdit(char) {
  if (char) {
    setFieldValue('editName',        char.name        || '');
    setFieldValue('editUserName',    char.user_name   || '');
    // 新フィールド優先・旧appearanceからの後方互換
    setFieldValue('editAppearanceBody',     char.appearance_body     || char.appearance || '');
    setFieldValue('editAppearanceClothing', char.appearance_clothing || '');
    setFieldValue('editAppearance',  char.appearance  || '');
    setFieldValue('editPersonality', char.personality || '');
    setFieldValue('editOpeningMessage', char.opening_message || '');
    const cacheBodyEl = document.getElementById('enCacheBodyDisplay');
    if (cacheBodyEl) cacheBodyEl.textContent = char.appearance_body_en || t('misc.not_generated', '（未生成）');
    const cacheClothingEl = document.getElementById('enCacheClothingDisplay');
    if (cacheClothingEl) cacheClothingEl.textContent = char.appearance_clothing_en || t('misc.not_generated', '（未生成）');
    const cacheEl = document.getElementById('enCacheDisplay');
    if (cacheEl) cacheEl.textContent = char.appearance_en || t('misc.not_generated', '（未生成）');
    const wfSel = document.getElementById('editWfSelect');
    if (wfSel) wfSel.value = char.workflow_id || 'anima';
    const p = char.workflow_params || {};
    setFieldValue('editQualityTags', p.quality_tags || '');
    setFieldValue('editNegative',    p.negative     || '');
    setFieldValue('editSteps',       p.steps        || '');
    setFieldValue('editCfg',         p.cfg          || '');
    setFieldValue('editWidth',       p.width        || '');
    setFieldValue('editHeight',      p.height       || '');
    document.getElementById('editSampler')._restoreVal  = p.sampler   || '';
    document.getElementById('editScheduler')._restoreVal = p.scheduler || '';
    initLoraList(p.loras || []);
    setAvatarFromChar(char);
    document.getElementById('charEditOverlay').dataset.charId = char.id || '';
    // 初対面フラグ
    const fmEl = document.getElementById('editFirstMeeting');
    if (fmEl) fmEl.checked = char.is_first_meeting !== false;
    // user_profile オーバーライド
    const up = char.user_profile || {};
    setFieldValue('editUserProfileName',         up.name          || '');
    setFieldValue('editUserProfileAppearance',   up.appearance    || '');
    setFieldValue('editUserProfileAppearanceEn', up.appearance_en || '');
  } else {
    ['editName','editUserName','editAppearance','editAppearanceBody','editAppearanceClothing',
     'editPersonality','editQualityTags','editNegative',
     'editSteps','editCfg','editWidth','editHeight',
     'editUserProfileName','editUserProfileAppearance','editUserProfileAppearanceEn',
     'editOpeningMessage',
    ].forEach(id => setFieldValue(id, ''));
    const cacheBodyEl = document.getElementById('enCacheBodyDisplay');
    if (cacheBodyEl) cacheBodyEl.textContent = t('misc.not_generated', '（未生成）');
    const cacheClothingEl = document.getElementById('enCacheClothingDisplay');
    if (cacheClothingEl) cacheClothingEl.textContent = t('misc.not_generated', '（未生成）');
    const cacheEl = document.getElementById('enCacheDisplay');
    if (cacheEl) cacheEl.textContent = t('misc.not_generated', '（未生成）');
    if (document.getElementById('editSampler'))  document.getElementById('editSampler')._restoreVal  = '';
    if (document.getElementById('editScheduler')) document.getElementById('editScheduler')._restoreVal = '';
    initLoraList([]);
    setAvatarFromChar(null);
    document.getElementById('charEditOverlay').dataset.charId = '';
    const fmEl = document.getElementById('editFirstMeeting');
    if (fmEl) fmEl.checked = true;
  }
  closeModal('charOverlay');
  setTimeout(() => openModal('charEditOverlay'), 200);
  // 管理者・上級者以外はLoRA・WFパラメータ・Quality Tags/Negativeセクションを非表示
  const cu = getCurrentUser();
  const showAdvanced = !!(cu?.is_admin || cu?.is_advanced);
  const loraSec    = document.getElementById('loraSection');
  const wfSec      = document.getElementById('wfParamSection');
  const qualNegSec = document.getElementById('charQualNegSection');
  if (loraSec)    loraSec.style.display    = showAdvanced ? '' : 'none';
  if (wfSec)      wfSec.style.display      = showAdvanced ? '' : 'none';
  if (qualNegSec) qualNegSec.style.display = showAdvanced ? '' : 'none';
  // 親愛度セクションを描画
  if (typeof renderAffectionSection === 'function') renderAffectionSection(char || null);
  // ComfyUIからLoRA・Sampler・Schedulerリストを自動取得（管理者・上級者）
  if (showAdvanced) {
    if (!_loraNames.length) fetchLoraList();
  }
  fetchSamplerList().then(() => {
    // リスト取得後に保存値を復元
    const sSel  = document.getElementById('editSampler');
    const scSel = document.getElementById('editScheduler');
    if (sSel  && sSel._restoreVal)  sSel.value  = sSel._restoreVal;
    if (scSel && scSel._restoreVal) scSel.value = scSel._restoreVal;
  });
}
async function handleDeleteChar() {
  const overlay = document.getElementById('charEditOverlay');
  const charId  = overlay?.dataset.charId;
  if (!charId) { closeModal('charEditOverlay'); return; }

  const char = loadChars().find(c => c.id === charId);
  const name = char?.name || 'このキャラクター';
  if (!confirm(t('char.delete_confirm', `「${name}」を削除しますか？\nセッション履歴は残ります。`))) return;

  await deleteChar(charId);
  if (activeChar?.id === charId) {
    activeChar = null;
    document.getElementById('headerAvatar').textContent = '💬';
    document.getElementById('headerName').textContent   = 'ComfyDeck Nook';
    document.getElementById('headerSession').textContent = t('header.no_char', 'キャラクターを選択してください');
    clearChatLog();
  }
  showToast(`「${name}」${t('char.delete_ok', 'を削除しました')}`);
  closeModal('charEditOverlay');
  renderCharList();
}

function isNotGeneratedText(value) {
  return !value || value === '（未生成）' || value === t('misc.not_generated', '（未生成）');
}

async function saveCharFromUI() {
  const overlay  = document.getElementById('charEditOverlay');
  const rawId    = overlay?.dataset.charId || '';
  const charId   = rawId !== '' && !isNaN(rawId) ? Number(rawId) : rawId;
  const cacheEl  = document.getElementById('enCacheDisplay');
  const existing = loadChars().find(c => c.id === charId) || {};

  const char = {
    ...existing,
    id:            charId || ('char_' + Date.now()),
    name:          getFieldValue('editName') || '名無し',
    user_name:     getFieldValue('editUserName') || '',
    opening_message: getFieldValue('editOpeningMessage') || '',
    user_profile: {
      name:          getFieldValue('editUserProfileName')         || '',
      appearance:    getFieldValue('editUserProfileAppearance')   || '',
      appearance_en: getFieldValue('editUserProfileAppearanceEn') || '',
    },
    icon_emoji:    existing.icon_emoji || '💬',
    icon_data:     _editingIconData !== null ? _editingIconData : (existing.icon_data || null),
    appearance:    getFieldValue('editAppearanceBody') || getFieldValue('editAppearance'),
    appearance_body:     getFieldValue('editAppearanceBody')     || '',
    appearance_clothing: getFieldValue('editAppearanceClothing') || '',
    appearance_body_en:    (isNotGeneratedText(document.getElementById('enCacheBodyDisplay')?.textContent?.trim())    ? '' : document.getElementById('enCacheBodyDisplay')?.textContent?.trim())    || existing.appearance_body_en    || '',
    appearance_clothing_en: (isNotGeneratedText(document.getElementById('enCacheClothingDisplay')?.textContent?.trim()) ? '' : document.getElementById('enCacheClothingDisplay')?.textContent?.trim()) || existing.appearance_clothing_en || '',
    appearance_en: (isNotGeneratedText(document.getElementById('enCacheBodyDisplay')?.textContent?.trim()) ? '' : document.getElementById('enCacheBodyDisplay')?.textContent?.trim()) || existing.appearance_en || '',
    personality:   getFieldValue('editPersonality'),
    workflow_id: (getCurrentUser()?.is_admin || getCurrentUser()?.is_advanced)
      ? (document.getElementById('editWfSelect')?.value || 'anima')
      : (existing.workflow_id || 'anima'),
    workflow_params: (() => {
      const ep = existing.workflow_params || {};
      if (getCurrentUser()?.is_admin || getCurrentUser()?.is_advanced) {
        return {
          quality_tags: getFieldValue('editQualityTags') || null,
          negative:     getFieldValue('editNegative')    || null,
          steps:        getFieldValue('editSteps')       || null,
          cfg:          getFieldValue('editCfg')         || null,
          width:        getFieldValue('editWidth')       || null,
          height:       getFieldValue('editHeight')      || null,
          sampler:      document.getElementById('editSampler')?.value   || null,
          scheduler:    document.getElementById('editScheduler')?.value || null,
          loras:        _loraList.filter(l => l.name),
        };
      }
      // 非管理者: ワークフロー関連・プロンプト設定はすべて既存値を保持
      return {
        quality_tags: ep.quality_tags || null,
        negative:     ep.negative     || null,
        steps:        ep.steps     ?? null,
        cfg:          ep.cfg       ?? null,
        width:        ep.width     ?? null,
        height:       ep.height    ?? null,
        sampler:      ep.sampler   || null,
        scheduler:    ep.scheduler || null,
        loras:        ep.loras     || [],
      };
    })(),
    // 親愛度フィールド
    ...(typeof collectAffectionFromUI === 'function' ? collectAffectionFromUI(existing) : {}),
    // 初対面フラグ
    is_first_meeting: document.getElementById('editFirstMeeting')?.checked ?? existing.is_first_meeting ?? true,
    updated_at: new Date().toISOString(),
    created_at: existing.created_at || new Date().toISOString(),
  };

  const saved = await saveChar(char);
  if (activeChar?.id === char.id || activeChar?.id === saved.id) {
    activeChar = saved;
    if (activeSession && String(activeSession.char_id) === String(saved.id)) {
      activeSession.current_clothing = saved.appearance_clothing_en?.trim() || '';
    }
  }
  showToast(t('char.save_ok', '保存しました'));
  closeModal('charEditOverlay');
  renderCharList();
}

// ─────────────────────────────────────────────
// LoRA管理
// ─────────────────────────────────────────────
function addLoraFromSelect() {
  const selEl = document.getElementById('loraSelectAdd');
  const name  = selEl?.value;
  if (!name) { showToast(t('char.lora_select', 'LoRAを選択してください')); return; }
  if (_loraList.find(l => l.name === name)) {
    showToast(t('char.lora_duplicate', '同じLoRAが既に追加されています')); return;
  }
  _loraList.push({
    name,
    strengthModel: 1,
    strengthClip:  1,
    triggerWords:  '',
    enabled:       true,
  });
  renderLoraList();
  // 追加したカードを展開
  setTimeout(() => toggleLoraCard(_loraList.length - 1), 50);
  showToast(t('char.lora_added', 'LoRA追加: ') + name.split('/').pop());
}
function renderLoraList() {
  const container = document.getElementById('loraList');
  if (!container) return;
  container.innerHTML = '';

  if (!_loraList.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-pale);padding:4px 2px;">${t('misc.none', 'LoRAなし')}</div>`;
    return;
  }

  _loraList.forEach((lora, idx) => {
    const card = document.createElement('div');
    card.className = 'lora-card';
    card.innerHTML = `
      <div class="lora-card-header" onclick="toggleLoraCard(${idx})">
        <input type="checkbox" class="lora-enabled" ${lora.enabled !== false ? 'checked' : ''}
          onclick="event.stopPropagation(); toggleLoraEnabled(${idx}, this.checked)">
        <div class="lora-card-name">${escHtml(lora.name || t('misc.none', '（未設定）'))}</div>
        <div class="lora-card-weight">${lora.strengthModel ?? 1}</div>
        <div class="btn-icon-sm" style="flex-shrink:0;"
          onclick="event.stopPropagation(); removeLoraRow(${idx})">✕</div>
      </div>
      <div class="lora-card-body" id="loraBody_${idx}" style="display:none;">
        <div class="field">
          <div class="field-label">${t('global_lora.file', 'LoRAファイル名')}</div>
          <input class="f-input" type="text" placeholder="xxx.safetensors"
            value="${escHtml(lora.name || '')}"
            onchange="updateLora(${idx}, 'name', this.value)">
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">${t('global_lora.model_strength', 'Model強度')}</div>
            <input class="f-input" type="number" step="0.05" min="0" max="2"
              value="${lora.strengthModel ?? 1}"
              onchange="updateLora(${idx}, 'strengthModel', parseFloat(this.value))">
          </div>
          <div class="field">
            <div class="field-label">${t('global_lora.clip_strength', 'CLIP強度')}</div>
            <input class="f-input" type="number" step="0.05" min="0" max="2"
              value="${lora.strengthClip ?? 1}"
              onchange="updateLora(${idx}, 'strengthClip', parseFloat(this.value))">
          </div>
        </div>
        <div class="field">
          <div class="field-label">${t('char.lora_trigger', 'トリガーワード（生成時に先頭に追加）')}</div>
          <input class="f-input" type="text" placeholder="trigger1, trigger2"
            value="${escHtml(lora.triggerWords || '')}"
            onchange="updateLora(${idx}, 'triggerWords', this.value)">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}
function toggleLoraCard(idx) {
  const body = document.getElementById(`loraBody_${idx}`);
  if (!body) return;
  body.style.display = body.style.display === 'none' ? '' : 'none';
}
function toggleLoraEnabled(idx, checked) {
  if (_loraList[idx]) _loraList[idx].enabled = checked;
  // 強度表示の色を変える
  renderLoraList();
}
function updateLora(idx, key, value) {
  if (_loraList[idx]) {
    _loraList[idx][key] = value;
    // ヘッダーの表示を更新（再レンダリングはせず最小限に）
    if (key === 'strengthModel') {
      const weightEl = document.querySelector(`#loraBody_${idx}`)?.previousElementSibling?.querySelector('.lora-card-weight');
      if (weightEl) weightEl.textContent = value;
    }
    if (key === 'name') {
      const nameEl = document.querySelector(`#loraBody_${idx}`)?.previousElementSibling?.querySelector('.lora-card-name');
      if (nameEl) nameEl.textContent = value || '（未設定）';
    }
  }
}
function addLoraRow() {
  _loraList.push({
    name:          '',
    strengthModel: 1,
    strengthClip:  1,
    triggerWords:  '',
    enabled:       true,
  });
  renderLoraList();
  // 追加したカードを展開
  setTimeout(() => toggleLoraCard(_loraList.length - 1), 50);
}
function removeLoraRow(idx) {
  _loraList.splice(idx, 1);
  renderLoraList();
}
function initLoraList(loras) {
  _loraList = loras ? JSON.parse(JSON.stringify(loras)) : [];
  renderLoraList();
}

// ─────────────────────────────────────────────
// アバター
// ─────────────────────────────────────────────
function handleAvatarUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 200;
      const ctx  = canvas.getContext('2d');
      const size = Math.min(img.width, img.height);
      const sx   = (img.width  - size) / 2;
      const sy   = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      _editingIconData = base64;
      showAvatarPreview(base64);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function showAvatarPreview(base64) {
  const emojiEl   = document.getElementById('avatarEmoji');
  const previewEl = document.getElementById('avatarPreview');
  if (!previewEl || !emojiEl) return;
  if (base64) {
    previewEl.src           = base64;
    previewEl.style.display = '';
    emojiEl.style.display   = 'none';
  } else {
    previewEl.style.display = 'none';
    emojiEl.style.display   = '';
  }
}
function setAvatarFromChar(char) {
  _editingIconData = char?.icon_data || null;
  const emojiEl = document.getElementById('avatarEmoji');
  if (emojiEl) emojiEl.textContent = char?.icon_emoji || '💬';
  showAvatarPreview(_editingIconData || null);
}
function getCharIconHtml(char, size = 38) {
  if (char?.icon_data) {
    return `<img src="${char.icon_data}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;display:block;">`;
  }
  return escHtml(char?.icon_emoji || '💬');
}

// ─────────────────────────────────────────────
// キャラ一覧・WFセレクト描画
// ─────────────────────────────────────────────
function renderCharList() {
  const panel = document.getElementById('panelCharList');
  if (!panel) return;
  const chars = loadChars();
  if (!chars.length) {
    panel.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--text-pale);font-size:13px;">キャラクターがいません<br>下のボタンから作成してください</div>';
    return;
  }
  panel.innerHTML = '';
  chars.forEach(char => {
    const isActive = activeChar?.id === char.id;
    const wf  = BUILTIN_WORKFLOWS.find(w => w.id === char.workflow_id);
    const div = document.createElement('div');
    div.className = 'char-card' + (isActive ? ' active' : '');
    const charJson = JSON.stringify(char).replace(/"/g, '&quot;');

    // シングルタップ → 編集 / ダブルタップ → 選択
    let tapTimer = null;
    div.addEventListener('click', () => {
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
        selectChar(char);
      } else {
        tapTimer = setTimeout(() => {
          tapTimer = null;
          openCharEdit(char);
        }, 280);
      }
    });
    const avatarHtml = char.icon_data
      ? `<img src="${char.icon_data}" style="width:46px;height:46px;object-fit:cover;border-radius:50%;border:0.5px solid var(--border-input);">`
      : `<div class="char-avatar">${escHtml(char.icon_emoji || '💬')}</div>`;
    const affLabel = (typeof affectionLabel === 'function' && isCharAffectionEnabled?.(char))
      ? affectionLabel(char.affection ?? 130)
      : (char.personality || '').split('\n')[0].slice(0, 30);
    div.innerHTML = `
      ${avatarHtml}
      <div class="char-info">
        <div class="char-name">${escHtml(char.name)}</div>
        <div class="char-meta">${escHtml(affLabel)}</div>
        <div class="char-wf">${wf ? wf.emoji + ' ' + wf.name : ''} <span style="color:var(--text-pale);font-size:10px;">${t('char.double_tap_select', 'ダブルタップで選択')}</span></div>
      </div>
      <div class="char-actions">
        <div class="btn-icon-sm" onclick='openCharEdit(${charJson})'>✏</div>
        <div class="btn-icon-sm" onclick='exportCharJSON(${charJson})' title="キャラカードをエクスポート">📤</div>
        <button class="btn-select ${isActive ? 'current' : ''}"
          onclick='selectChar(${charJson})'>
          ${isActive ? t('char.selected_button', '選択中') : t('char.select_button', '選択')}
        </button>
      </div>
    `;
    panel.appendChild(div);
  });
}
function renderWfSelect(targetId = 'editWfSelect') {
  const sel = document.getElementById(targetId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '';
  // グローバルWFセレクトには「指定なし」を先頭に追加
  if (targetId !== 'editWfSelect') {
    const none = document.createElement('option');
    none.value = ''; none.textContent = t('misc.none', '— 指定なし —');
    sel.appendChild(none);
  }
  getAllWorkflows().forEach(wf => {
    const opt = document.createElement('option');
    opt.value = wf.id;
    opt.textContent = wf.emoji + ' ' + wf.name;
    if (wf.id === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ─────────────────────────────────────────────
// キャラクター情報モーダル（[i]ボタン）
// ─────────────────────────────────────────────
function openCharInfo() {
  if (!activeChar) { showToast(t('chat.no_char', 'キャラクターを選択してください')); return; }

  const char      = activeChar;
  const affValue  = char.affection ?? 130;
  const stageLabel = typeof affectionLabel    === 'function' ? affectionLabel(affValue)    : '';
  const notes     = char.memory_notes || [];
  const ctx       = activeSession?.context || {};
  const isFirst   = char.is_first_meeting !== false;

  const body = document.getElementById('charInfoBody');
  if (!body) return;

  const row = (label, value) => value ? `
    <div style="margin-bottom:12px;">
      <div class="section-label" style="margin-bottom:4px;">${label}</div>
      <div style="font-size:13px;color:var(--text);line-height:1.6;">${escHtml(value)}</div>
    </div>` : '';

  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:4px;">

      <!-- キャラ名・アイコン -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div id="charInfoAvatar" style="width:48px;height:48px;border-radius:50%;overflow:hidden;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;cursor:pointer;" onclick="closeModal('charInfoOverlay');openCharEdit(activeChar);" title="${t('char.tap_edit', 'タップして編集')}">
          ${char.icon_data
            ? `<img src="${char.icon_data}" style="width:100%;height:100%;object-fit:cover;">`
            : escHtml(char.icon_emoji || '💬')}
        </div>
        <div>
          <div style="font-size:16px;font-weight:bold;color:var(--text);">${escHtml(char.name)}</div>
          <div style="font-size:11px;color:var(--text-pale);">${t('char.tap_edit', 'タップして編集')}</div>
          ${char.user_name ? `<div style="font-size:12px;color:var(--text-dim);">${t('char.call_as', '呼び方: ')}${escHtml(char.user_name)}</div>` : ''}
        </div>
      </div>

      <!-- 親愛度 -->
      ${(typeof isCharAffectionEnabled === 'function' && isCharAffectionEnabled(char)) ? `
      <div style="margin-bottom:12px;">
        <div class="section-label" style="margin-bottom:4px;">${t('aff.title', '親愛度')}</div>
        <div style="font-size:13px;color:var(--text);">${escHtml(stageLabel)}（${affValue} / 255）</div>
      </div>

      <!-- 初対面 -->
      <div style="margin-bottom:12px;">
        <div class="section-label" style="margin-bottom:4px;">${t('char.relationship', '関係')}</div>
        <div style="font-size:13px;color:var(--text);">${isFirst ? t('char.first_meeting_status', '初対面') : t('char.known_status', '既知の間柄')}</div>
      </div>` : ''}

      ${row(t('char.current_appearance', '現在の外見'), ctx.appearance)}
      ${row(t('char.current_location', '現在の場所'), ctx.location)}

      <!-- 前回セッション概要 -->
      ${ctx.summary ? `
      <div style="margin-bottom:12px;">
        <div class="section-label" style="margin-bottom:4px;">${t('char.previous_summary', '前回のセッション概要')}</div>
        <div style="font-size:12px;color:var(--text-dim);line-height:1.6;">${escHtml(ctx.summary)}</div>
      </div>` : ''}

      <!-- 記憶メモ -->
      ${notes.length ? `
      <div style="margin-bottom:12px;">
        <div class="section-label" style="margin-bottom:4px;">${t('char.memory_notes', '記憶メモ')}</div>
        ${notes.map((n, i) => `
        <div style="display:flex;align-items:flex-start;gap:6px;line-height:1.8;">
          <div style="font-size:13px;color:var(--text);flex:1;">・${escHtml(n)}</div>
          <button onclick="deleteMemoryNote(${i})" style="flex-shrink:0;background:none;border:none;color:var(--text-pale);font-size:14px;cursor:pointer;padding:0 2px;line-height:1.8;" title="${t('delete', '削除')}">×</button>
        </div>`).join('')}
      </div>` : ''}

    </div>
  `;

  openModal('charInfoOverlay');

  // 引き継ぎ情報がある場合はセッション開始時に自動表示（初回のみ）
}

async function deleteMemoryNote(idx) {
  if (!activeChar) return;
  if (!confirm(t('char.delete_note_confirm', 'このメモを削除しますか？'))) return;
  activeChar.memory_notes = (activeChar.memory_notes || []).filter((_, i) => i !== idx);
  await saveChar(activeChar);
  openCharInfo(); // モーダルを再描画
}

// セッション開始時に引き継ぎ情報があれば自動表示
function autoShowCharInfoIfNeeded() {
  if (!activeChar) return;
  const char       = activeChar;
  const notes      = char.memory_notes || [];
  const ctx        = activeSession?.context || {};
  const affEnabled = typeof isCharAffectionEnabled === 'function' && isCharAffectionEnabled(char);
  const hasInfo    = notes.length
    || ctx.summary
    || ctx.appearance
    || ctx.location
    || (affEnabled && char.is_first_meeting === false);
  if (hasInfo) {
    setTimeout(() => openCharInfo(), 500);
  }
}
