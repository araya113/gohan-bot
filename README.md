# gohan-bot

## セットアップ

### 1) Discord 側

- Discord Developer Portal で Application を作成
- Bot を追加し、Token を取得
- サーバーへ招待（OAuth2 > URL Generator）
  - Scopes: `bot`
  - Bot Permissions: `Read Messages/View Channels`, `Send Messages`, `Read Message History`

### 2) ローカル側

- 依存関係インストール

```bash
npm install
```

- `env.example` を参考に `.env` を作成して `TOKEN` を設定

```bash
cp env.example .env
```

`.env` は以下のようにしてください（**スペース無し推奨**）:

```bash
TOKEN=YOUR_DISCORD_BOT_TOKEN
```

## 起動

```bash
npm start
```

## MySQL とご飯履歴の保存

Bot は、定刻のご飯質問メッセージ（`src/scheduled/meal-question.ts`）に対する **返信** を受け取ると、
そのユーザーのご飯内容を MySQL の `gohan_historys` テーブルに保存します。

テーブル定義の例:

```sql
CREATE TABLE gohan_historys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  gohan TEXT NOT NULL,
  create_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`user_id` は Discord のユーザーID、`gohan` は返信メッセージ本文、`create_at` は登録日時です。

## 開発用コマンド

### 型チェック

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```
