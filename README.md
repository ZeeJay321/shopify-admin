# ZJ Commerce Operations

An embedded Shopify Admin app that gives merchants an **operations layer** on top of Shopify Admin:

- **Product Health:** scores every product on content, SEO, variants, inventory and publishing, and gives the exact manual fix for each issue.
- **Admin UI extensions:** the same score on the product page, as a block and as a More actions entry.
- **Inventory Risk:** flags variants that are about to sell out, with a per-location breakdown.
- **Order Operations:** triages recent orders that need attention, without touching customer data.
- **Storefront Readiness:** an extensible, weighted checklist of whether the catalog is ready for a storefront.

**Shopify is the source of truth.** Everything is read live through the Admin GraphQL API. The app stores **no products, inventory, collections or orders**, only Shopify sessions and processed webhook ids. It is **read-only**: no mutations and no `write_*` scopes.

> This app is separate from the headless storefront (`zj-headless-storefront`), which it can optionally notify when products change.

## Contents

- [Features by phase](#features-by-phase)
- [Architecture](#architecture)
- [Scopes](#scopes)
- [Webhooks](#webhooks)
- [Shopify APIs used](#shopify-apis-used)
- [Models](#models): Product Health, Inventory Risk, Order Operations, Storefront Readiness
- [Cache](#cache)
- [Admin UI extensions](#admin-ui-extensions)
- [Security notes](#security-notes)
- [Local development](#local-development) and [Testing on a development store](#testing-on-a-development-store)
- [Limitations](#limitations)
- [Interview talking points](#interview-talking-points)
- [Screenshots](#screenshots)

## Features by phase

| Phase | Feature | Where |
|---|---|---|
| 1 | **Store Health:** product counts (via `productsCount`), average health score, products with issues, top 5 issues; links to everything else | `/app` |
| 1 | **Product Health list:** score badge, issue count, status filter, "has issues" filter, cursor pagination | `/app/products` |
| 1 | **Product Health detail:** grouped pass/warn/fail checklist with the exact fix for each issue, and a link to Shopify Admin | `/app/products/:id` |
| 2 | **"ZJ Product Health" block** and **"Run Product Health Check" action** on the Admin product page | `extensions/` |
| 3 | **Idempotent webhooks** (products and inventory) with **tag-based cache invalidation** | `/webhooks/app/catalog` |
| 3 | **Inventory Risk:** Critical, Low stock, Healthy and Not tracked; per-location breakdown; risk and location filters | `/app/inventory` |
| 3 | Optional **storefront sync hook:** a signed POST to the headless storefront on product changes | env vars |
| 4 | **Order Operations:** Today, Unfulfilled, High value and Needs attention cards; reason and severity badges; filters; no customer data | `/app/orders` |
| 4 | **Storefront Readiness:** 12 weighted checks in an extensible registry, with grouped results and affected products | `/app/readiness` |
| 4 | **Order webhooks** in the same idempotent registry, and an "Orders needing attention" card on Store Health | |

## Architecture

```
 Shopify Admin ─ embedded app (App Bridge, Polaris web components)     Admin UI extensions (Preact, s-*)
        │ session token                                                  │ fetch + Shopify ID token
        ▼                                                                ▼
 React Router routes (app/routes)
   app._index ............ Store Health            api.product-health.$id ... extension JSON (CORS)
   app.products._index ... Product Health list     webhooks.app.catalog ..... products/*, inventory_levels/update,
   app.products.$id ...... Product Health detail                              orders/create, orders/updated
   app.inventory ......... Inventory Risk          webhooks.app.uninstalled / scopes_update (template)
   app.orders ............ Order Operations
   app.readiness ......... Storefront Readiness
        │ authenticate.admin (session / ID token)          │ authenticate.webhook (HMAC)
        ▼                                                  ▼
 app/lib/services/*.server.ts ─── read through ───►  app/lib/cache/  TaggedCache (in-memory, per shop, TTL + tags)
   store-health, inventory-risk, orders, readiness            ▲ invalidateTags (no Admin API calls)
        │                                                     │
        ▼                                            app/lib/webhooks/
 app/lib/shopify/  (Admin GraphQL data layer)          handlers.ts ......... topic -> handler registry
   client.ts ............ runQuery: errors, ACCESS_DENIED,    process.server.ts ... claim -> run -> release on failure
                          throttle back-off, auth passthrough idempotency.server.ts ─► Prisma/SQLite
   pagination.ts ........ collectPages (cursors + cap)                                 Session, ProcessedWebhook
   products / inventory / orders / collections .server.ts
        │
        ▼
 Shopify Admin GraphQL API 2026-07

 Pure, unit-tested libraries (no Shopify or UI imports):
   product-health/        scoreProduct, aggregateStoreHealth, summarizeGroups
   inventory-risk/        classifyVariant, summarizeInventory
   order-ops/             classifyOrder, aggregateOrders
   storefront-readiness/  StorefrontCheck registry, evaluateReadiness
```

## Scopes

| Scope | Why | Since |
|---|---|---|
| `read_products` | Products, variants, media, SEO, options, status and Online Store URL; **collections** (`collections`, `productsCount`, product membership); the `products/*` webhooks | 1 |
| `read_inventory` | `InventoryItem.inventoryLevels` and `InventoryLevel.quantities` (available per location); the `inventory_levels/update` webhook | 3 |
| `read_locations` | The `locations` query (location filter and names) | 3 |
| `read_orders` | `orders` and `ordersCount` (**last 60 days only**); the `orders/create` and `orders/updated` webhooks | 4 |

**Scopes this app doesn't request:**
- `read_all_orders`: older orders would need Shopify's approval.
- Customer scopes.
- `read_publications`: the Online Store check uses `onlineStoreUrl`. Checking a Headless channel would need `read_publications` and is a possible follow-up.
- Any `write_*` scope.

**Protected customer data:** Shopify treats orders as protected customer data even when no personal fields are read (Level 1). The app must have **protected customer data access** configured in the Partner Dashboard: Apps → ZJ Commerce Operations → **API access requests** → Protected customer data access → Request access → select the order data use (no name, email, phone or address fields).
- Apps installed only on development stores don't need Shopify's review, but the access must still be configured.
- Without it, order queries are denied. Order Operations shows a permission banner, Store Health shows a hint, and everything else keeps working.
- `shopify app dev` / `deploy` may refuse to register the `orders/*` subscriptions. In that case, configure access, or temporarily remove that `[[webhooks.subscriptions]]` block; order data then refreshes on the 10-minute TTL.

**Existing installs must re-approve.** Adding scopes doesn't grant them. After `npm run dev` or `shopify app deploy` pushes `shopify.app.toml`, Shopify asks the merchant to approve the new access the next time the app is opened in Admin. If no prompt appears, reinstall the app on the dev store. The `app/scopes_update` webhook then updates the stored session scope. Until the merchant approves, Inventory Risk and Order Operations show permission banners, and earlier features keep working.

## Webhooks

All declared in `shopify.app.toml` (API 2026-07). The six catalog and order topics go to **one dispatcher**, [`webhooks.app.catalog.tsx`](app/routes/webhooks.app.catalog.tsx), which uses a **handler registry** ([`handlers.ts`](app/lib/webhooks/handlers.ts)).

| Topic | Why | Effect (cache tags invalidated) |
|---|---|---|
| `products/create`, `products/update`, `products/delete` | Catalog changed | `products`, `inventory`, `readiness`, `product:{id}`. Pings the storefront if configured. |
| `inventory_levels/update` | Stock changed at a location | `inventory`, `readiness`, `inventory-item:{id}` (that product's summary). Falls back to `products` if the item id is missing. |
| `orders/create`, `orders/updated` | Orders changed | `orders`. The payload (protected customer data) is never read. |
| `app/uninstalled`, `app/scopes_update` | Template session housekeeping | Delete sessions, update the stored scope |

- **No collection webhooks.** Collection-only changes, such as a new or emptied collection, reach Storefront Readiness via the 10-minute TTL or the **Recheck now** button. Product membership changes usually also fire `products/update`.
- **Idempotency: claim first, release on failure.**
  1. `authenticate.webhook` verifies the HMAC (`401` on a bad signature).
  2. The app atomically `INSERT`s `(shop, X-Shopify-Webhook-Id)` into `ProcessedWebhook`. A unique-constraint error means a duplicate: return `200` and do nothing.
  3. The handler runs (cache invalidation only, never Admin API calls).
  4. If the handler throws, the app deletes the row and returns `500`, so Shopify's retry is processed normally.
  5. Unsupported topics get `200` and a log line. Rows older than 30 days are deleted at most once an hour.
- **Large ids** are read from `admin_graphql_api_id`, because JSON numbers above 2^53 lose precision.

## Shopify APIs used

| API | Fields / usage | Module |
|---|---|---|
| `productsCount(query, limit: null)` | All / active / draft / archived counts | `products.server.ts` |
| `products`, `product(id)` | Title, status, description, SEO, options, media count, featured image, variants (price, quantity, inventory item id and tracked), `collections(first: 1)`, Online Store URL, handle | `products.server.ts` |
| `productVariants(sortKey: INVENTORY_QUANTITY)` | Product, `inventoryItem.inventoryLevels.quantities(names: ["available"])`, location | `inventory.server.ts` |
| `locations` | id, name | `inventory.server.ts` |
| `orders(sortKey: CREATED_AT, reverse)` | Name, createdAt, cancelledAt, display financial and fulfillment status, tags, current total (shop money), line items (title, quantity, variant id, product id) | `orders.server.ts` |
| `ordersCount(query, limit: null)` | Today (shop timezone), unfulfilled | `orders.server.ts` |
| `shop { ianaTimezone }` | Start of "today" | `orders.server.ts` |
| `collections` | Title, handle, `productsCount` | `collections.server.ts` |
| Webhooks | The topics above, via `authenticate.webhook` | `webhooks/` |
| Admin UI extensions 2026-07 | `admin.product-details.block.render`, `admin.product-details.action.render` | `extensions/` |

Every query is validated against the 2026-07 schema by `npm run graphql-codegen`, which also generates the response types.

## Models

All thresholds live in [`app/lib/config.ts`](app/lib/config.ts).

### Product Health ([`score.ts`](app/lib/product-health/score.ts))

| Group | Check | Weight | Rule |
|---|---|---|---|
| Content (30) | Title | 8 | Present, not a placeholder |
| | Description | 12 | ≥ 50 chars pass; 1–49 warn (6); empty fail |
| | Images | 10 | 3+ pass; 1–2 warn (6); 0 fail |
| SEO (20) | SEO title | 10 | ≤ 70 chars pass; longer warn (5); unset fail |
| | SEO description | 10 | 50–160 chars pass; else warn (5); unset fail |
| Variants (25) | Prices | 15 | Proportional share of variants priced > 0 |
| | Options | 10 | More than one variant needs real options |
| Inventory (15) | Out of stock | 10 | Proportional share of tracked variants in stock |
| | Low stock | 5 | Proportional share of tracked variants above 5 units |
| Publishing (10) | Status active | 5 | ACTIVE |
| | Online Store | 5 | Published (`onlineStoreUrl`) |

### Inventory Risk ([`inventory-risk/`](app/lib/inventory-risk/))

| Risk | Rule (tracked variants; available = sum across locations, or the filtered location) |
|---|---|
| Critical | ≤ `CRITICAL_STOCK_THRESHOLD` (2), including out of stock and oversold |
| Low stock | ≤ `LOW_STOCK_THRESHOLD` (5), the same threshold as the Product Health check |
| Healthy | > 5 |
| Not tracked | Inventory not tracked; excluded from risk |

The summary covers up to 500 variants, least stock first, up to 10 locations per variant. The table pages live with cursors, and archived products are excluded.

### Order Operations ([`order-ops/`](app/lib/order-ops/))

| Reason | Rule | Points |
|---|---|---|
| `UNFULFILLED_OVER_24H` | Open fulfillment status (unfulfilled, partial, in progress, on hold, open, pending) and older than `UNFULFILLED_ALERT_HOURS` (24) | 2 |
| `HIGH_VALUE` | Current total ≥ `HIGH_VALUE_ORDER_THRESHOLD` (500, shop currency) | 1 |
| `CONTAINS_LOW_STOCK_ITEM` | A line item's variant is Critical or Low in the cached Inventory Risk summary | 1 |

- **Severity:** HIGH at 3 or more points, MEDIUM at 2, LOW otherwise.
- **Excluded from "needs attention":** cancelled and fully refunded orders.
- **Low-stock lookup:** built once from the cached phase 3 summary, never per order. If inventory access is missing, the reason is skipped and the page says so.
- **Counts:** "Today" and "Unfulfilled" are exact `ordersCount` results. "High value" and "Needs attention" are based on the 250 most recent orders, and the page labels this.

### Storefront Readiness ([`storefront-readiness/`](app/lib/storefront-readiness/))

A check is one object:

```ts
const myCheck: StorefrontCheck = {
  id: "vendor_set", name: "Products have a vendor", description: "…",
  group: "products", severity: "warning", weight: 5,
  evaluate: (snapshot) => liveProductRatio(snapshot, (p) => /* pass? */ true),
};
defaultRegistry().register(myCheck); // duplicate ids and non-positive weights are rejected
```

| Group | Check | Severity | Weight |
|---|---|---|---|
| Products | Titles present / no placeholder titles / descriptions (≥ 50 chars) / at least one image | critical / warning / warning / critical | 10 / 5 / 10 / 10 |
| Variants | Prices above 0 / not out of stock only | critical / warning | 15 / 10 |
| SEO | SEO titles / SEO descriptions | info / info | 5 / 5 |
| Publishing | Handles / published to the Online Store | critical / critical | 5 / 10 |
| Collections | Collections exist and are non-empty / products belong to a collection | warning / warning | 5 / 10 |

- **Which products are checked:** product checks score the share of **live** (ACTIVE) products that pass.
- **Score:** `round(100 × Σ(weight × score) / Σ(weight))` over the checks that apply. Nothing is hardcoded, so adding or re-weighting a check changes the result.
- **Partial data:** if collections or product membership can't be loaded, those checks are marked N/A rather than failed.
- **Per-check results:** pass at 1, warn at 0.75 or above, fail below that. Each result includes an affected count and a list of up to 20 affected resources.
- **Data:** products come from the phase 1 sample (up to 250), and collections from a paginated query (up to 250).

## Cache

A typed `TaggedCache` interface, implemented in memory ([`memory-cache.ts`](app/lib/cache/memory-cache.ts)) and wired in [`index.server.ts`](app/lib/cache/index.server.ts). It has a 10-minute safety TTL and a 1,000-entry cap. Errors are never cached. A load is not cached if one of its tags was invalidated while it was in flight.

| Key ([`keys.ts`](app/lib/cache/keys.ts)) | Tags | Used by |
|---|---|---|
| `store-counts` | `products` | Store Health |
| `store-health-sample` | `products`, `inventory` | Store Health |
| `inventory-summary` | `inventory`, `products` | Inventory Risk; the Order Operations low-stock lookup |
| `product-health:{id}` | `product:{id}`, `inventory-item:{id}`… | Extension API |
| `orders-summary` | `orders`, `inventory` | Order Operations; the Store Health card |
| `storefront-readiness` | `readiness` | Storefront Readiness |

Tags are `shop:{shop}:{name}`, and entries are keyed by shop. **Shop isolation** is therefore structural, and tests check it explicitly. The **Recheck now** button on Storefront Readiness clears only the app's own cached report; it writes nothing to Shopify.

## Admin UI extensions

| Extension | Target | Where | What |
|---|---|---|---|
| `zj-product-health-block` ("ZJ Product Health") | `admin.product-details.block.render` | Product page, as a block near the bottom | Score, five group badges, top 3 issues, **View full report** (`app:app/products/{id}`) |
| `zj-product-health-action` ("Run Product Health Check") | `admin.product-details.action.render` | Product page → **More actions** | Modal with title, score, issue count, top issues, **Open report**, **Close** |

```
Extension ─fetch("/api/product-health/123") + Shopify ID token─► authenticate.admin (verifies token, CORS)
  ─► loadHealthSummary (cache ─► getProduct ─► scoreProduct) ─► cors(Response.json(summary)) ─► view model
```

The extensions bundle no scoring logic, only response types and a view-model mapper. Errors map to HTTP statuses:

| Error | Status |
|---|---|
| Invalid id | 400 |
| Missing permission | 403 |
| Not found | 404 |
| Throttled | 429 + `Retry-After` |
| Shopify error | 502 |
| Expired session | 401 |

## Security notes

- **No customer PII.** Order queries select no customer, email, phone or address fields. Order webhook payloads aren't read. Nothing customer-related is stored or logged. A unit test asserts the orders query contains no such fields.
- **The token never reaches the browser.** The embedded app and the extensions authenticate with short-lived session or ID tokens. The offline Admin API token stays in the server's session store, and only the data layer uses it.
- **Shop isolation.** Every cache entry, cache tag and processed-webhook row is scoped by the verified shop domain.
- **Verified webhooks.** HMAC is checked by `authenticate.webhook`. Duplicates are ignored and failures are retried.
- **Merchant-safe errors.** Raw Shopify errors go to server logs only. Pages show fixed, friendly copy.
- **No secrets in logs.** The storefront hook logs only status codes, never the secret or the signature.
- **Read-only.** No mutations and no write scopes.

## Local development

Prerequisites: Node ≥ 22.12, the Shopify CLI, a Partner account and a development store.

```sh
npm install
npx prisma migrate deploy        # Session + ProcessedWebhook
shopify auth login
shopify app config link          # link to "ZJ Commerce Operations"
npm run dev                      # tunnel, env vars, config push, installs on the dev store
```

| Command | What |
|---|---|
| `npm test` | Vitest (no store needed) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc` for the app and both extensions |
| `npm run build` | Production build |
| `shopify app build --skip-dependencies-installation` | Bundle extensions. The flag keeps the CLI from installing with pnpm, because this repo uses npm. |
| `shopify app config validate` | Validate `shopify.app.toml` and the extensions |
| `npm run graphql-codegen` | Validate the queries and regenerate the types |

**Env vars:** `shopify app dev` provides `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` and `SCOPES`. These are optional:
- `SHOP_CUSTOM_DOMAIN`
- `STOREFRONT_REVALIDATE_URL` and `STOREFRONT_REVALIDATE_SECRET`, for the storefront sync hook below.

### Storefront sync hook (optional)

When both variables are set, product webhooks send a `POST` to the storefront with this body:

```json
{ "topic": "products/update", "productId": "123", "handle": "classic-tee", "sentAt": "2026-10-30T12:00:00.000Z" }
```

- The request carries the header `X-ZJ-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the secret>`.
- `handle` is `null` on `products/delete`.
- The receiver should verify the signature with `timingSafeEqual` and may reject a stale `sentAt`.
- The request is fire-and-forget with a 3-second timeout, and a failure never affects the webhook response.

## Testing on a development store

1. **Seed products:** import [`docs/seed/problem-products.csv`](docs/seed/problem-products.csv) from Products → Import. Add 3 images to "ZJ Health Perfect Tee".
2. **Product pages:** check Store Health, Product Health, and the block and action on a product page.
3. **Inventory:** set tracked stock to 0, 2 and 4 on a few variants, then open Inventory Risk.
4. **Orders:** approve `read_orders` and configure protected customer data access, then create test orders.
   - **Draft order:** in Admin → Orders → Create order (or a draft order → Mark as paid), add a product and use any test customer.
   - **Bogus Gateway:** in Settings → Payments, enable it for test checkouts.
   - **Unfulfilled > 24h:** leave an order unfulfilled. To see it without waiting, temporarily set `UNFULFILLED_ALERT_HOURS = 0` in `config.ts`.
   - **High value:** create an order of 500 or more in shop currency, for example a quantity of 20 of a $25 product.
   - **Low-stock item:** order a variant you set to 2 units.
   - **Excluded:** cancel or fully refund an order. It drops out of "needs attention".
5. **Readiness:**
   - Open `/app/readiness`.
   - Unpublish a product from the Online Store, empty a collection, or take a product out of every collection.
   - Click **Recheck now**.
6. **Webhooks** (with the local port from `npm run dev`):
   ```sh
   shopify app webhook trigger --topic orders/create --api-version 2026-07 \
     --delivery-method http --address http://localhost:<port>/webhooks/app/catalog
   # Same webhook id twice: processed once, then ignored as a duplicate
   SHOPIFY_API_SECRET=<from `shopify app env show`> node scripts/send-test-webhook.mjs \
     --url http://localhost:<port>/webhooks/app/catalog --shop <store>.myshopify.com \
     --topic orders/updated --webhook-id dup-1 --times 2
   # Bad signature: 401
   SHOPIFY_API_SECRET=<secret> node scripts/send-test-webhook.mjs --url … --shop … --bad-signature
   ```
   - **What to watch:** `[webhooks] Duplicate …` lines in the dev terminal, and one `ProcessedWebhook` row per id in `npx prisma studio`.
   - **Confirming invalidation:** load `/app/orders`, create an order in Admin, then reload. The new order appears in the summary immediately rather than after 10 minutes.

## Limitations

- **Recent orders only.** `read_orders` covers the last 60 days. The app doesn't request `read_all_orders`.
- **Orders require protected customer data access** (Level 1). Without it, Order Operations shows a permission state.
- **Per-instance cache.** On multi-instance or serverless hosts, a webhook only invalidates the instance that received it; the others serve data up to 10 minutes old. To fix this, implement `TaggedCache` on Redis and swap it in `index.server.ts`.
- **Bounded samples:**
  - Dashboard: 250 products.
  - Inventory summary: 500 variants, 10 locations per variant.
  - Order summary: 250 orders, 20 line items each.
  - Readiness: 250 products and 250 collections.

  The pages label each of these when capped.
- **Page-level filters:** "has issues", the risk filter and "needs attention" filter the current page, because the app computes them.
- **Publishing:** readiness checks the Online Store channel, not a Headless channel, because that would need `read_publications`.
- **Collection-only changes** refresh via the TTL or **Recheck now**, not a webhook.
- **The high-value threshold** is one number in shop currency; multi-currency stores may want per-currency thresholds.

## Planned phases

1. ~~Scaffold, data layer, scoring library, Store Health, Product Health~~ ✅ done
2. ~~Admin UI extensions (product block and action)~~ ✅ done
3. ~~Idempotent webhooks, cache invalidation, Inventory Risk~~ ✅ done
4. ~~Order Operations, Storefront Readiness, order webhooks~~ ✅ done
5. **Confirmed write actions:** for example "Fix SEO title", "Publish to Online Store", "Adjust stock". Each would show a preview and need confirmation, add minimal `write_*` scopes per action, and use mutations through `assertNoUserErrors`.

## Interview talking points

- **Why Shopify stays the source of truth.** Copying catalog or order data creates a sync problem: drift, backfills, deletes, and storing customer data. Reading live through a bounded, throttle-aware data layer, plus a small invalidated cache, gives fresh data without owning any. The database holds only sessions and webhook ids.
- **Idempotent webhooks.** Shopify delivers at least once. Claiming `(shop, webhookId)` with a unique insert is the atomic dedupe. Releasing the claim on failure and returning 500 lets Shopify's retry run. Handlers only invalidate the cache, so running one twice is harmless, and they respond fast because they never call the Admin API.
- **Throttle-aware GraphQL.** `runQuery` reads `extensions.cost.throttleStatus`. It retries `THROTTLED` after `(requested − available) / restoreRate`, and backs off before the next call when the bucket is low. Every list is cursor-paginated and capped, and counts use `productsCount` and `ordersCount` instead of paging.
- **Pure, testable scoring.** Product health, inventory risk, order triage and readiness are pure functions over plain snapshots: no Shopify, no UI, deterministic. That makes them easy to unit-test at boundaries, and lets the extensions and pages share one implementation.
- **Extensible readiness.** A check is one object with a weight and an `evaluate` function, and the score is derived, never hardcoded.
- **Extension architecture.** The Admin UI extensions call a session-token-authenticated app route instead of the Admin API directly. Scoring logic and the Admin token stay on the server, CORS and re-auth come from `authenticate.admin`, and the extension bundles stay small (about 9 KB).
- **Privacy by design.** Orders are triaged from name, totals, statuses and line items only. The order queries select no customer fields, and a test enforces that.

## Screenshots

There are none yet. The list of screenshots to capture is in [`docs/screenshots/README.md`](docs/screenshots/README.md).
