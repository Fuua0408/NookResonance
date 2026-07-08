# NookResonance

キャラクターと過ごす場所。  
A place to spend time with characters.

NookResonance is a multi-user character experience web app built around chat roleplay, ComfyUI image generation, photo mode, galleries, affection, and session handover. It combines character-focused roleplay with a Node.js + SQLite application stack, authentication, user-scoped data, admin controls, beginner onboarding, and Japanese/English UI support.

- [日本語](#日本語)
- [English](#english)

---

## 日本語

### 概要

NookResonance は、キャラクターとの会話・画像生成・関係性の蓄積を中心にしたWebアプリケーションです。  
チャットRP、フォトモード、ギャラリー、親愛度、引き継ぎシステムを核に、Node.js サーバー、SQLite DB、ログイン認証、ユーザー別データ管理、管理者/上級者権限、キャラクター作成ウィザード、チュートリアル、多言語UIなどを備えています。

### 主な機能

- チャットRP: キャラクターと会話しながら画像生成できます。通常モード、キャラ主導モード、生成なし会話に対応します。
- フォトモード: 翻訳、差分、直接送信の3モードで画像生成に集中できます。
- ギャラリー: キャラクターごとの生成画像を一覧・ライトボックス表示できます。サムネイルはローカルキャッシュ、原寸はComfyUIから配信します。
- 親愛度システム: 0から255の数値と9段階ラベルで関係性を管理し、LLMプロンプトへ反映します。
- セッション引き継ぎ: セッション要約、記憶メモ、親愛度変化、外見/場所、次回オープニングメッセージをLLMが提案します。
- キャラクター入出力: SillyTavern v3 JSON互換、NookResonance拡張形式のインポート/エクスポートに対応します。
- 3段階画像プロンプト推論: 服装変化、場所変化、最終プロンプト生成を分けて、会話から画像用ENプロンプトを構築します。
- Gemma4 / thinking制御: `<|think|>` と `enable_thinking=false` を使い分け、翻訳系は noThink で安定化します。
- USERフォーカス: ユーザー自身の外見を主体にした画像生成に対応します。
- キャラ主導: キャラクターが能動的に話しかけたり行動したりする方向へLLMプロンプトを切り替えます。

### NookResonance 固有の機能

- Node.js + Express API: PHP/XAMPP構成ではなく、`src/index.js` のExpressサーバーでSPAとAPIを提供します。
- SQLite永続化: `better-sqlite3` を使い、ユーザー、キャラクター、セッション、ワークフロー、設定、グローバルLoRAをDB管理します。
- ログイン認証: bcryptによるパスワードハッシュとJWTによる30日トークン認証に対応します。
- マルチユーザー: キャラクター、セッション、画像キャッシュはユーザーID単位で分離されます。
- 管理者/上級者権限: 管理者は設定、ワークフロー、グローバルLoRA、ユーザー管理を扱えます。ユーザー管理では設定画面から一般ユーザーの追加・削除が可能です（削除時はキャラクター、セッション、生成画像も一括削除）。上級者はキャラクターごとのワークフロー/LoRA項目を編集できます。
- キャラクター作成ウィザード（2モード）: 会話型ウィザード（LLMと会話しながら性別・性格・外見・服装・場所・名前を決め、ComfyUIで画像を生成）と、画像ウィザード（参考画像をアップロードしてAIが外見を読み取り、性格・場所を追加してキャラクターを作成）の2種類に対応します。
- インタラクティブチュートリアル: 実際のUI操作に近い流れで、画像生成、キャラ主導、会話、USERフォーカスを案内します。
- 日本語/英語UI: `DEFAULT_LANGUAGE` と設定画面から表示言語を切り替えられます。
- グローバルLoRA: 管理者が全ユーザー/全キャラクターに適用されるLoRAを管理できます。
- ビルトイン/カスタムワークフロー: ComfyUI API形式のワークフローを登録し、プロンプト、Seed、Sampler、Scheduler、LoRAをサーバー側で注入します。

### 必要な環境

- Node.js
- npm
- ComfyUI（別ホスト可）
- OpenAI互換のLLMサーバー（ローカルLLM可）
- ComfyUI output ディレクトリを参照できるパス

### セットアップ

```bash
npm install
copy .env.example .env
```

`.env` を編集してください。

```env
PORT=18090
DEFAULT_LANGUAGE=ja
JWT_SECRET=ここに強いランダム文字列
DEFAULT_PASSWORD=changeme
DB_PATH=./data/nookresonance.db
COMFY_OUTPUT_DIR=W:\
COMFY_URL=http://ComfyUIホスト:8188
COMFY_TIMEOUT=120

LLM_ENDPOINT=http://localhost:5000/v1
LLM_API_KEY=sk-fake
LLM_PREFIX=
LLM_MAX_TOKENS=2048
LLM_TEMP=0.7
LLM_TOP_P=0.95
LLM_TOP_K=64
LLM_REP_PENALTY=1.15
LLM_TIMEOUT=120
```

初期ユーザーを作成します。

```bash
node scripts/create-user.js admin your-password --admin
```

上級者ユーザーを作る場合:

```bash
node scripts/create-user.js alice your-password --advanced
```

起動:

```bash
npm start
```

開発用のwatch起動:

```bash
npm run dev
```

Windowsでは `start.bat` からも起動できます。既定URLは `http://localhost:18090` です。

### ComfyUI 画像保存ルール

ComfyUI の `SaveImage` ノードには、サーバー側で以下の `filename_prefix` が設定されます。

```text
nookresonance/{user_id}/{char_id}/{YYYYMMDD_HHmmss_turn_id}
```

例:

```text
nookresonance/1/12/20260609_223416_0001
```

ギャラリーは `.env` の `COMFY_OUTPUT_DIR` 配下から画像を読み、`data/cache/{user_id}/{char_id}/thumbs` にサムネイルを生成します。

### データ構成

- `data/nookresonance.db`: SQLite DB
- `data/cache/`: ユーザー別/キャラクター別サムネイルキャッシュ
- `public/`: フロントエンドSPA
- `src/routes/`: APIルート
- `scripts/create-user.js`: ユーザー作成スクリプト

### API / 権限の概要

- `/api/auth`: ログイン、パスワード変更
- `/api/users`: ユーザー一覧、追加、削除、上級者権限付与/剥奪（管理者のみ）
- `/api/characters`: ユーザー別キャラクターCRUD
- `/api/sessions`: ユーザー別セッション管理
- `/api/workflows`: ワークフロー管理（変更は管理者のみ）
- `/api/settings`: グローバル設定（変更は管理者のみ）
- `/api/images`: ギャラリー、サムネイル同期、削除マーク
- `/api/llm`: OpenAI互換LLMへのプロキシ
- `/api/comfy`: ComfyUI生成、Sampler/LoRA取得、グローバルLoRA管理

### ログ仕様

サーバーは winston を使ってコンソールとファイルに構造化ログを出力します。

**出力先**

| ファイル | 対象レベル | ローテーション |
|---|---|---|
| `logs/app.log` | info 以上 | 10 MB × 5世代 |
| `logs/error.log` | error のみ | 5 MB × 3世代 |

`logs/` ディレクトリは `.gitignore` 対象です。

**ログイベント一覧**

| message | level | 発生タイミング | 付属フィールド |
|---|---|---|---|
| `LOGIN_OK` | info | ログイン成功・JWT発行後 | `user_id`, `username`, `ip` |
| `LOGIN_FAIL` | warn | ユーザー不在またはパスワード不一致 | `username`, `ip` |
| `SESSION_START` | info | 新規セッション作成成功後 | `user_id`, `username`, `char_id`, `session_id` |
| `IMAGE_GEN_START` | info | ComfyUI へのリクエスト送信直前 | `user_id`, `username`, `char_id`, `workflow` |
| `IMAGE_GEN_DONE` | info | ComfyUI から画像パスを受け取った後 | `user_id`, `username`, `char_id`, `workflow`, `elapsed_ms` |
| `IMAGE_GEN_ERROR` | error | ComfyUI 接続エラーまたは生成タイムアウト | `user_id`, `username`, `error`, `elapsed_ms` |

**出力フォーマット（ファイル）**

```json
{"timestamp":"2026-06-11 14:23:01","level":"info","message":"LOGIN_OK","user_id":3,"username":"alice","ip":"::1"}
{"timestamp":"2026-06-11 14:25:10","level":"info","message":"SESSION_START","user_id":3,"username":"alice","char_id":7,"session_id":42}
{"timestamp":"2026-06-11 14:26:18","level":"info","message":"IMAGE_GEN_DONE","user_id":3,"username":"alice","char_id":7,"workflow":"anima","elapsed_ms":18204}
```

パスワード・JWTトークン・チャット/プロンプト本文はログに含まれません。

---

### 開発メモ

- フロント更新時にブラウザキャッシュが残る場合は、scriptタグのバージョンやService Worker相当のキャッシュ設定を更新してください。
- 画像生成が失敗する場合は、`COMFY_URL`、`COMFY_OUTPUT_DIR`、ComfyUIのワークフロー設定、SaveImageノードの有無を確認してください。
- LLM出力にthinkingタグや異常出力が混入する場合は、`LLM_ENDPOINT`、`LLM_TEMP`、`LLM_TOP_P`、`LLM_TOP_K`、`LLM_REP_PENALTY`、`noThink`対象処理を確認してください。

---

## English

### Overview

NookResonance is a web application for spending time with fictional characters through conversation, image generation, and persistent relationship state.  
It combines chat roleplay, photo mode, gallery browsing, affection tracking, and session handover with a Node.js server, SQLite persistence, login authentication, user-scoped data, admin/advanced roles, a character creation wizard, an interactive tutorial, and Japanese/English UI support.

### Core Features

- Chat roleplay: Talk with characters and optionally generate images from the conversation.
- Photo mode: Generate images through translate, diff, or direct prompt modes.
- Gallery: Browse generated images per character with thumbnails, carousel, and lightbox viewing.
- Affection system: Track relationship state from 0 to 255 with 9 labels and inject it into LLM prompts.
- Session handover: Let the LLM summarize a session and propose memory notes, affection changes, appearance/location carryover, and the next opening message.
- Character import/export: Supports SillyTavern v3 compatible JSON plus NookResonance extension data.
- 3-step image prompt inference: Separates clothing change, location change, and final prompt generation.
- Gemma4 / thinking control: Uses `<|think|>` and `enable_thinking=false` depending on task type.
- USER focus: Generate images centered on the user's appearance.
- Character-led mode: Prompts the character to speak and act more proactively.

### NookResonance-Specific Features

- Node.js + Express API: The app is served by `src/index.js`, not the original PHP/XAMPP stack.
- SQLite persistence: Users, characters, sessions, workflows, settings, and global LoRAs are stored in SQLite through `better-sqlite3`.
- Authentication: Passwords are hashed with bcrypt, and login uses 30-day JWT tokens.
- Multi-user isolation: Characters, sessions, and gallery caches are separated by user ID.
- Admin / advanced roles: Admins can manage settings, workflows, global LoRAs, and users. The user management panel in settings allows adding new users and deleting existing ones — deletion removes the user's characters, sessions, thumbnail cache, and generated images. Advanced users can edit character workflow and LoRA fields.
- Character creation wizard (two modes): A conversation wizard (answer LLM questions about gender, personality, appearance, clothing, location, and name, with optional ComfyUI image generation) and an image wizard (upload a reference image, have the AI read the appearance, then add personality and location to create the character).
- Interactive tutorial: Walks users through generation, character-led mode, conversation mode, and USER focus mode.
- Japanese/English UI: Display language can be controlled through `DEFAULT_LANGUAGE` and the settings screen.
- Global LoRA: Admin-managed LoRAs can be applied across all users and characters.
- Built-in/custom workflows: ComfyUI API-format workflows can be registered and populated server-side with prompts, seeds, samplers, schedulers, and LoRAs.

### Requirements

- Node.js
- npm
- ComfyUI, local or remote
- OpenAI-compatible LLM server, local models supported
- A readable path to the ComfyUI output directory

### Setup

```bash
npm install
copy .env.example .env
```

Edit `.env`.

```env
PORT=18090
DEFAULT_LANGUAGE=en
JWT_SECRET=put-a-strong-random-secret-here
DEFAULT_PASSWORD=changeme
DB_PATH=./data/nookresonance.db
COMFY_OUTPUT_DIR=W:\
COMFY_URL=http://your-comfyui-host:8188
COMFY_TIMEOUT=120

LLM_ENDPOINT=http://localhost:5000/v1
LLM_API_KEY=sk-fake
LLM_PREFIX=
LLM_MAX_TOKENS=2048
LLM_TEMP=0.7
LLM_TOP_P=0.95
LLM_TOP_K=64
LLM_REP_PENALTY=1.15
LLM_TIMEOUT=120
```

Create the first admin user.

```bash
node scripts/create-user.js admin your-password --admin
```

Create an advanced user when needed.

```bash
node scripts/create-user.js alice your-password --advanced
```

Start the server.

```bash
npm start
```

Development watch mode:

```bash
npm run dev
```

On Windows, `start.bat` can also start the app. The default URL is `http://localhost:18090`.

### ComfyUI File Naming

The server sets the following `filename_prefix` on the ComfyUI `SaveImage` node:

```text
nookresonance/{user_id}/{char_id}/{YYYYMMDD_HHmmss_turn_id}
```

Example:

```text
nookresonance/1/12/20260609_223416_0001
```

The gallery reads images from `COMFY_OUTPUT_DIR` and stores thumbnails under `data/cache/{user_id}/{char_id}/thumbs`.

### Data Layout

- `data/nookresonance.db`: SQLite database
- `data/cache/`: per-user and per-character thumbnail cache
- `public/`: frontend SPA
- `src/routes/`: API routes
- `scripts/create-user.js`: user creation script

### API / Permission Summary

- `/api/auth`: login and password change
- `/api/users`: user list, add, delete, and advanced-role updates, admin only
- `/api/characters`: user-scoped character CRUD
- `/api/sessions`: user-scoped session management
- `/api/workflows`: workflow management, write access admin only
- `/api/settings`: global settings, write access admin only
- `/api/images`: gallery, thumbnail sync, removed-image markers
- `/api/llm`: proxy to an OpenAI-compatible LLM server
- `/api/comfy`: ComfyUI generation, sampler/LoRA lookup, global LoRA management
- `/mcp` (`/api/mcp`): MCP JSON-RPC endpoint. With a Bearer JWT, use `list_characters`, `search_characters`, and `get_character_profile` to find characters and read personality, speaking tone, and affection for the authenticated user.

### Logging

The server uses winston to write structured logs to the console and to files.

**Output files**

| File | Level | Rotation |
|---|---|---|
| `logs/app.log` | info and above | 10 MB × 5 files |
| `logs/error.log` | error only | 5 MB × 3 files |

The `logs/` directory is excluded from git.

**Log events**

| message | level | When | Fields |
|---|---|---|---|
| `LOGIN_OK` | info | Login succeeded, JWT issued | `user_id`, `username`, `ip` |
| `LOGIN_FAIL` | warn | User not found or wrong password | `username`, `ip` |
| `SESSION_START` | info | New session created | `user_id`, `username`, `char_id`, `session_id` |
| `IMAGE_GEN_START` | info | Before submitting to ComfyUI | `user_id`, `username`, `char_id`, `workflow` |
| `IMAGE_GEN_DONE` | info | After receiving the image path from ComfyUI | `user_id`, `username`, `char_id`, `workflow`, `elapsed_ms` |
| `IMAGE_GEN_ERROR` | error | ComfyUI connection error or generation timeout | `user_id`, `username`, `error`, `elapsed_ms` |

**File format**

```json
{"timestamp":"2026-06-11 14:23:01","level":"info","message":"LOGIN_OK","user_id":3,"username":"alice","ip":"::1"}
{"timestamp":"2026-06-11 14:25:10","level":"info","message":"SESSION_START","user_id":3,"username":"alice","char_id":7,"session_id":42}
{"timestamp":"2026-06-11 14:26:18","level":"info","message":"IMAGE_GEN_DONE","user_id":3,"username":"alice","char_id":7,"workflow":"anima","elapsed_ms":18204}
```

Passwords, JWT tokens, and chat/prompt text are never included in logs.

---

### Development Notes

- If frontend updates appear stale, update script version parameters or cache-related settings.
- If image generation fails, check `COMFY_URL`, `COMFY_OUTPUT_DIR`, workflow mapping, and the presence of a `SaveImage` node.
- If LLM output contains thinking tags or abnormal fragments, review the LLM settings and the task's `noThink` behavior.
