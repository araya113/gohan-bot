import type {
  Guild,
  GuildBasedChannel,
  Role,
  TextBasedChannel,
  Message,
} from "discord.js";
import type { Client } from "discord.js";
import cron from "node-cron";
import type { MealQuestionConfig } from "../config.js";
import { isSnowflakeId } from "../config.js";
import {
  insertGohanHistory,
  insertTrackedMessageId,
  isTrackedMessageId,
} from "../mysql.js";

// Botが送信した「ご飯質問メッセージ」のIDを保持する
const mealQuestionMessageIds = new Set<string>();

async function resolveTargetGuild(
  client: Client,
  config: MealQuestionConfig
): Promise<Guild | null> {
  if (config.guildId) {
    if (!isSnowflakeId(config.guildId)) {
      console.error(
        `定刻投稿: MEAL_QUESTION_GUILD_ID が不正です（数値IDを入れてください）: "${config.guildId}"`
      );
      return null;
    }
    return await client.guilds.fetch(config.guildId);
  }

  const guilds = await client.guilds.fetch();
  if (guilds.size === 1) {
    const only = guilds.first();
    return only ? await client.guilds.fetch(only.id) : null;
  }

  return null;
}

async function resolveTargetChannel(
  guild: Guild | null,
  channelName: string | null
): Promise<GuildBasedChannel | null> {
  if (!guild) return null;

  // 名前検索（チャンネル一覧を fetch してから cache から探す）
  await guild.channels.fetch();
  if (!channelName) return null;
  return guild.channels.cache.find((ch) => ch?.name === channelName) ?? null;
}

async function resolveTargetRole(
  guild: Guild | null,
  roleName: string | null
): Promise<Role | null> {
  if (!guild) return null;

  await guild.roles.fetch();
  if (!roleName) return null;
  return guild.roles.cache.find((r) => r?.name === roleName) ?? null;
}

function getHourInTimeZone(timeZone: string): number {
  // Node の Intl を使って TZ 上の「時」を取得する
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date());

  const hourPart = parts.find((p) => p.type === "hour")?.value;
  const hour = hourPart ? Number.parseInt(hourPart, 10) : Number.NaN;
  return Number.isFinite(hour) ? hour : new Date().getHours();
}

function pickMealQuestionText(config: MealQuestionConfig): string | null {
  // 朝/昼/夜の個別文言が無ければ共通文言へフォールバック（コード側の固定デフォルトは無し）
  const base = config.text;
  const morning = config.textMorning ?? base;
  const noon = config.textNoon ?? base;
  const night = config.textNight ?? base;

  if (!morning && !noon && !night) return null;

  const hour = config.timezone
    ? getHourInTimeZone(config.timezone)
    : new Date().getHours();
  // 朝/昼/夜のざっくり判定（cronが 9/13/21 なので基本この3つに綺麗に当たります）
  if (hour >= 4 && hour < 11) return morning ?? null;
  if (hour >= 11 && hour < 17) return noon ?? null;
  return night ?? null;
}

function isTextSendableChannel(
  ch: GuildBasedChannel
): ch is GuildBasedChannel & TextBasedChannel {
  return typeof (ch as unknown as { isTextBased?: () => boolean })
    .isTextBased === "function"
    ? (ch as unknown as { isTextBased: () => boolean }).isTextBased()
    : false;
}

async function sendMealQuestion(
  client: Client,
  config: MealQuestionConfig
): Promise<void> {
  const guild = await resolveTargetGuild(client, config);
  if (!guild) {
    console.error(
      "定刻投稿: 対象サーバーを特定できません。MEAL_QUESTION_GUILD_ID を設定するか、Bot参加サーバーを1つにしてください。"
    );
    return;
  }

  const channel = await resolveTargetChannel(guild, config.channelName);
  if (!channel || !isTextSendableChannel(channel)) {
    console.error(
      `定刻投稿: 対象チャンネルが見つかりません。名前を確認してください: ${config.channelName}`
    );
    return;
  }

  const role = await resolveTargetRole(guild, config.roleName);
  const mention = role ? `<@&${role.id}> ` : "";
  const picked = pickMealQuestionText(config);
  if (!picked) {
    console.error(
      "定刻投稿: 投稿文が未設定です。MEAL_QUESTION_TEXT か MEAL_QUESTION_TEXT_MORNING/NOON/NIGHT を設定してください。"
    );
    return;
  }
  const text = `${mention}${picked}`.trim();

  try {
    const sent = await channel.send(text);
    // 送信したメッセージIDをDBに保存
    await insertTrackedMessageId(sent.id, channel.id);
    // メモリ上のキャッシュにも追加（高速化のため）
    mealQuestionMessageIds.add(sent.id);
    console.log(
      `[sendMealQuestion] ご飯質問メッセージを送信しました: messageId=${sent.id}, channelId=${channel.id}`
    );
    if (mealQuestionMessageIds.size > 100) {
      // メモリが増えすぎないよう、ざっくりリセット
      mealQuestionMessageIds.clear();
      mealQuestionMessageIds.add(sent.id);
    }
  } catch (e) {
    console.error("定刻投稿: send failed:", e);
  }
}

