# gohan-bot

Discord で `test` と送ると `ごはん！` と返す Bot です。
さらに、毎日定刻に指定チャンネルへ「今日ごはんなに食べた？」を投稿できます（@ロールメンション対応）。

## セットアップ

### 1) Discord 側

- Discord Developer Portal で Application を作成
- Bot を追加し、Token を取得
- Bot の設定で **MESSAGE CONTENT INTENT** を ON（メッセージ内容で `test` を判定するため）
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

### 3) 毎日定刻に「ご飯なに食べた？」を聞く設定（任意）

`env.example` に以下の項目があります（`.env` にコピーして調整してください）:

- **MEAL_QUESTION_CRON**: cron 形式（分 時 日 月 曜日）
  - 例: `0 9,13,21 * * *`（毎日 9:00 / 13:00 / 21:00）
- **MEAL_QUESTION_TZ**: タイムゾーン（例: `Asia/Tokyo`）
- **MEAL_QUESTION_GUILD_ID / CHANNEL_ID / ROLE_ID**: 可能なら **ID 指定推奨**
  - Discord の「開発者モード」を ON にして右クリック →ID コピー
- **MEAL_QUESTION_CHANNEL_NAME / ROLE_NAME**: ID 未設定時のフォールバック（名前検索）
- **MEAL_QUESTION_TEXT**: 投稿内容（共通）
- **MEAL_QUESTION_TEXT_MORNING / NOON / NIGHT**: 朝/昼/夜で投稿内容を変える（未設定なら共通文言）

## 起動

```bash
npm start
```

## 動作

Discord の任意チャンネルで `test` と送信すると Bot が `ごはん！` と返信します。
また、設定していれば毎日定刻に指定チャンネルへ質問を投稿します。

## セキュリティ注意

Token は流出すると乗っ取られます。もし Token をチャットやログに貼ってしまった場合は、Developer Portal で **Reset Token** してください。
