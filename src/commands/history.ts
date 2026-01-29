import type { Message } from "discord.js";
import { getGohanHistory } from "../prisma.js";

/**
 * !history コマンドの処理
 * 実行したユーザーのご飯履歴を gohan_historys から取得して表示する
 */
export async function handleHistoryCommand(message: Message): Promise<void> {
  try {
    // 入力したユーザーのIDを取得
    if (!message.author) {
      await message.reply("ユーザー情報を取得できませんでした。");
      return;
    }

    const userId = message.author.id;

    const rows = await getGohanHistory(userId, 10);

    if (rows.length === 0) {
      await message.reply("あなたのご飯履歴はまだありません。");
      return;
    }

    const lines = rows.map((row) => {
      const dateObj =
        row.createAt instanceof Date
          ? row.createAt
          : new Date(String(row.createAt));
      // 日本時間（JST）に変換して表示
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(dateObj);

      const year = parts.find((p) => p.type === "year")?.value ?? "";
      const month = parts.find((p) => p.type === "month")?.value ?? "";
      const day = parts.find((p) => p.type === "day")?.value ?? "";
      const hour = parts.find((p) => p.type === "hour")?.value ?? "";
      const minute = parts.find((p) => p.type === "minute")?.value ?? "";
      const second = parts.find((p) => p.type === "second")?.value ?? "";

      const date = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
      return `${date}: ${row.gohan}`;
    });

    const header = "直近のご飯履歴（最大10件）:\n";
    await message.reply(header + lines.join("\n"));
  } catch (e) {
    console.error("handleHistoryCommand failed:", e);
    try {
      await message.reply("ご飯履歴の取得に失敗しました。");
    } catch {
      // ignore reply error
    }
  }
}
