import "dotenv/config";
import { defineConfig } from "prisma/config";

function getDatabaseUrl(): string {
  // DATABASE_URLが直接設定されていればそれを使う
  if (process.env["DATABASE_URL"]) {
    return process.env["DATABASE_URL"];
  }

  // 既存のMYSQL_*環境変数からDATABASE_URLを構築
  const host = process.env["MYSQL_HOST"];
  const port = process.env["MYSQL_PORT"] ?? "3306";
  const user = process.env["MYSQL_USER"];
  const password = process.env["MYSQL_PASSWORD"] ?? "";
  const database = process.env["MYSQL_DATABASE"];

  if (!host || !user || !database) {
    throw new Error(
      "DATABASE_URL or MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE must be set"
    );
  }

  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
