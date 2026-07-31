# 000: 作業指示書の運用ルール（NookResonance）

## 1. これは何か
`prompts/queue/` に置かれた連番の Markdown が、実装作業の 1 単位を表す指示書。
1 ファイル = 1 タスク = 1 レビュー単位。

## 2. 運用
- 実装者は `queue/` の若い番号から 1 つずつ着手する
- 実装と動作確認が完了したら、そのファイルを `prompts/done/` へ移動する
- `prompts/` 配下は指示書であり、移動以外の編集はしない（仕様変更が必要になったら
  新しい番号の指示書を追加する）
- `git add` / `git commit` は実行しない（ステージもしない）。コミットはレビュー後に
  ユーザーが手動で行う

## 3. 今回のシリーズ（001〜008）の全体像

外部プロジェクト **PlainChat**（`C:\develop\github\plainchat`）で実績のある
MCP ツール呼び出し基盤を NookResonance に移植し、あわせて親愛度キャップと
SSE ストリーミングを導入する。

| # | タスク | 依存 |
|---|---|---|
| 001 | 親愛度キャップ（キャラ単位） | なし（独立） |
| 002 | ツールレジストリ基盤（`src/tools/`） | なし |
| 003 | MCP クライアント ＋ clock MCP サーバー | 002 |
| 004 | 進捗通知用 SSE ＋ タイプライター表示 | なし（002/003 と並行可） |
| 005 | SSE 上のツール呼び出しループ | 003, 004 |
| 006 | ツール呼び出しの UI 表示・turn への永続化 | 005 |
| 007 | MCP サーバー設定 API ＋ 管理 UI | 003 |
| 008 | SearXNG（Web 検索 / URL 読み取り） | 007 |

## 4. PlainChat の扱い（厳守）
- **PlainChat リポジトリは読み取り専用。いかなる変更も加えないこと**
- 移植は「PlainChat のファイルを読んで NookResonance 側に新規作成する」形で行う。
  シンボリックリンク・サブモジュール・相対 require による参照はしない
- 移植元の対応表は各指示書の「前提・参照」に記載する

## 5. 両者の構造上の差異（移植時に必ず意識すること）

| | PlainChat | NookResonance |
|---|---|---|
| LLM 呼び出し | `POST /api/conversations/:id/chat`（SSE、ツールループ内蔵） | `POST /api/llm/chat`（単発 JSON、`{text}` を返す） |
| `src/mcp/` の意味 | **MCP クライアント**（外部 MCP サーバーに接続する側） | **MCP サーバー**（`get_character_profile` 等を外部に公開する側） |
| 会話履歴 | `messages` テーブル（正規化） | `sessions.turns` に JSON 配列で保持 |
| 応答の後処理 | ほぼなし | `cleanLLMResponse` / `isAbnormalOutput` / リカバリー再問い合わせが必須 |

**とくに `src/mcp/` の名前衝突に注意。** NookResonance の既存 `src/mcp/` は
MCP サーバー実装であり、移植する MCP クライアントは `src/mcp-client/` に置く。
既存 `src/mcp/` は今回のシリーズで一切変更しない。
