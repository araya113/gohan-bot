const fs = require("node:fs");
const path = require("node:path");

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const cron = require("node-cron");

function loadEnv() {
  // dotenv が入っていれば読む（無くても落とさない）
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    require("dotenv").config();
  } catch {
    // ignore
  }
}

function getToken() {
  // 1) 通常は process.env.TOKEN を使う
  if (process.env.TOKEN && String(process.env.TOKEN).trim()) {
    return String(process.env.TOKEN).trim();
  }

  // 2) .env の書式が `TOKEN = "..."` のように崩れていても拾えるようにする
  //    (dotenv だと key に空白が入ってしまうケースがあるため)
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return null;

  const raw = fs.readFileSync(envPath, "utf8");
  const m = raw.match(/^\s*TOKEN\s*=\s*"?([^"\n]+)"?\s*$/m);
  if (!m) return null;
  return m[1].trim();
}

loadEnv();

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readEnvFileValue(key) {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, "utf8");

  const re = new RegExp(
    `^\\s*${escapeRegExp(key)}\\s*=\\s*"?([^"\\n]+)"?\\s*$`,
    "m"
  );
  const m = raw.match(re);
  if (!m) return null;
  return m[1].trim();
}

function getEnv(key) {
  const v = process.env[key];
  if (v && String(v).trim()) return String(v).trim();
  const fromFile = readEnvFileValue(key);
  if (fromFile && String(fromFile).trim()) return String(fromFile).trim();
  return null;
}

function isSnowflakeId(value) {
  // Discordの snowflake は概ね 17〜20桁の数字文字列
  return typeof value === "string" && /^[0-9]{17,20}$/.test(value);
}

const token = getToken();
if (!token) {
  console.error(
    [
      "TOKEN が見つかりません。",
      "1) env.example を参考に .env を作成して TOKEN=... を設定してください。",
      "2) もしくは環境変数 TOKEN を設定してから起動してください。",
    ].join("\n")
  );
  process.exit(1);
}

const mealQuestionCron = getEnv("MEAL_QUESTION_CRON");
const mealQuestionTz = getEnv("MEAL_QUESTION_TZ");
const mealQuestionGuildId = getEnv("MEAL_QUESTION_GUILD_ID");
const mealQuestionChannelId = getEnv("MEAL_QUESTION_CHANNEL_ID");
const mealQuestionChannelName = getEnv("MEAL_QUESTION_CHANNEL_NAME");
const mealQuestionRoleId = getEnv("MEAL_QUESTION_ROLE_ID");
const mealQuestionRoleName = getEnv("MEAL_QUESTION_ROLE_NAME");
const mealQuestionText = getEnv("MEAL_QUESTION_TEXT");
const mealQuestionTextMorning = getEnv(
  "MEAL_QUESTION_TEXT_MORNING",
  mealQuestionText
);
const mealQuestionTextNoon = getEnv(
  "MEAL_QUESTION_TEXT_NOON",
  mealQuestionText
);
const mealQuestionTextNight = getEnv(
  "MEAL_QUESTION_TEXT_NIGHT",
  mealQuestionText
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

async function resolveTargetGuild() {
  if (mealQuestionGuildId) {
    if (!isSnowflakeId(mealQuestionGuildId)) {
      console.error(
        `定刻投稿: MEAL_QUESTION_GUILD_ID が不正です（数値IDを入れてください）: "${mealQuestionGuildId}"`
      );
      return null;
    }
    return await client.guilds.fetch(mealQuestionGuildId);
  }

  const guilds = await client.guilds.fetch();
  if (guilds.size === 1) {
    const only = guilds.first();
    return only ? await client.guilds.fetch(only.id) : null;
  }

  return null;
}

async function resolveTargetChannel(guild) {
  if (!guild) return null;
  if (mealQuestionChannelId) {
    if (!isSnowflakeId(mealQuestionChannelId)) {
      console.error(
        `定刻投稿: MEAL_QUESTION_CHANNEL_ID が不正です（数値IDを入れてください）: "${mealQuestionChannelId}"`
      );
      // IDが壊れている場合は名前検索へフォールバックさせる
    } else {
      try {
        const ch = await guild.channels.fetch(mealQuestionChannelId);
        return ch ?? null;
      } catch {
        return null;
      }
    }
  }

  // 名前検索（チャンネル一覧を fetch してから cache から探す）
  await guild.channels.fetch();
  return (
    guild.channels.cache.find((ch) => ch?.name === mealQuestionChannelName) ??
    null
  );
}

async function resolveTargetRole(guild) {
  if (!guild) return null;
  if (mealQuestionRoleId) {
    if (!isSnowflakeId(mealQuestionRoleId)) {
      console.error(
        `定刻投稿: MEAL_QUESTION_ROLE_ID が不正です（数値IDを入れてください）: "${mealQuestionRoleId}"`
      );
      // IDが壊れている場合は名前検索へフォールバックさせる
    } else {
      try {
        const role = await guild.roles.fetch(mealQuestionRoleId);
        return role ?? null;
      } catch {
        return null;
      }
    }
  }

  await guild.roles.fetch();
  return (
    guild.roles.cache.find((r) => r?.name === mealQuestionRoleName) ?? null
  );
}

function getHourInTimeZone(timeZone) {
  // Node の Intl を使って TZ 上の「時」を取得する
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date());

  const hourPart = parts.find((p) => p.type === "hour")?.value;
  const hour = hourPart ? Number.parseInt(hourPart, 10) : NaN;
  return Number.isFinite(hour) ? hour : new Date().getHours();
}

