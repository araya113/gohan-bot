import { describe, it, expect, vi, beforeEach } from "vitest";

// PrismaClientのモック
const mockCreate = vi.fn();
const mockTrackedCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockDeleteMany = vi.fn();
const mockDisconnect = vi.fn();

vi.mock("./generated/prisma/client.js", () => {
  return {
    PrismaClient: class {
      gohanHistory = {
        create: mockCreate,
        findMany: mockFindMany,
      };
      trackedMessageId = {
        create: mockTrackedCreate,
        findFirst: mockFindFirst,
        deleteMany: mockDeleteMany,
      };
      $disconnect = mockDisconnect;
    },
  };
});

vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: class {
    constructor() {
      // モックアダプター
    }
  },
}));

import {
  initializePrisma,
  getPrismaClient,
  closePrisma,
  insertGohanHistory,
  getGohanHistory,
  getGohanHistoryForNutrition,
  insertTrackedMessageId,
  isTrackedMessageId,
  cleanupExpiredTrackedMessageIds,
} from "./prisma.js";

describe("prisma", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 各テスト前にprismaをリセット
    await closePrisma();
  });

  describe("initializePrisma", () => {
    it("PrismaClientを初期化して返す", () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      const client = initializePrisma(config);
      expect(client).toBeDefined();
    });

    it("すでに初期化済みの場合は同じインスタンスを返す", () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      const client1 = initializePrisma(config);
      const client2 = initializePrisma(config);
      expect(client1).toBe(client2);
    });
  });

  describe("getPrismaClient", () => {
    it("未初期化の場合はnullを返す", () => {
      expect(getPrismaClient()).toBeNull();
    });

    it("初期化後はPrismaClientを返す", () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      expect(getPrismaClient()).toBeDefined();
    });
  });

  describe("closePrisma", () => {
    it("接続を閉じてnullにリセットする", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      await closePrisma();
      expect(getPrismaClient()).toBeNull();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("未初期化の場合は何もしない", async () => {
      await closePrisma();
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });

  describe("insertGohanHistory", () => {
    it("未初期化の場合はスキップする", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await insertGohanHistory("user1", "カレー");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("未初期化")
      );
      consoleSpy.mockRestore();
    });

    it("ご飯履歴を保存する", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockCreate.mockResolvedValueOnce({});

      await insertGohanHistory("user1", "カレー");
      expect(mockCreate).toHaveBeenCalledWith({
        data: { userId: "user1", gohan: "カレー" },
      });
    });

    it("エラーが発生してもクラッシュしない", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockCreate.mockRejectedValueOnce(new Error("DB error"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await insertGohanHistory("user1", "カレー");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("INSERTに失敗"),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("getGohanHistory", () => {
    it("未初期化の場合はエラーを投げる", async () => {
      await expect(getGohanHistory("user1")).rejects.toThrow(
        "初期化されていません"
      );
    });

    it("ユーザーの履歴を取得する", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);

      const mockData = [
        { gohan: "カレー", createAt: new Date("2025-01-01") },
        { gohan: "ラーメン", createAt: new Date("2025-01-02") },
      ];
      mockFindMany.mockResolvedValueOnce(mockData);

      const result = await getGohanHistory("user1", 10);
      expect(result).toEqual(mockData);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: "user1" },
        orderBy: { createAt: "desc" },
        take: 10,
        select: { gohan: true, createAt: true },
      });
    });
  });

  describe("getGohanHistoryForNutrition", () => {
    it("未初期化の場合はエラーを投げる", async () => {
      await expect(getGohanHistoryForNutrition("user1")).rejects.toThrow(
        "初期化されていません"
      );
    });

    it("直近7日間の履歴を取得する", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);

      const mockData = [{ gohan: "カレー", createAt: new Date("2025-01-01") }];
      mockFindMany.mockResolvedValueOnce(mockData);

      const result = await getGohanHistoryForNutrition("user1");
      expect(result).toEqual(mockData);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user1",
            createAt: { gte: expect.any(Date) },
          },
          orderBy: { createAt: "desc" },
          select: { gohan: true, createAt: true },
        })
      );
    });
  });

  describe("insertTrackedMessageId", () => {
    it("未初期化の場合はスキップする", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await insertTrackedMessageId("msg1", "ch1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("未初期化")
      );
      consoleSpy.mockRestore();
    });

    it("メッセージIDを保存する", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockTrackedCreate.mockResolvedValueOnce({});

      await insertTrackedMessageId("msg1", "ch1");
      expect(mockTrackedCreate).toHaveBeenCalledWith({
        data: {
          messageId: "msg1",
          channelId: "ch1",
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe("isTrackedMessageId", () => {
    it("未初期化の場合はfalseを返す", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await isTrackedMessageId("msg1");
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });

    it("存在する場合はtrueを返す", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockFindFirst.mockResolvedValueOnce({ messageId: "msg1" });

      const result = await isTrackedMessageId("msg1");
      expect(result).toBe(true);
    });

    it("存在しない場合はfalseを返す", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await isTrackedMessageId("msg1");
      expect(result).toBe(false);
    });

    it("エラーが発生した場合はfalseを返す", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockFindFirst.mockRejectedValueOnce(new Error("DB error"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const result = await isTrackedMessageId("msg1");
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe("cleanupExpiredTrackedMessageIds", () => {
    it("未初期化の場合はスキップする", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await cleanupExpiredTrackedMessageIds();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("未初期化")
      );
      consoleSpy.mockRestore();
    });

    it("期限切れレコードを削除する", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockDeleteMany.mockResolvedValueOnce({ count: 3 });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await cleanupExpiredTrackedMessageIds();
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lte: expect.any(Date) },
        },
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("3件の期限切れ")
      );
      consoleSpy.mockRestore();
    });

    it("削除件数が0の場合はログを出さない", async () => {
      const config = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };
      initializePrisma(config);
      mockDeleteMany.mockResolvedValueOnce({ count: 0 });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await cleanupExpiredTrackedMessageIds();
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("期限切れ")
      );
      consoleSpy.mockRestore();
    });
  });
});
