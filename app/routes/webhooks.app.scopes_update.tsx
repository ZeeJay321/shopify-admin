import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!isStringArray(payload.current)) {
    console.error(
      `APP_SCOPES_UPDATE webhook for ${shop} has invalid payload.current; acknowledging without updating session.`,
    );
    return new Response();
  }

  try {
    if (session) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: payload.current.toString(),
        },
      });
    }

    return new Response();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `APP_SCOPES_UPDATE webhook processing failed for ${shop}: ${message}`,
    );
    return new Response("Webhook processing failed", { status: 500 });
  }
};
