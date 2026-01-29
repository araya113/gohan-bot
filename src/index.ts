import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { Message } from "discord.js";
import "dotenv/config";
import { getToken, loadMealQuestionConfig, loadMySQLConfig } from "./config.js";
import { initializePrisma, cleanupExpiredTrackedMessageIds } from "./prisma.js";
import { handleRunaCommand } from "./commands/runa.js";
import { handleHistoryCommand } from "./commands/history.js";
import { handleNutritionCommand } from "./commands/nutrition.js";
import {
  setupMealQuestionSchedule,
  handleMealReply,
} from "./scheduled/meal-question.js";
import cron from "node-cron";

const token = getToken();
if (!token) {
  console.error("TOKEN is not set");
  process.exit(1);
}

const mealQuestionConfig = loadMealQuestionConfig();

// Prisma初期化（設定がある場合のみ）
try {
  const mysqlConfig = loadMySQLConfig();
  if (mysqlConfig) {
    initializePrisma(mysqlConfig);
  }
} catch (error) {
  console.warn(
    "Prisma初期化をスキップしました:",
    error instanceof Error ? error.message : String(error)
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag ?? "unknown"}`);
  setupMealQuestionSchedule(client, mealQuestionConfig);

  // 期限切れのメッセージIDを毎日午前3時に削除
  cron.schedule(
    "0 3 * * *",
    () => {
      void cleanupExpiredTrackedMessageIds();
    },
    { timezone: mealQuestionConfig.timezone ?? "Asia/Tokyo" }
  );
  console.log("期限切れメッセージIDのクリーンアップスケジュールを設定しました");
});

client.on("messageCreate", async (message: Message) => {
  if (!message || message.author?.bot) return;

  const content = (message.content ?? "").trim();

  // るなさんコマンドの処理
  if (content === "!るなさん") {
    await handleRunaCommand(message);
    return;
  }

  // ご飯履歴コマンドの処理
  if (content === "!history") {
    await handleHistoryCommand(message);
    return;
  }

  // 栄養素分析コマンドの処理
  if (content === "!nutrition") {
    await handleNutritionCommand(message);
    return;
  }

  // ご飯質問への返信をDBに保存
  await handleMealReply(message);
});

void client.login(token);
