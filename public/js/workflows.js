/* ═════════════════════════════════════════════
   ComfyDeck Nook — workflows.js
   ビルトインWF定義・WF操作ユーティリティ
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// ビルトインワークフロー定義
// ─────────────────────────────────────────────
const BUILTIN_WORKFLOWS = [
  {
    id: 'anima',
    name: 'AnimaHighSpeed (Preset)',
    emoji: '⚡✨',
    defaults: { steps: 30, cfg: 4, sampler: 'dpmpp_sde', scheduler: 'simple', width: 864, height: 1280 },
    negative_default: 'worst quality, low quality, score_1, score_2, score_3, 6 fingers, 6 toes, ai-generated, bad eyes, bad pupils, bad iris, bad hands, bad fingers,watermark, patreon logo',
    mapping: {
      node_en_prompt:     '48',
      node_negative:      '7',
      node_seed:          '75',
      node_steps:         '79',
      node_cfg:           '80',
      node_width:         '73',
      node_height:        '74',
      node_ksampler:      '3',
      node_model:         '28',
      model_field:        'unet_name',
      model_api_node:     'UNETLoader',
      node_model_patcher: '83',
    },
    json: {"3":{"inputs":{"seed":["77",1],"steps":["79",0],"cfg":["80",0],"sampler_name":"euler","scheduler":"simple","denoise":1,"model":["83",0],"positive":["54:6",0],"negative":["7",0],"latent_image":["13",0]},"class_type":"KSampler","_meta":{"title":"Kサンプラー"}},"7":{"inputs":{"text":"worst quality, low quality, score_1, score_2, score_3, 6 fingers, 6 toes, ai-generated, bad eyes, bad pupils, bad iris, bad hands, bad fingers,watermark, patreon logo","clip":["18",0]},"class_type":"CLIPTextEncode","_meta":{"title":"Negative Prompt"}},"9":{"inputs":{"filename_prefix":"nook/output","images":["51:1",0]},"class_type":"SaveImage","_meta":{"title":"画像を保存"}},"13":{"inputs":{"width":["73",0],"height":["74",0],"batch_size":1},"class_type":"EmptySD3LatentImage","_meta":{"title":"空のSD3潜在画像"}},"18":{"inputs":{"clip_name":"qwen_3_06b_base.safetensors","type":"stable_diffusion","device":"default"},"class_type":"CLIPLoader","_meta":{"title":"CLIPを読み込む"}},"28":{"inputs":{"unet_name":"animaCatTower_v10.safetensors","weight_dtype":"default"},"class_type":"UNETLoader","_meta":{"title":"ModelSelect"}},"48":{"inputs":{"value":""},"class_type":"PrimitiveStringMultiline","_meta":{"title":"prompt"}},"73":{"inputs":{"value":864},"class_type":"PrimitiveInt","_meta":{"title":"Width"}},"74":{"inputs":{"value":1280},"class_type":"PrimitiveInt","_meta":{"title":"Height"}},"75":{"inputs":{"value":979575243657481},"class_type":"PrimitiveInt","_meta":{"title":"Image Seed"}},"77":{"inputs":{"expression":"abs(a)","values.a":["75",0]},"class_type":"ComfyMathExpression","_meta":{"title":"数式"}},"79":{"inputs":{"value":30},"class_type":"PrimitiveInt","_meta":{"title":"Image Steps"}},"80":{"inputs":{"value":4},"class_type":"PrimitiveFloat","_meta":{"title":"Image Cfg"}},"82":{"inputs":{"vae_name":"qwen_image_vae.safetensors"},"class_type":"VAELoader","_meta":{"title":"VAEを読み込む"}},"83":{"inputs":{"enable_replay":false,"block_indices":"3,4,5","denoise_start_pct":0.5,"denoise_end_pct":1,"enable_spectrum":true,"spectrum_w":0.2,"spectrum_m":16,"spectrum_lam":0.5,"spectrum_warmup_steps":2,"spectrum_window_size":2,"spectrum_flex_window":0,"model":["28",0]},"class_type":"AnimaLayerReplayPatcher","_meta":{"title":"Anima Layer Replay Patcher"}},"54:6":{"inputs":{"text":["48",0],"clip":["18",0]},"class_type":"CLIPTextEncode","_meta":{"title":"CLIPテキストエンコード（プロンプト）"}},"51:1":{"inputs":{"samples":["3",0],"vae":["82",0]},"class_type":"VAEDecode","_meta":{"title":"VAEデコード"}}},
  },
  {
    id: 'zturbo',
    name: 'zImageTurbo (Preset)',
    emoji: '⚡',
    defaults: { steps: 8, cfg: 0.3, sampler: 'dpmpp_sde', scheduler: 'simple', width: 1024, height: 1024 },
    negative_default: 'blurry ugly bad',
    mapping: {
      node_en_prompt:  '48',
      node_negative:   '7',
      node_seed:       '75',
      node_steps:      '79',
      node_cfg:        '80',
      node_width:      '73',
      node_height:     '74',
      node_ksampler:   '3',
      node_model:      '28',
      model_field:     'unet_name',
      model_api_node:  'UNETLoader',
    },
    json: {"3":{"inputs":{"seed":["77",1],"steps":["79",0],"cfg":["80",0],"sampler_name":"dpmpp_sde","scheduler":"simple","denoise":1,"model":["11",0],"positive":["54:6",0],"negative":["7",0],"latent_image":["13",0]},"class_type":"KSampler","_meta":{"title":"Kサンプラー"}},"7":{"inputs":{"text":"blurry ugly bad","clip":["18",0]},"class_type":"CLIPTextEncode","_meta":{"title":"Negative Prompt"}},"9":{"inputs":{"filename_prefix":"nook/output","images":["51:1",0]},"class_type":"SaveImage","_meta":{"title":"画像を保存"}},"11":{"inputs":{"shift":3,"model":["28",0]},"class_type":"ModelSamplingAuraFlow","_meta":{"title":"モデルサンプリングオーラフロー"}},"13":{"inputs":{"width":["73",0],"height":["74",0],"batch_size":1},"class_type":"EmptySD3LatentImage","_meta":{"title":"空のSD3潜在画像"}},"18":{"inputs":{"clip_name":"qwen_3_4b.safetensors","type":"stable_diffusion","device":"default"},"class_type":"CLIPLoader","_meta":{"title":"CLIPを読み込む"}},"28":{"inputs":{"unet_name":"zImageturboAnimeV2_v20Bf16.safetensors","weight_dtype":"default"},"class_type":"UNETLoader","_meta":{"title":"ModelSelect"}},"48":{"inputs":{"value":""},"class_type":"PrimitiveStringMultiline","_meta":{"title":"Japanese Prompt"}},"73":{"inputs":{"value":1024},"class_type":"PrimitiveInt","_meta":{"title":"Width"}},"74":{"inputs":{"value":1024},"class_type":"PrimitiveInt","_meta":{"title":"Height"}},"75":{"inputs":{"value":1082599762458846},"class_type":"PrimitiveInt","_meta":{"title":"Image Seed"}},"77":{"inputs":{"expression":"abs(a)","values.a":["75",0]},"class_type":"ComfyMathExpression","_meta":{"title":"数式"}},"79":{"inputs":{"value":8},"class_type":"PrimitiveInt","_meta":{"title":"Image Steps"}},"80":{"inputs":{"value":0.3},"class_type":"PrimitiveFloat","_meta":{"title":"Image Cfg"}},"51:0":{"inputs":{"vae_name":"ae.safetensors"},"class_type":"VAELoader","_meta":{"title":"VAEを読み込む"}},"54:6":{"inputs":{"text":["48",0],"clip":["18",0]},"class_type":"CLIPTextEncode","_meta":{"title":"CLIPテキストエンコード（プロンプト）"}},"51:1":{"inputs":{"samples":["3",0],"vae":["51:0",0]},"class_type":"VAEDecode","_meta":{"title":"VAEデコード"}}},
  },
  {
    id: 'sdxl',
    name: 'SDXL (Preset)',
    emoji: '🎨',
    defaults: { steps: 20, cfg: 6, sampler: 'dpmpp_2m', scheduler: 'karras', width: 1024, height: 1024 },
    negative_default: 'worst quality,fine quality',
    mapping: {
      node_en_prompt:  '48',
      node_negative:   '7',
      node_seed:       '75',
      node_steps:      '79',
      node_cfg:        '80',
      node_width:      '73',
      node_height:     '74',
      node_ksampler:   '3',
      node_model:      '82',
      model_field:     'ckpt_name',
      model_api_node:  'CheckpointLoaderSimple',
      node_vae_decode: '51:1',
      node_clip_skip:  '84',
    },
    json: {"3":{"inputs":{"seed":["77",1],"steps":["79",0],"cfg":["80",0],"sampler_name":"dpmpp_sde","scheduler":"simple","denoise":1,"model":["82",0],"positive":["54:6",0],"negative":["7",0],"latent_image":["13",0]},"class_type":"KSampler","_meta":{"title":"Kサンプラー"}},"7":{"inputs":{"text":"worst quality,fine quality\n","clip":["84",0]},"class_type":"CLIPTextEncode","_meta":{"title":"Negative Prompt"}},"9":{"inputs":{"filename_prefix":"nook/output","images":["51:1",0]},"class_type":"SaveImage","_meta":{"title":"画像を保存"}},"13":{"inputs":{"width":["73",0],"height":["74",0],"batch_size":1},"class_type":"EmptySD3LatentImage","_meta":{"title":"空のSD3潜在画像"}},"48":{"inputs":{"value":""},"class_type":"PrimitiveStringMultiline","_meta":{"title":"Japanese Prompt"}},"73":{"inputs":{"value":1024},"class_type":"PrimitiveInt","_meta":{"title":"Width"}},"74":{"inputs":{"value":1024},"class_type":"PrimitiveInt","_meta":{"title":"Height"}},"75":{"inputs":{"value":-795721608081744},"class_type":"PrimitiveInt","_meta":{"title":"Image Seed"}},"77":{"inputs":{"expression":"abs(a)","values.a":["75",0]},"class_type":"ComfyMathExpression","_meta":{"title":"数式"}},"79":{"inputs":{"value":8},"class_type":"PrimitiveInt","_meta":{"title":"Image Steps"}},"80":{"inputs":{"value":0.3},"class_type":"PrimitiveFloat","_meta":{"title":"Image Cfg"}},"82":{"inputs":{"ckpt_name":"songmix_v22.safetensors"},"class_type":"CheckpointLoaderSimple","_meta":{"title":"Load Checkpoint - BASE"}},"84":{"inputs":{"stop_at_clip_layer":-2,"clip":["82",1]},"class_type":"CLIPSetLastLayer","_meta":{"title":"Clip Skip"}},"54:6":{"inputs":{"text":["48",0],"clip":["84",0]},"class_type":"CLIPTextEncode","_meta":{"title":"CLIPテキストエンコード（プロンプト）"}},"51:1":{"inputs":{"samples":["3",0],"vae":["82",2]},"class_type":"VAEDecode","_meta":{"title":"VAEデコード"}}},
  },
  {
    id: 'flux',
    name: 'Flux Dev (Preset)',
    emoji: '🌊',
    defaults: { steps: 20, cfg: 1, sampler: 'euler', scheduler: 'simple', width: 1024, height: 1024 },
    negative_default: '',
    mapping: {
      node_en_prompt: '48',
      node_seed:      '75',
      node_steps:     '79',
      node_cfg:       '80',
      node_width:     '73',
      node_height:    '74',
      node_ksampler:  '3',
      node_model:     '28',
      model_field:    'unet_name',
      model_api_node: 'UNETLoader',
    },
    json: {"3":{"inputs":{"seed":["77",1],"steps":["79",0],"cfg":["80",0],"sampler_name":"euler","scheduler":"simple","denoise":1,"model":["28",0],"positive":["84",0],"negative":["84",0],"latent_image":["13",0]},"class_type":"KSampler","_meta":{"title":"Kサンプラー"}},"9":{"inputs":{"filename_prefix":"nook/output","images":["51:1",0]},"class_type":"SaveImage","_meta":{"title":"画像を保存"}},"13":{"inputs":{"width":["73",0],"height":["74",0],"batch_size":1},"class_type":"EmptySD3LatentImage","_meta":{"title":"空のSD3潜在画像"}},"28":{"inputs":{"unet_name":"flux1-dev.safetensors","weight_dtype":"default"},"class_type":"UNETLoader","_meta":{"title":"ModelSelect"}},"48":{"inputs":{"value":""},"class_type":"PrimitiveStringMultiline","_meta":{"title":"Japanese Prompt"}},"73":{"inputs":{"value":1024},"class_type":"PrimitiveInt","_meta":{"title":"Width"}},"74":{"inputs":{"value":1024},"class_type":"PrimitiveInt","_meta":{"title":"Height"}},"75":{"inputs":{"value":939010193650226},"class_type":"PrimitiveInt","_meta":{"title":"Image Seed"}},"77":{"inputs":{"expression":"abs(a)","values.a":["75",0]},"class_type":"ComfyMathExpression","_meta":{"title":"数式"}},"79":{"inputs":{"value":20},"class_type":"PrimitiveInt","_meta":{"title":"Image Steps"}},"80":{"inputs":{"value":1},"class_type":"PrimitiveFloat","_meta":{"title":"Image Cfg"}},"82":{"inputs":{"vae_name":"ae.safetensors"},"class_type":"VAELoader","_meta":{"title":"VAEを読み込む"}},"83":{"inputs":{"clip_name1":"clip_l.safetensors","clip_name2":"t5xxl_fp16.safetensors","type":"flux","device":"default"},"class_type":"DualCLIPLoader","_meta":{"title":"デュアルCLIPを読み込む"}},"84":{"inputs":{"conditioning":["54:6",0]},"class_type":"ConditioningZeroOut","_meta":{"title":"条件付けゼロアウト"}},"54:6":{"inputs":{"text":["48",0],"clip":["83",0]},"class_type":"CLIPTextEncode","_meta":{"title":"CLIPテキストエンコード（プロンプト）"}},"51:1":{"inputs":{"samples":["3",0],"vae":["82",0]},"class_type":"VAEDecode","_meta":{"title":"VAEデコード"}}},
  },
];

// ─────────────────────────────────────────────
// WF操作
// ─────────────────────────────────────────────
function getActiveWf() {
  const wfId = activeChar?.workflow_id || 'anima';
  return getAllWorkflows().find(w => w.id === wfId) || BUILTIN_WORKFLOWS[0];
}

function getLoRATriggerWords() {
  const loras = (activeChar?.workflow_params?.loras || []).filter(l => l.enabled !== false && l.triggerWords);
  return loras.map(l => l.triggerWords).join(', ');
}

function injectLoRAs(json, map, loras) {
  const modelSourceId = map.node_model || null;

  // clip_sourceノードを自動推定（v2準拠）
  // 優先: node_clip_skip → CLIPLoader → CheckpointLoaderSimple → DualCLIPLoader
  let clipSourceId = map.node_clip_skip || null;
  if (!clipSourceId) {
    clipSourceId = Object.keys(json).find(k => json[k]?.class_type === 'CLIPLoader') || null;
  }
  if (!clipSourceId) {
    clipSourceId = Object.keys(json).find(k => json[k]?.class_type === 'CheckpointLoaderSimple') || null;
  }
  if (!clipSourceId) {
    clipSourceId = Object.keys(json).find(k => json[k]?.class_type === 'DualCLIPLoader') || null;
  }

  // LoRAをチェーン接続（配列順に lora_100000, lora_100001...）
  loras.forEach((lora, idx) => {
    const loraId      = `lora_${100000 + idx}`;
    const prevModelId = idx === 0 ? modelSourceId : `lora_${100000 + idx - 1}`;
    const prevClipId  = idx === 0 ? clipSourceId  : `lora_${100000 + idx - 1}`;

    // node_clip_skipがある場合、LoRAのCLIP入力はCLIPSetLastLayerの入力元から取る
    let actualClipIn  = prevClipId;
    let actualClipSlot = 0;
    if (idx === 0 && map.node_clip_skip && clipSourceId === map.node_clip_skip) {
      const clipSkipNode = json[map.node_clip_skip];
      if (clipSkipNode?.inputs?.clip) {
        actualClipIn   = clipSkipNode.inputs.clip[0];
        actualClipSlot = clipSkipNode.inputs.clip[1] ?? 0;
      }
    }

    json[loraId] = {
      inputs: {
        lora_name:      lora.name,
        strength_model: lora.strengthModel ?? 1,
        strength_clip:  lora.strengthClip  ?? 1,
        model: [prevModelId, 0],
        clip:  [actualClipIn, actualClipSlot],
      },
      class_type: 'LoraLoader',
      _meta: { title: `LoRA ${idx + 1}: ${lora.name.split('/').pop()}` },
    };
  });

  const lastLoraId = `lora_${100000 + loras.length - 1}`;

  // KSamplerのmodel入力を付け替え
  // node_model_patcherがある場合: patcher.model = [lastLoraId, 0]（KSamplerはpatcherのまま）
  // ない場合: KSampler.model = [lastLoraId, 0]
  if (map.node_model_patcher && json[map.node_model_patcher]) {
    json[map.node_model_patcher].inputs.model = [lastLoraId, 0];
  } else if (map.node_ksampler && json[map.node_ksampler]) {
    json[map.node_ksampler].inputs.model = [lastLoraId, 0];
  }

  // CLIPの接続先を更新
  // node_clip_skipがある場合: CLIPSetLastLayerのclip入力をLoraLoaderに付け替え
  // ない場合: 全CLIPTextEncodeのclip入力を最後のLoraLoaderに付け替え
  if (map.node_clip_skip && json[map.node_clip_skip]) {
    json[map.node_clip_skip].inputs.clip = [lastLoraId, 1];
  } else {
    Object.keys(json).forEach(k => {
      if (json[k]?.class_type === 'CLIPTextEncode') {
        json[k].inputs.clip = [lastLoraId, 1];
      }
    });
  }
}

function getAllWorkflows() {
  return [...BUILTIN_WORKFLOWS, ..._customWfs];
}
