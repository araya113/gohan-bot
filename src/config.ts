import fs from "node:fs";
import path from "node:path";

/**
 * 環境変数や設定値を管理するモジュール
 */

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readEnvFileValue(key: string): string | null {
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

export function getEnv(key: string): string | null {
  const v = process.env[key];
  if (v && String(v).trim()) return String(v).trim();
  const fromFile = readEnvFileValue(key);
  if (fromFile && String(fromFile).trim()) return String(fromFile).trim();
  return null;
}

export function getToken(): string | null {
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

export function isSnowflakeId(value: unknown): value is string {
  // Discordの snowflake は概ね 17〜20桁の数字文字列
  return typeof value === "string" && /^[0-9]{17,20}$/.test(value);
}

export interface MealQuestionConfig {
  cron: string | null;
  timezone: string | null;
  guildId: string | null;
  channelName: string | null;
  roleName: string | null;
  text: string | null;
  textMorning: string | null;
  textNoon: string | null;
  textNight: string | null;
}

export function loadMealQuestionConfig(): MealQuestionConfig {
  const mealQuestionCron = getEnv("MEAL_QUESTION_CRON");
  const mealQuestionTz = getEnv("MEAL_QUESTION_TZ");
  const mealQuestionGuildId = getEnv("MEAL_QUESTION_GUILD_ID");
  const mealQuestionChannelName = getEnv("MEAL_QUESTION_CHANNEL_NAME");
  const mealQuestionRoleName = getEnv("MEAL_QUESTION_ROLE_NAME");
  const mealQuestionText = getEnv("MEAL_QUESTION_TEXT");
  const mealQuestionTextMorning =
    getEnv("MEAL_QUESTION_TEXT_MORNING") ?? mealQuestionText;
  const mealQuestionTextNoon =
    getEnv("MEAL_QUESTION_TEXT_NOON") ?? mealQuestionText;
  const mealQuestionTextNight =
    getEnv("MEAL_QUESTION_TEXT_NIGHT") ?? mealQuestionText;

  return {
    cron: mealQuestionCron,
    timezone: mealQuestionTz,
    guildId: mealQuestionGuildId,
    channelName: mealQuestionChannelName,
    roleName: mealQuestionRoleName,
    text: mealQuestionText,
    textMorning: mealQuestionTextMorning,
    textNoon: mealQuestionTextNoon,
    textNight: mealQuestionTextNight,
  };
}

export interface MySQLConfig {
  host: string | null;
  port: number | null;
  user: string | null;
  password: string | null;
  database: string | null;
}

export function loadMySQLConfig(): MySQLConfig | null {
  const host = getEnv("MYSQL_HOST");
  const portStr = getEnv("MYSQL_PORT");
  const port = portStr ? Number.parseInt(portStr, 10) : null;
  const user = getEnv("MYSQL_USER");
  const password = getEnv("MYSQL_PASSWORD");
  const database = getEnv("MYSQL_DATABASE");

  // 必須項目が揃っていない場合はnullを返す
  if (!host || !user || !database) {
    return null;
  }

  return {
    host,
    port: port ?? 3306,
    user,
    password: password ?? null,
    database,
  };
}

/**
 * OpenAI APIキーを取得
 */
export function getOpenAIApiKey(): string | null {
  return getEnv("OPENAI_API_KEY");
}