/**
 * ご飯質問への返信メッセージを検知してDBへ保存
 */
export async function handleMealReply(message: Message): Promise<void> {
  // 返信でなければ対象外
  const refMessageId = message.reference?.messageId;
  if (!refMessageId) {
    return;
  }

  console.log(
    `[handleMealReply] 返信メッセージを検知: refMessageId=${refMessageId}`
  );

  // まず、mealQuestionMessageIdsに含まれているかチェック（メモリキャッシュによる高速化）
  let isTracked = mealQuestionMessageIds.has(refMessageId);

  // メモリキャッシュにない場合、DBから確認
  if (!isTracked) {
    isTracked = await isTrackedMessageId(refMessageId);
    if (isTracked) {
      // DBに存在した場合、次回以降の高速化のためメモリキャッシュに追加
      mealQuestionMessageIds.add(refMessageId);
      console.log(
        `[handleMealReply] DBから確認: refMessageId=${refMessageId} は追跡対象のメッセージです（メモリキャッシュに追加しました）`
      );
    } else {
      console.log(
        `[handleMealReply] 対象外の返信メッセージ: refMessageId=${refMessageId} は追跡対象のメッセージではありません`
      );
      return;
    }
  }

  const gohan = message.content.trim();
  if (!gohan) {
    console.log("[handleMealReply] メッセージ内容が空です");
    return;
  }

  const userId = message.author?.id;
  if (!userId) {
    console.error("[handleMealReply] ユーザーIDが取得できませんでした");
    return;
  }

  try {
    console.log(
      `[handleMealReply] DBに保存します: userId=${userId}, gohan=${gohan}`
    );
    await insertGohanHistory(userId, gohan);
    console.log(`[handleMealReply] DBへの保存が完了しました`);
  } catch (error) {
    // insertGohanHistory 内でログ出力しているが、念のためここでも補足
    console.error("ご飯返信の保存中にエラーが発生しました:", error);
  }
}

/**
 * 定刻送信スケジュールを設定
 */
export function setupMealQuestionSchedule(
  client: Client,
  config: MealQuestionConfig
): void {
  if (!config.cron) {
    console.log(
      "定刻投稿: MEAL_QUESTION_CRON が未設定のため、スケジュールは設定しません。"
    );
    return;
  }
  if (!config.timezone) {
    console.error(
      "定刻投稿: MEAL_QUESTION_TZ が未設定です（例: Asia/Tokyo）。スケジュールは設定しません。"
    );
    return;
  }
  if (!config.channelName) {
    console.error(
      "定刻投稿: 投稿先チャンネルが未設定です。MEAL_QUESTION_CHANNEL_NAME を設定してください。"
    );
    return;
  }
  if (config.guildId && !isSnowflakeId(config.guildId)) {
    console.error(
      `定刻投稿: MEAL_QUESTION_GUILD_ID が不正です（数値IDを入れてください）: "${config.guildId}"`
    );
    return;
  }

  if (!cron.validate(config.cron)) {
    console.error(
      `MEAL_QUESTION_CRON の形式が不正です: "${config.cron}". 例: 0 21 * * *`
    );
    return;
  }

  cron.schedule(
    config.cron,
    () => {
      void sendMealQuestion(client, config);
    },
    { timezone: config.timezone }
  );

  console.log(
    `定刻投稿スケジュールを設定しました: cron="${config.cron}", tz="${config.timezone}", channel="${config.channelName}", role="${config.roleName}"`
  );
}
