import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import { loadHealthSummary } from "../lib/product-health-api/summary.server";

/**
 * GET /api/product-health/:id — health summary for the Admin UI extensions.
 *
 * Extensions call this with a Shopify ID token (added automatically by the
 * extension's fetch). authenticate.admin verifies it, answers CORS
 * preflights, and throws 401 (with CORS headers) when the session expired.
 * The Admin API token stays on the server.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, cors, session } = await authenticate.admin(request);
  const { status, body, headers } = await loadHealthSummary(admin, params.id, {
    shop: session.shop,
    cache: appCache,
  });

  return cors(
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    }),
  );
};
