# NookResonance — 引き継ぎドキュメント

最終更新: 2026-06-08

## プロジェクト概要

Alcove（PHP製・単一ユーザー向けキャラクター体験アプリ）を、
Node.js製・マルチユーザー対応版として再実装するプロジェクト。

- **旧作**: Alcove（XAMPP + PHP + ファイルベースJSON）
- **新作**: NookResonance（Node.js + Express + SQLite）
- **用途**: 身内向けデモ（5〜10人規模）
- **状態**: 実装完了・動作確認中

Alcoveのソースは `.alcove_ref/` に配置済み（Git管理外）。

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| ランタイム | Node.js（LTS） |
| フレームワーク | Express |
| DB | SQLite（better-sqlite3） |
| 認証 | JWT（Bearerトークン） |
| PW | bcrypt |
| サムネイル生成 | sharp |
| ポート | 18090 |
| ブランチ | main（本番）/ develop（開発） |

---

## ディレクトリ構成（実装済み）

```
NookResonance/
  src/
    index.js               ← エントリーポイント
    db.js                  ← SQLite初期化・マイグレーション
    auth.js                ← JWT認証・adminMiddleware
    builtinWorkflows.js    ← ビルトインWF定義（サーバー側）
    routes/
      auth.js              ← POST /api/auth/login, /change-password
      characters.js        ← キャラクターCRUD（権限制御付き）
      sessions.js          ← セッションCRUD
      workflows.js         ← カスタムWF CRUD（管理者のみ書き込み）
      images.js            ← 画像一覧・サムネイル・削除
      settings.js          ← グローバル設定（管理者のみ書き込み）
      comfy.js             ← ComfyUI連携・グローバルLoRA CRUD
      llm.js               ← LLMサーバープロキシ
  public/
    index.html             ← メインSPA
    js/
      app.js               ← 初期化・グローバル変数
      api.js               ← JWT認証・REST API・設定管理
      char.js              ← キャラクター操作UI
      comfyui.js           ← 画像生成・LoRA管理UI
      llm.js               ← LLM（翻訳・チャット）
      chat.js              ← チャット処理
      workflows.js         ← BUILTIN_WORKFLOWS定義・WFユーティリティ
      modals/
        settings.js        ← 設定モーダル
  data/
    nookresonance.db       ← SQLiteファイル（Git管理外）
    cache/                 ← サムネイルキャッシュ
  scripts/
    create-user.js         ← 管理者アカウント作成CLI
  .env                     ← 環境変数（Git管理外）
```

---

## DBスキーマ

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  char_data  TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  char_id    INTEGER NOT NULL REFERENCES characters(id),
  title      TEXT NOT NULL DEFAULT '無題のセッション',
  turns      TEXT NOT NULL DEFAULT '[]',  -- JSON配列
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE workflows (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  wf_data    TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE user_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, key)
);

