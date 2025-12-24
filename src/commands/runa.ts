import type { Message } from "discord.js";

/**
 * るなさんコマンドの処理
 */
export async function handleRunaCommand(message: Message): Promise<void> {
  try {
    await message.reply("るなさんご飯食べてください");
  } catch (e) {
    console.error("reply failed:", e);
  }
}

