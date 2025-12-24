import type { Message } from "discord.js";
import type { RowDataPacket } from "mysql2/promise";
import { queryMySQL } from "../mysql.js";

interface GohanHistoryRow extends RowDataPacket {
  gohan: string;
  create_at: Date | string;
}

/**
 * !history コマンドの処理
 * 実行したユーザーのご飯履歴を gOHAN_historys から取得して表示する
 */
export async function handleHistoryCommand(
  message: Message
): Promise<void> {
  try {
    // 入力したユーザーのIDを取得
    if (!message.author) {
      await message.reply("ユーザー情報を取得できませんでした。");
      return;
    }

    const userId = message.author.id;

    // gohan_historys の user_id で絞り込み
    const [rows] = await queryMySQL<GohanHistoryRow>(
      "SELECT gohan, create_at FROM gohan_historys WHERE user_id = ? ORDER BY create_at DESC LIMIT 10",
      [userId]
    );

    if (rows.length === 0) {
      await message.reply("あなたのご飯履歴はまだありません。");
      return;
    }

    const lines = rows.map((row) => {
      const date =
        row.create_at instanceof Date
          ? row.create_at.toISOString().replace("T", " ").slice(0, 19)
          : String(row.create_at);
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


