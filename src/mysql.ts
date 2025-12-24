import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import type { MySQLConfig } from "./config.js";

/**
 * MySQL接続の管理
 */

let connection: mysql.Connection | null = null;

/**
 * MySQL接続を初期化
 * @param config MySQL設定
 * @returns 初期化されたMySQL接続
 */
export async function initializeMySQL(
  config: MySQLConfig
): Promise<mysql.Connection> {
  if (connection) {
    return connection;
  }

  const connectionConfig: mysql.ConnectionOptions = {
    host: config.host!,
    port: config.port ?? 3306,
    user: config.user!,
    password: config.password ?? undefined,
    database: config.database!,
  };

  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log("MySQL接続が確立されました");
    return connection;
  } catch (error) {
    console.error("MySQL接続エラー:", error);
    throw error;
  }
}

/**
 * MySQL接続を取得
 */
export function getMySQLConnection(): mysql.Connection | null {
  return connection;
}

/**
 * MySQL接続を閉じる
 */
export async function closeMySQL(): Promise<void> {
  if (connection) {
    await connection.end();
    connection = null;
    console.log("MySQL接続を閉じました");
  }
}

/**
 * クエリを実行
 * @param query SQLクエリ
 * @param params パラメータ
 * @returns クエリ結果
 */
export async function queryMySQL<T extends RowDataPacket = RowDataPacket>(
  query: string,
  params?: unknown[]
): Promise<[T[], mysql.FieldPacket[]]> {
  if (!connection) {
    throw new Error(
      "MySQL接続が初期化されていません。initializeMySQL()を先に呼び出してください。"
    );
  }
  const result = await connection.execute<T[]>(query, params);
  // SELECTクエリの場合は最初の要素が配列になる
  const rows = Array.isArray(result[0]) ? result[0] : [];
  return [rows as T[], result[1]];
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
  if (!connection) {
    console.warn(
      "MySQL接続が未初期化のため、gohan_historys への保存をスキップします。"
    );
    return;
  }

  try {
    await connection.execute(
      "INSERT INTO gohan_historys (user_id, gohan, create_at) VALUES (?, ?, NOW())",
      [userId, gohan]
    );
  } catch (error) {
    console.error("gohan_historys へのINSERTに失敗しました:", error);
  }
}

