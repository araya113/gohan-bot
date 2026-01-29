import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { MySQLConfig } from "./config.js";

/**
 * Prisma接続の管理
 */

let prisma: PrismaClient | null = null;

/**
 * PrismaClientを初期化
 * @param config MySQL設定
 * @returns 初期化されたPrismaClient
 */
export function initializePrisma(config: MySQLConfig): PrismaClient {
  if (prisma) {
    return prisma;
  }

  const adapter = new PrismaMariaDb({
    host: config.host!,
    port: config.port ?? 3306,
    user: config.user!,
    password: config.password ?? undefined,
    database: config.database!,
  });

  prisma = new PrismaClient({ adapter });
  console.log("Prisma接続が確立されました");
  return prisma;
}

/**
 * PrismaClientを取得
 */
export function getPrismaClient(): PrismaClient | null {
  return prisma;
}

/**
 * Prisma接続を閉じる
 */
export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    console.log("Prisma接続を閉じました");
  }
}

/**
 * gohan_historys テーブルへレコードを追加
 * @param userId DiscordユーザーID
 * @param gohan ユーザーが送信したご飯内容
 */
export async function insertGohanHistory(
  userId: string,
  gohan: string
): Promise<void> {
  if (!prisma) {
    console.warn(
      "Prisma接続が未初期化のため、gohan_historys への保存をスキップします。"
    );
    return;
  }

  try {
    await prisma.gohanHistory.create({
      data: {
        userId,
        gohan,
      },
    });
  } catch (error) {
    console.error("gohan_historys へのINSERTに失敗しました:", error);
  }
}

/**
 * gohan_historys テーブルからユーザーの履歴を取得
 * @param userId DiscordユーザーID
 * @param limit 取得件数
 * @returns 履歴の配列
 */
export async function getGohanHistory(
  userId: string,
  limit: number = 10
): Promise<{ gohan: string; createAt: Date }[]> {
  if (!prisma) {
    throw new Error(
      "Prisma接続が初期化されていません。initializePrisma()を先に呼び出してください。"
    );
  }

  const rows = await prisma.gohanHistory.findMany({
    where: { userId },
    orderBy: { createAt: "desc" },
    take: limit,
    select: { gohan: true, createAt: true },
  });

  return rows;
}

/**
 * gohan_historys テーブルからユーザーの直近7日間の履歴を取得
 * @param userId DiscordユーザーID
 * @returns 履歴の配列
 */
export async function getGohanHistoryForNutrition(
  userId: string
): Promise<{ gohan: string; createAt: Date }[]> {
  if (!prisma) {
    throw new Error(
      "Prisma接続が初期化されていません。initializePrisma()を先に呼び出してください。"
    );
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await prisma.gohanHistory.findMany({
    where: {
      userId,
      createAt: { gte: sevenDaysAgo },
    },
    orderBy: { createAt: "desc" },
    select: { gohan: true, createAt: true },
  });

  return rows;
}

/**
 * tracked_message_ids テーブルへメッセージIDを追加
 * @param messageId 送信したメッセージID
 * @param channelId チャンネルID
 */
export async function insertTrackedMessageId(
  messageId: string,
  channelId: string
): Promise<void> {
  if (!prisma) {
    console.warn(
      "Prisma接続が未初期化のため、tracked_message_ids への保存をスキップします。"
    );
    return;
  }

  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    await prisma.trackedMessageId.create({
      data: {
        messageId,
        channelId,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("tracked_message_ids へのINSERTに失敗しました:", error);
  }
}

/**
 * tracked_message_ids テーブルにメッセージIDが存在するか確認
 * @param messageId 確認するメッセージID
 * @returns メッセージIDが存在する場合はtrue
 */
export async function isTrackedMessageId(messageId: string): Promise<boolean> {
  if (!prisma) {
    console.warn(
      "Prisma接続が未初期化のため、tracked_message_ids の確認をスキップします。"
    );
    return false;
  }

  try {
    const row = await prisma.trackedMessageId.findFirst({
      where: {
        messageId,
        expiresAt: { gt: new Date() },
      },
    });
    return row !== null;
  } catch (error) {
    console.error("tracked_message_ids の確認に失敗しました:", error);
    return false;
  }
}

/**
 * tracked_message_ids テーブルから期限切れのレコードを削除
 */
export async function cleanupExpiredTrackedMessageIds(): Promise<void> {
  if (!prisma) {
    console.warn(
      "Prisma接続が未初期化のため、tracked_message_ids のクリーンアップをスキップします。"
    );
    return;
  }

  try {
    const result = await prisma.trackedMessageId.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
      },
    });
    if (result.count > 0) {
      console.log(
        `[cleanupExpiredTrackedMessageIds] ${result.count}件の期限切れメッセージIDを削除しました`
      );
    }
  } catch (error) {
    console.error("tracked_message_ids のクリーンアップに失敗しました:", error);
  }
}