function pickMealQuestionText() {
  // 朝/昼/夜の個別文言が無ければ共通文言へフォールバック（コード側の固定デフォルトは無し）
  const base = mealQuestionText;
  const morning = mealQuestionTextMorning ?? base;
  const noon = mealQuestionTextNoon ?? base;
  const night = mealQuestionTextNight ?? base;

  if (!morning && !noon && !night) return null;

  const hour = getHourInTimeZone(mealQuestionTz);
  // 朝/昼/夜のざっくり判定（cronが 9/13/21 なので基本この3つに綺麗に当たります）
  if (hour >= 4 && hour < 11) return morning ?? null;
  if (hour >= 11 && hour < 17) return noon ?? null;
  return night ?? null;
}

async function sendMealQuestion() {
  const guild = await resolveTargetGuild();
  if (!guild) {
    console.error(
      "定刻投稿: 対象サーバーを特定できません。MEAL_QUESTION_GUILD_ID を設定するか、Bot参加サーバーを1つにしてください。"
    );
    return;
  }

  const channel = await resolveTargetChannel(guild);
  if (!channel || !channel.isTextBased?.()) {
    console.error(
      `定刻投稿: 対象チャンネルが見つかりません。ID/名前を確認してください: ${
        mealQuestionChannelId ?? mealQuestionChannelName
      }`
    );
    return;
  }

  const role = await resolveTargetRole(guild);
  const mention = role ? `<@&${role.id}> ` : "";
  const picked = pickMealQuestionText();
  if (!picked) {
    console.error(
      "定刻投稿: 投稿文が未設定です。MEAL_QUESTION_TEXT か MEAL_QUESTION_TEXT_MORNING/NOON/NIGHT を設定してください。"
    );
    return;
  }
  const text = `${mention}${picked}`.trim();

  try {
    await channel.send(text);
  } catch (e) {
    console.error("定刻投稿: send failed:", e);
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag ?? "unknown"}`);

  if (!mealQuestionCron) {
    console.log(
      "定刻投稿: MEAL_QUESTION_CRON が未設定のため、スケジュールは設定しません。"
    );
    return;
  }
  if (!mealQuestionTz) {
    console.error(
      "定刻投稿: MEAL_QUESTION_TZ が未設定です（例: Asia/Tokyo）。スケジュールは設定しません。"
    );
    return;
  }
  if (!mealQuestionChannelId && !mealQuestionChannelName) {
    console.error(
      "定刻投稿: 投稿先チャンネルが未設定です。MEAL_QUESTION_CHANNEL_ID か MEAL_QUESTION_CHANNEL_NAME を設定してください。"
    );
    return;
  }
  if (mealQuestionGuildId && !isSnowflakeId(mealQuestionGuildId)) {
    console.error(
      `定刻投稿: MEAL_QUESTION_GUILD_ID が不正です（数値IDを入れてください）: "${mealQuestionGuildId}"`
    );
    return;
  }
  if (mealQuestionChannelId && !isSnowflakeId(mealQuestionChannelId)) {
    console.error(
      `定刻投稿: MEAL_QUESTION_CHANNEL_ID が不正です（数値IDを入れてください）: "${mealQuestionChannelId}"`
    );
    // ここでは終了しない（名前検索へフォールバック可能）
  }
  if (mealQuestionRoleId && !isSnowflakeId(mealQuestionRoleId)) {
    console.error(
      `定刻投稿: MEAL_QUESTION_ROLE_ID が不正です（数値IDを入れてください）: "${mealQuestionRoleId}"`
    );
    // ここでは終了しない（名前検索へフォールバック可能）
  }

  if (!cron.validate(mealQuestionCron)) {
    console.error(
      `MEAL_QUESTION_CRON の形式が不正です: "${mealQuestionCron}". 例: 0 21 * * *`
    );
    return;
  }

  cron.schedule(
    mealQuestionCron,
    () => {
      void sendMealQuestion();
    },
    { timezone: mealQuestionTz }
  );

  console.log(
    `定刻投稿スケジュールを設定しました: cron="${mealQuestionCron}", tz="${mealQuestionTz}", channel="${
      mealQuestionChannelId ?? mealQuestionChannelName
    }", role="${mealQuestionRoleId ?? mealQuestionRoleName}"`
  );
});

client.on("messageCreate", async (message) => {
  if (!message || message.author?.bot) return;

  const content = (message.content ?? "").trim();
  if (content === "るなさん") {
    try {
      await message.reply("るなさんご飯食べてください");
    } catch (e) {
      console.error("reply failed:", e);
    }
    return;
  }
});

client.login(token);
