import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { Message } from "discord.js";
import "dotenv/config";
import { getToken, loadMealQuestionConfig, loadMySQLConfig } from "./config.js";
import { initializeMySQL } from "./mysql.js";
import { handleRunaCommand } from "./commands/runa.js";
import { handleHistoryCommand } from "./commands/history.js";
import {
  setupMealQuestionSchedule,
  handleMealReply,
} from "./scheduled/meal-question.js";

const token = getToken();
if (!token) {
  console.error("TOKEN is not set");
  process.exit(1);
}

const mealQuestionConfig = loadMealQuestionConfig();

// MySQL初期化（設定がある場合のみ）
try {
  const mysqlConfig = loadMySQLConfig();
  if (mysqlConfig) {
    await initializeMySQL(mysqlConfig);
  }
} catch (error) {
  console.warn(
    "MySQL初期化をスキップしました:",
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
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag ?? "unknown"}`);
  setupMealQuestionSchedule(client, mealQuestionConfig);
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

  // ご飯質問への返信をDBに保存
  await handleMealReply(message);
});

void client.login(token);
