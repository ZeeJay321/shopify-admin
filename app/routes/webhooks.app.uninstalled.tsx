import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    return new Response();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `APP_UNINSTALLED webhook processing failed for ${shop}: ${message}`,
    );
    return new Response("Webhook processing failed", { status: 500 });
  }
};
