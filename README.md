# ZJ Commerce Operations

Embedded Shopify Admin app that gives merchants an **operations layer** on top of Admin: product health scoring, inventory risk, order triage, storefront readiness, and confirmed write actions. Shopify stays the source of truth — the app stores **no catalog, inventory, or order data**, only sessions and processed webhook ids.

> Separate from the headless storefront (`zj-headless-storefront`), which it can optionally notify when products change.

**Stack:** React Router 7 · React 18 · TypeScript · Prisma/SQLite · Shopify Admin GraphQL `2026-07` · Polaris web components · Admin UI extensions (Preact)

## Features

| Area | What’s included |
|------|-----------------|
| Store Health | Product counts, average score, products with issues, top issues; links into every other surface |
| Product Health | List + detail with score badge, pass/warn/fail checklist and the exact manual fix; status / “has issues” filters; cursor pagination |
| Admin extensions | “ZJ Product Health” block and “Run Product Health Check” More-actions entry on the product page |
| Inventory Risk | Critical / Low / Healthy / Not tracked; per-location breakdown; risk and location filters |
| Order Operations | Today, Unfulfilled, High value, Needs attention — no customer PII; reason/severity badges |
| Storefront Readiness | Weighted, extensible checklist (products, variants, SEO, publishing, collections); sales-channel-aware Publishing check |
| Tables | Search, sort, page size (20/50/100), row selection, row action menus on every list |
| Write actions | Fix SEO, publish/draft, activate, edit title/description, publish to channel, adjust stock — always previewed, confirmed, stale-checked |
| Bulk fixes | Apply suggested SEO (≤10), publish/activate/edit (≤25) with per-item results |
| Freshness | Idempotent webhooks invalidate tagged cache within seconds; 10-minute TTL as backup |
| Security | Session-token auth, HMAC webhooks, shop-isolated cache, narrow scopes, no deletes or price changes |

## Setup

```bash
npm install
npx prisma migrate deploy
shopify auth login
shopify app config link   # link to "ZJ Commerce Operations"
npm run dev               # tunnel, env, config push, install on the dev store
```

Prerequisites: Node ≥ 22.12, Shopify CLI, Partner account, development store.

### Environment

