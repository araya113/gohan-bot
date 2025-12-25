import type { Message } from "discord.js";
import type { RowDataPacket } from "mysql2/promise";
import { OpenAI, APIError } from "openai";
import { queryMySQL } from "../mysql.js";
import { getOpenAIApiKey } from "../config.js";

interface GohanHistoryRow extends RowDataPacket {
  gohan: string;
  create_at: Date | string;
}

/**
 * !nutrition コマンドの処理
 * 直近のご飯履歴から足りない栄養素を一文で教えてくれる
 */
export async function handleNutritionCommand(message: Message): Promise<void> {
  try {
    // 入力したユーザーのIDを取得
    if (!message.author) {
      await message.reply("ユーザー情報を取得できませんでした。");
      return;
    }

    const userId = message.author.id;

    // 直近7日分のご飯履歴を取得（API呼び出し前にチェックしてクレジット節約）
    const [rows] = await queryMySQL<GohanHistoryRow>(
      "SELECT gohan, create_at FROM gohan_historys WHERE user_id = ? AND create_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY create_at DESC",
      [userId]
    );

    if (rows.length === 0) {
      await message.reply(
        "直近7日間のご飯履歴がありません。まずはご飯を記録してください！"
      );
      return;
    }

    // OpenAI APIキーを取得（履歴がある場合のみ）
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      await message.reply(
        "OpenAI APIキーが設定されていません。管理者に連絡してください。"
      );
      return;
    }

    // 履歴を文字列に整形
    const historyText = rows
      .map((row) => {
        const dateObj =
          row.create_at instanceof Date
            ? row.create_at
            : new Date(String(row.create_at));
        const date = dateObj.toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
        });
        return `${date}: ${row.gohan}`;
      })
      .join("\n");

    // OpenAI APIを呼び出して栄養素分析
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたは栄養士です。ユーザーの直近の食事履歴を見て、不足している可能性が高い栄養素を一文で簡潔に教えてください。回答は日本語で、親しみやすい口調でお願いします。",
        },
        {
          role: "user",
          content: `以下の直近7日間の食事履歴を見て、足りない栄養素を一文で教えてください：\n\n${historyText}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const nutritionAdvice =
      completion.choices[0]?.message?.content?.trim() ?? null;

    if (!nutritionAdvice) {
      await message.reply("栄養素の分析に失敗しました。");
      return;
    }

    await message.reply(nutritionAdvice);
  } catch (e) {
    console.error("handleNutritionCommand failed:", e);
    try {
      let errorMessage = "栄養素分析の取得に失敗しました。";

      // OpenAI APIのエラーを詳細に処理
      if (e instanceof APIError) {
        if (e.status === 429) {
          if (e.code === "insufficient_quota") {
            errorMessage =
              "OpenAI APIのクォータを超過しています。管理者に連絡して、APIキーのクォータを確認してください。";
          } else {
            errorMessage =
              "OpenAI APIのレート制限に達しました。しばらく待ってから再度お試しください。";
          }
        } else if (e.status === 401) {
          errorMessage = "OpenAI APIキーが無効です。管理者に連絡してください。";
        } else if (e.status === 500 || e.status === 503) {
          errorMessage =
            "OpenAI APIサーバーでエラーが発生しました。しばらく待ってから再度お試しください。";
        } else {
          errorMessage = `OpenAI APIエラーが発生しました: ${e.message}`;
        }
      } else if (e instanceof Error) {
        // その他のエラー
        errorMessage = `エラーが発生しました: ${e.message}`;
      }

      await message.reply(errorMessage);
    } catch {
      // ignore reply error
    }
  }
}
