import { Prisma } from "@prisma/client";
import type { ProcessedWebhookStore } from "./idempotency.server";

export type StoredRow = {
  shop: string;
  webhookId: string;
  topic: string;
  receivedAt: Date;
};

/**
 * In-memory ProcessedWebhookStore for tests. Enforces the same
 * @@unique([shop, webhookId]) constraint as the Prisma schema, throwing the
 * same P2002 error Prisma does.
 */
export function createTestStore(now: () => Date = () => new Date()) {
  const rows: StoredRow[] = [];

  const store: ProcessedWebhookStore = {
    async create({ data }) {
      if (
        rows.some((r) => r.shop === data.shop && r.webhookId === data.webhookId)
      ) {
        throw new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`shop`,`webhookId`)",
          { code: "P2002", clientVersion: "test" },
        );
      }
      const row = { ...data, receivedAt: now() };
      rows.push(row);
      return row;
    },
    async deleteMany({ where }) {
      const before = rows.length;
      const keep = rows.filter((r) =>
        "receivedAt" in where
          ? !(r.receivedAt < where.receivedAt.lt)
          : !(r.shop === where.shop && r.webhookId === where.webhookId),
      );
      rows.splice(0, rows.length, ...keep);
      return { count: before - keep.length };
    },
  };

  return { store, rows };
}