`shopify app dev` provides `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and `SCOPES`. Optional:

| Variable | Purpose |
|----------|---------|
| `SHOP_CUSTOM_DOMAIN` | Custom shop domain if needed |
| `STOREFRONT_REVALIDATE_URL` | Headless storefront revalidate endpoint |
| `STOREFRONT_REVALIDATE_SECRET` | HMAC secret for the storefront sync hook |

### Scopes

| Scope | Why |
|-------|-----|
| `read_products` | Catalog, collections, scoring; `products/*` webhooks |
| `read_inventory` / `read_locations` | Stock levels, location names; `inventory_levels/update` |
| `read_orders` | Recent orders (last 60 days); `orders/*` webhooks |
| `write_products` | Confirmed SEO, status, title/description fixes |
| `write_inventory` | Confirmed stock adjustments |
| `read_publications` / `write_publications` | Sales channels + “Publish to [channel]” |

Not requested: `read_all_orders`, customer scopes, other `write_*` (no order/customer/discount/price writes; no unpublish).

**Protected customer data (Level 1)** must be configured in the Partner Dashboard for Order Operations, even though no name/email/phone/address fields are read. Without it, order queries are denied; everything else keeps working.

**Existing installs must re-approve** after scope changes. Until then, Inventory Risk / Order Operations show permission banners and write actions are disabled (`403 permission_needed`).

## Routes

| Path | Notes |
|------|--------|
| `/app` | Store Health dashboard |
| `/app/products` | Product Health list (tables, inline/bulk fixes) |
| `/app/products/:id` | Product Health detail + Fix SEO / Publish |
| `/app/inventory` | Inventory Risk + Adjust stock |
| `/app/orders` | Order Operations |
| `/app/readiness` | Storefront Readiness + SEO batch / Publish to channel |
| `/api/product-health/:id` | JSON for Admin UI extensions (session/ID token + CORS) |
| `/webhooks/app/catalog` | Products, inventory, orders, publications dispatcher |
| `/webhooks/app/uninstalled` · `/webhooks/app/scopes_update` | Session housekeeping |

## Project layout

```
app/
  routes/          Embedded pages, extension API, webhooks, auth
  components/      Tables, action dialogs, charts, UI primitives
  lib/
    services/      Loaders/actions (store-health, inventory-risk, orders, readiness, writes)
    shopify/       Admin GraphQL client, pagination, products/inventory/orders/mutations
    product-health/ inventory-risk/ order-ops/ storefront-readiness/   Pure scoring (unit-tested)
    actions/       Pure planners for write previews + validation
    cache/         TaggedCache (in-memory, per shop, TTL + tags)
    webhooks/      Topic registry, claim-first idempotency
extensions/        Product Health block + action (Preact)
prisma/            Session + ProcessedWebhook only
docs/screenshots/  Screenshot checklist
```

Useful entry points:

- `app/lib/product-health/score.ts` — product scoring
- `app/lib/cache/` — tagged cache + invalidation
- `app/lib/webhooks/handlers.ts` — webhook topic → cache tags
- `app/lib/services/actions/` — confirmed write pipeline
- `app/lib/config.ts` — thresholds and caps

## Scripts

```bash
npm run dev          # Shopify CLI tunnel + hot reload
npm run build        # production build
npm run start        # serve build
npm run lint         # eslint
npm run typecheck    # app + both extensions
npm test             # vitest (no store needed)
npm run graphql-codegen   # validate Admin queries, regenerate types
shopify app deploy   # deploy app + extensions
```

## Deploy

```bash
shopify app deploy
```

Host anywhere Node runs (or Shopify’s app hosting). Set the same env vars; production callback/auth URLs come from `shopify.app.toml` / CLI. After deploy, open the app in Admin and approve any new scopes.

### Storefront sync hook (optional)

When `STOREFRONT_REVALIDATE_URL` and `STOREFRONT_REVALIDATE_SECRET` are set, product webhooks `POST`:

```json
{ "topic": "products/update", "productId": "123", "handle": "classic-tee", "sentAt": "2026-10-30T12:00:00.000Z" }
```

Header: `X-ZJ-Signature: sha256=<hex HMAC-SHA256 of raw body>`. `handle` is `null` on delete. Fire-and-forget (3s timeout); failures never affect the webhook response.

## Instant catalog updates (webhooks)

Declared in `shopify.app.toml` (API `2026-07`). Catalog/order/publication topics hit one dispatcher with claim-first idempotency:

| Topics | Cache tags invalidated |
|--------|------------------------|
| `products/create|update|delete` | `products`, `inventory`, `readiness`, `product:{id}` (+ storefront ping) |
| `inventory_levels/update` | `inventory`, `readiness`, `inventory-item:{id}` |
| `orders/create`, `orders/updated` | `orders` (payload never read) |
| `product_publications/*` | `readiness`, `publications`, `product:{id}` |

Flow: HMAC via `authenticate.webhook` → atomic insert `(shop, webhookId)` → handler (cache only, no Admin API) → on failure delete claim and `500` so Shopify retries. Duplicates return `200` and no-op. Collection-only changes use the 10-minute TTL or **Recheck now**.

## Security notes

- Admin token never reaches the browser; embedded app and extensions use short-lived session/ID tokens.
- No customer PII in queries, logs, or storage; order webhook bodies are not read.
- Cache entries, tags, and webhook rows are scoped by verified shop domain.
- Writes: POST only → session shop → scope check → `confirm=yes` → server re-validation → stale check (compare-and-set for stock) → mutation → typed `userErrors` → invalidate cache only on success.
- No deletes, no price changes. Extra acknowledgement required to publish products failing critical checks, set stock to 0, or change stock by >100.
- Webhooks verified with HMAC; storefront hook secret never logged.

## Known gaps

- Recent orders only (`read_orders`, last 60 days); no `read_all_orders`
- Orders need Partner Dashboard protected customer data access (Level 1)
- In-memory cache is per instance — multi-instance hosts can serve up to 10 minutes stale until Redis/`TaggedCache` is swapped in
- Bounded samples: 250 products (dashboard/readiness), 500 variants (inventory), 250 orders
- Page-level filters (“has issues”, risk, “needs attention”) apply to the current page
- Cursor tables are Previous/Next only; table search is Shopify word-prefix
- Collection-only changes refresh via TTL / Recheck now, not a webhook
- SEO/status staleness is check-then-act (`productUpdate` has no compare-and-set)
- High-value threshold is one number in shop currency
- No screenshots yet — see [`docs/screenshots/README.md`](docs/screenshots/README.md)

## Testing on a development store

1. Import [`docs/seed/problem-products.csv`](docs/seed/problem-products.csv); add 3 images to “ZJ Health Perfect Tee”.
2. Walk Store Health → Product Health → product-page block/action.
3. Set tracked stock to 0 / 2 / 4; open Inventory Risk.
4. Configure protected customer data + `read_orders`; create test orders (Bogus Gateway or Mark as paid). Use `UNFULFILLED_ALERT_HOURS = 0` in `config.ts` to skip the 24h wait.
5. Unpublish / empty a collection → Readiness → **Recheck now**.
6. After approving write scopes: Fix SEO, Publish (with acknowledgement on the bad draft), Adjust stock, stale-conflict (change stock in Admin while dialog is open), SEO batch from Readiness.
7. Webhooks: `shopify app webhook trigger` or `node scripts/send-test-webhook.mjs` (duplicate id once, bad signature → 401).
