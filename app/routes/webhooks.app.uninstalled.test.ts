import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";

const { authenticateWebhook, deleteMany } = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: authenticateWebhook,
  },
}));

vi.mock("../db.server", () => ({
  default: {
    session: {
      deleteMany,
    },
  },
}));

import { action } from "./webhooks.app.uninstalled";

const SHOP = "zj-store-eer28nlk.myshopify.com";
const SESSION = { id: "offline_session_1" };

function webhookRequest(): Request {
  return new Request("https://example.com/webhooks/app/uninstalled", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

function actionArgs(request: Request): ActionFunctionArgs {
  return { request, params: {}, context: {} } as ActionFunctionArgs;
}

describe("webhooks.app.uninstalled action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and deletes sessions when uninstall succeeds", async () => {
    const request = webhookRequest();
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      session: SESSION,
    });
    deleteMany.mockResolvedValue({ count: 1 });

    const response = await action(actionArgs(request));

    expect(authenticateWebhook).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { shop: SHOP },
    });
  });

  it("returns 500 when session deleteMany fails", async () => {
    const request = webhookRequest();
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      session: SESSION,
    });
    deleteMany.mockRejectedValue(new Error("database unavailable"));

    const response = await action(actionArgs(request));

    expect(authenticateWebhook).toHaveBeenCalledWith(request);
    expect(response.status).toBe(500);
    expect(deleteMany).toHaveBeenCalled();
  });
});