CREATE TABLE global_loras (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  weight       REAL NOT NULL DEFAULT 1.0,
  clip_weight  REAL NOT NULL DEFAULT 1.0,
  trigger_words TEXT NOT NULL DEFAULT '',
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 権限設計

### 管理者（is_admin=1）のみ変更可能な設定

| 設定項目 | 保存先 |
|---|---|
| セッション設定（sessionTurns/sessionLimit/llmHistoryTurns） | settings テーブル |
| プロンプトスタイル（promptStyleNatural/noThinkTranslate/debugMode） | settings テーブル |
| 親愛度システム（affectionEnabled/Mutable/ForceEdit/PerTurn） | settings テーブル |
| グローバルWF設定（global_wf_* プレフィックス） | settings テーブル |
| グローバルQualityTags / Negative Prompt | settings テーブル |
| カスタムWF CRUD | workflows テーブル |
| グローバルLoRA CRUD | global_loras テーブル |

### 一般ユーザーが変更できない（サーバーで保護）キャラクター項目

- `workflow_id` — WF選択
- `workflow_params.steps/cfg/width/height/sampler/scheduler` — 生成パラメータ
- `workflow_params.loras` — LoRA設定
- `workflow_params.quality_tags` / `workflow_params.negative` — プロンプト

`PUT /api/characters/:id` では、非管理者がこれらのフィールドを送っても **DBの既存値で上書き**される（フロントとサーバーの二重保護）。

### 設定の同期フロー

1. `init()` → `GET /api/settings` → `saveSettings(rest)` でlocalStorageに保存
2. `getSetting(key)` でlocalStorageから読み出し（`"true"`→`true` 等の型変換付き）
3. 管理者の `saveSettingsFromUI()` → `PUT /api/settings` でサーバーに保存
4. 非管理者の `saveSettingsFromUI()` → localStorageのみ更新（サーバーPUTはしない）

---

## エンドポイント一覧

### 認証
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| POST | /api/auth/login | 不要 | JWT取得 |
| POST | /api/auth/change-password | JWT | PW変更 |

### キャラクター
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | /api/characters | JWT | 自分のキャラ一覧 |
| GET | /api/characters/:id | JWT | キャラ詳細 |
| POST | /api/characters | JWT | 新規作成 |
| PUT | /api/characters/:id | JWT | 更新（権限制御付き） |
| DELETE | /api/characters/:id | JWT | 削除 |

### セッション
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | /api/sessions/:char_id | JWT | セッション一覧 |
| GET | /api/sessions/:char_id/:session_id | JWT | セッション全データ |
| POST | /api/sessions/:char_id | JWT | 新規作成 |
| PUT | /api/sessions/:char_id/:session_id | JWT | 更新 |
| DELETE | /api/sessions/:char_id/:session_id | JWT | 削除 |

### 画像
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | /api/images/:char_id | JWT | 画像一覧＋サムネイルURL |
| POST | /api/images/sync/:char_id | JWT | サムネイル同期 |
| GET | /api/images/count/:char_id | JWT | 画像枚数 |
| DELETE | /api/images/:char_id/:filename | JWT | 削除 |

### ワークフロー（カスタムWF・DBに保存）
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | /api/workflows | JWT | 全件取得 |
| GET | /api/workflows/:id | JWT | 詳細 |
| POST | /api/workflows | 管理者 | 新規作成 |
| PUT | /api/workflows/:id | 管理者 | 更新 |
| DELETE | /api/workflows/:id | 管理者 | 削除 |

### 設定
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | /api/settings | JWT | 取得（全員） |
| PUT | /api/settings | 管理者 | 更新 |

### ComfyUI連携
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| POST | /api/comfy/generate | JWT | 画像生成 |
| GET | /api/comfy/samplers | JWT | サンプラー一覧 |
| GET | /api/comfy/loras | JWT | LoRAリスト |
| GET | /api/comfy/global-loras | JWT | グローバルLoRA一覧 |
| POST | /api/comfy/global-loras | 管理者 | グローバルLoRA追加 |
| PUT | /api/comfy/global-loras/:id | 管理者 | グローバルLoRA更新 |
| DELETE | /api/comfy/global-loras/:id | 管理者 | グローバルLoRA削除 |

### LLM（サーバープロキシ）
| Method | Path | 認証 | 説明 |
|---|---|---|---|
| POST | /api/llm/chat | JWT | LLMチャット（.envから接続先取得） |
| POST | /api/llm/translate | JWT | プロンプト翻訳 |

---

## ビルトインワークフローとカスタムワークフロー

### ビルトインワークフロー

フロントエンドの `public/js/workflows.js` に `BUILTIN_WORKFLOWS` 配列で定義。
サーバー側には `src/builtinWorkflows.js` に同一データをミラー定義。

| ID | 名前 |
|---|---|
| `anima` | AnimaHighSpeed (Preset) |
| `zturbo` | zImageTurbo (Preset) |
| `sdxl` | SDXL (Preset) |
| `flux` | Flux Dev (Preset) |

**重要**: `workflows` テーブルは `id INTEGER PRIMARY KEY AUTOINCREMENT` のため、
ビルトインWFは DB に保存しない。サーバーの `lookupWf()` はDBで見つからない場合に
`lookupBuiltin(id)` にフォールバックする。

### カスタムワークフロー

管理者が `POST /api/workflows` で追加するDB管理のワークフロー。
フロントの `getAllWorkflows()` = `[...BUILTIN_WORKFLOWS, ..._customWfs]`。

### ワークフロー解決の優先順位（サーバー）

1. リクエストの `workflow_id`（キャラクターに設定済みの場合）
2. `settings.global_wf_workflow_id`（管理者設定のデフォルト）
3. どちらも見つからなければ 400 エラー

### `wf_data` JSONの構造

```json
{
  "mapping": {
    "node_en_prompt": "48",
    "node_negative":  "7",
    "node_seed":      "75",
    "node_steps":     "79",
    "node_cfg":       "80",
    "node_width":     "73",
    "node_height":    "74",
    "node_ksampler":  "3",
    "node_model":     "28",
    "node_model_patcher": "83",
    "node_clip_skip": "84"
  },
  "defaults": {
    "steps": 30, "cfg": 4,
    "sampler": "dpmpp_sde", "scheduler": "simple",
    "width": 864, "height": 1280
  },
  "negative_default": "worst quality ...",
  "json": { ...ComfyUIワークフローJSON... }
}
```

---

## グローバルLoRA

`global_loras` テーブルで管理。画像生成時、グローバルLoRA → キャラクターLoRA の順で適用。
フロントの `#globalLoraOverlay` / `#globalLoraEditOverlay` で管理（管理者のみ表示）。

---

## 設定キー一覧（settings テーブル）

| キー | 型 | 説明 |
|---|---|---|
| sessionTurns | number | セッション最大ターン数 |
| sessionLimit | number | セッション上限数 |
| llmHistoryTurns | number | LLMに送る履歴ターン数 |
| promptStyleNatural | boolean | 自然語スタイル |
| noThinkTranslate | boolean | 翻訳時ノーシンク |
| debugMode | boolean | デバッグモード |
| affectionEnabled | boolean | 親愛度システム有効 |
| affectionMutable | boolean | 親愛度変動あり |
| affectionForceEdit | boolean | 強制編集モード |
| affectionPerTurn | boolean | ターンごと更新 |
| global_wf_workflow_id | string | デフォルトWF ID（例: `'anima'`） |
| global_wf_steps | string | デフォルトSteps |
| global_wf_cfg | string | デフォルトCFG |
| global_wf_width | string | デフォルトWidth |
| global_wf_height | string | デフォルトHeight |
| global_wf_sampler | string | デフォルトSampler |
| global_wf_scheduler | string | デフォルトScheduler |
| global_quality_tags | string | グローバルQualityTags |
| global_negative | string | グローバルNegative Prompt |

**注意**: DBには全値が TEXT として保存される。`GET /api/settings` では `JSON.parse()` で型復元済み。

---

## LLM接続

`src/routes/llm.js` がサーバー側プロキシ。フロントから直接LLMエンドポイントを叩かない。

`.env` で設定する変数:

```env
LLM_ENDPOINT=http://172.16.1.10:8080
LLM_MODEL=gemma-3-27b
LLM_API_KEY=（必要な場合）
LLM_MAX_TOKENS=8000
```

---

## 画像パス設計

ComfyUIのSaveImageノードに渡す `filename_prefix`:

```
alcove/{user_id}/{char_id}/{YYYYMMDD_HHmmss_turn_id}
```

サムネイルキャッシュ:

```
data/cache/{user_id}/{char_id}/thumbs/
data/cache/{user_id}/{char_id}/meta.json
```

---

## .env テンプレート

```env
PORT=18090
JWT_SECRET=（強いランダム文字列）
DB_PATH=./data/nookresonance.db
COMFY_OUTPUT_DIR=W:\
COMFY_URL=http://172.16.1.30:8188
COMFY_TIMEOUT=120
LLM_ENDPOINT=http://172.16.1.10:8080
LLM_MODEL=gemma-3-27b
LLM_API_KEY=
LLM_MAX_TOKENS=8000
```

---

## 既知の注意点・ハマりポイント

### settings の型変換
DB は全値を TEXT で保存。`"true"` / `"false"` が boolean に見えない問題を以下で対処:
- `GET /api/settings` → `JSON.parse(value)` で復元
- `getSetting()` → `"true"` → `true`、`"false"` → `false` に変換
- `initSettingsUI()` → `bool(val, default)` ヘルパーで安全に読み出し

### ビルトインWFのID
`workflows` テーブルは `INTEGER` PK のため `'anima'` 等の文字列IDはDBに存在しない。
`src/builtinWorkflows.js` を `src/routes/comfy.js` の `lookupWf()` が参照して解決。
フロントの `BUILTIN_WORKFLOWS` と **両ファイルを同期すること**。

### キャラクターの workflow_id
キャラクターに `workflow_id` が設定されていない場合、フロントは `null` のままサーバーへリクエストを投げる。
サーバーが `global_wf_workflow_id` でフォールバックするため、管理者設定でデフォルトWFを設定しておくこと。

### LLMはサーバー経由のみ
フロントから直接LLMエンドポイントへ接続しない（`.env` の接続先は公開できないため）。
`public/js/llm.js` は `restPost('llm/chat', ...)` でサーバープロキシを呼ぶ。

---

## セットアップ手順

```bash
# 依存インストール
npm install

# 管理者アカウント作成
node scripts/create-user.js admin mypassword --admin

# サーバー起動
node src/index.js
# または
npm start
```
