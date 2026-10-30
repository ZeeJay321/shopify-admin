import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";

const { authenticateWebhook, update } = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: authenticateWebhook,
  },
}));

vi.mock("../db.server", () => ({
  default: {
    session: {
      update,
    },
  },
}));

import { action } from "./webhooks.app.scopes_update";

const SHOP = "zj-store-eer28nlk.myshopify.com";
const SESSION = { id: "offline_session_1" };
const SCOPES = ["read_products"];

function webhookRequest(): Request {
  return new Request("https://example.com/webhooks/app/scopes_update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

function actionArgs(request: Request): ActionFunctionArgs {
  return { request, params: {}, context: {} } as ActionFunctionArgs;
}

describe("webhooks.app.scopes_update action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and updates session scope when scopes update succeeds", async () => {
    const request = webhookRequest();
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_SCOPES_UPDATE",
      session: SESSION,
      payload: { current: SCOPES },
    });
    update.mockResolvedValue({ ...SESSION, scope: SCOPES.toString() });

    const response = await action(actionArgs(request));

    expect(authenticateWebhook).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: {
        id: SESSION.id,
      },
      data: {
        scope: SCOPES.toString(),
      },
    });
  });

  it("returns 500 when session update fails", async () => {
    const request = webhookRequest();
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_SCOPES_UPDATE",
      session: SESSION,
      payload: { current: SCOPES },
    });
    update.mockRejectedValue(new Error("database unavailable"));

    const response = await action(actionArgs(request));

    expect(authenticateWebhook).toHaveBeenCalledWith(request);
    expect(response.status).toBe(500);
    expect(update).toHaveBeenCalled();
  });

  it("returns 200 without DB access when payload.current is invalid", async () => {
    const request = webhookRequest();
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_SCOPES_UPDATE",
      session: SESSION,
      payload: { current: "not-an-array" },
    });

    const response = await action(actionArgs(request));

    expect(authenticateWebhook).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});
