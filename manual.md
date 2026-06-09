# NookResonance マニュアル

## 初回セットアップ

### 1. 依存パッケージのインストール

```
npm install
```

### 2. 環境設定ファイルの作成

`.env.example` をコピーして `.env` を作成する。

```
copy .env.example .env
```

`.env` を編集する：

```
PORT=18090
JWT_SECRET=（ランダムな長い文字列。例: openssl rand -hex 32 の出力）
DEFAULT_PASSWORD=（ユーザー作成時のデフォルトパスワード）
DB_PATH=./data/nookresonance.db
COMFY_OUTPUT_DIR=W:\（ComfyUIの出力ディレクトリ）
COMFY_URL=http://172.16.1.30:8188
```

> `JWT_SECRET` は推測されにくい長いランダム文字列にすること。設定後は変更しない（変更すると全ユーザーが再ログイン必要）。

### 3. ユーザーを作成する

初回起動前に最低1人のユーザーを作成する（→「ユーザーの作り方」参照）。

---

## サーバーの起動 (start.bat)

`start.bat` をダブルクリック、またはコマンドプロンプトで実行する。

```
start.bat
```

**起動時の自動処理：**

1. `.env` が存在しない場合 → エラーを表示して終了
2. `node_modules\` が存在しない場合 → `npm install` を自動実行
3. `data\` ディレクトリが存在しない場合 → 自動作成
4. `node src/index.js` でサーバー起動

**起動後のアクセス先：**

```
http://localhost:18090
```

**停止：** コマンドプロンプトで `Ctrl + C`

---

## ユーザーの作り方

ユーザー作成は `scripts/create-user.js` をコマンドラインから実行する。  
**サーバーを起動したままでも実行できる。**

### 基本構文

```
node scripts/create-user.js <ユーザー名> [パスワード] [--admin]
```

### 例

```bash
# パスワードを指定して作成
node scripts/create-user.js alice mypassword

# パスワード省略（.envのDEFAULT_PASSWORDを使用）
node scripts/create-user.js bob

# 管理者ユーザーとして作成
node scripts/create-user.js admin mypassword --admin

# パスワード省略 + 管理者
node scripts/create-user.js admin --admin
```

### 管理者ユーザーについて

`--admin` を付けると管理者フラグが立つ。  
管理者のみ以下の操作が可能：

- ワークフローの追加・編集・削除 (`/api/workflows` POST/PUT/DELETE)
- グローバル設定の変更 (`/api/settings` PUT)

通常ユーザーは自分のキャラクター・セッションの作成・編集のみ可能。

### パスワードを後から変更する

ブラウザからログイン後、設定画面（⚙）→「パスワードを変更」から変更できる。

---

## データの場所

| 内容 | パス |
|------|------|
| データベース | `data/nookresonance.db` |
| 画像キャッシュ（サムネイル） | `data/cache/{user_id}/{char_id}/thumbs/` |
| 画像本体 | `{COMFY_OUTPUT_DIR}/alcove/{user_id}/{char_id}/` |

---

## トラブルシューティング

### ログイン時に「Failed to fetch」が出る

`Failed to fetch` はHTTPレスポンスが全く届かなかった場合に出るネットワークエラー。

**チェック1: サーバーが起動しているか確認**

`start.bat` を実行したコマンドプロンプトに以下が表示されているか確認：

```
NookResonance listening on http://localhost:18090
```

表示されていない、またはエラーが出ていれば下記を参照。

**チェック2: ブラウザのURLを確認**

`http://localhost:18090` にアクセスしているか確認。  
`index.html` をエクスプローラーからダブルクリックで開くと `file://` になり、  
APIリクエストが届かないので必ず **サーバー経由のURL** を使うこと。

**チェック3: .env の JWT_SECRET が設定されているか**

`.env` を開き `JWT_SECRET=` の右辺が空になっていないか確認。

```
JWT_SECRET=（何か文字列が入っていること。空はNG）
```

空だとログインAPIが 500 エラーを返す（その場合は「Failed to fetch」ではなく「サーバーエラー」と表示される）。

**チェック4: ポートが使用中でないか**

```
netstat -an | findstr 18090
```

別のプロセスが使っていれば `.env` の `PORT` を別の番号に変更して再起動。

---

### サーバーが起動しない

- `.env` が存在するか確認
- `JWT_SECRET` が設定されているか確認
- ポート 18090 が他のアプリに使われていないか確認（`.env` の `PORT` で変更可能）

### ログインできない（認証エラー）

- ユーザーが作成されているか確認（`node scripts/create-user.js` を実行）
- パスワードが正しいか確認

### 「Unauthorized」エラーが出る

- JWTトークンの有効期限（30日）が切れている → 再ログインする
- `JWT_SECRET` が変更された → 再ログインする
