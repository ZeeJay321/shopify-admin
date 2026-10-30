/**
 * App-wide tuning constants. Kept in one place so phase 2+ can move them to
 * per-shop settings without hunting through modules.
 */

/** Rows per page on the Product Health list. */
export const PRODUCTS_PAGE_SIZE = 25;

/** Max products scored for the Store Health dashboard (bounded sample). */
export const HEALTH_SAMPLE_CAP = 250;

/** Variants fetched per product on list/sample queries (keeps query cost low). */
export const LIST_VARIANTS_LIMIT = 20;

/** Variants fetched on the product detail page. */
export const DETAIL_VARIANTS_LIMIT = 100;

/** A tracked variant with 1..LOW_STOCK_THRESHOLD units is "low stock". */
export const LOW_STOCK_THRESHOLD = 5;

/** How many times a throttled Admin API query is retried before giving up. */
export const MAX_THROTTLE_RETRIES = 3;

/** Upper bound on a single throttle back-off wait. */
export const MAX_THROTTLE_WAIT_MS = 5_000;

// --- Inventory risk (phase 3) ------------------------------------------------
// Shares LOW_STOCK_THRESHOLD with the phase 1 "Low stock" check so both
// features agree on what "low" means.

/** A tracked variant with total available <= this is CRITICAL (includes 0). */
export const CRITICAL_STOCK_THRESHOLD = 2;

/** Variants per page on the Inventory Risk table. */
export const INVENTORY_PAGE_SIZE = 50;

/** Max variants scanned for the Inventory Risk summary cards. */
export const INVENTORY_SAMPLE_CAP = 500;

/** Inventory levels (locations) fetched per variant. */
export const INVENTORY_LEVELS_LIMIT = 10;

/** Max locations listed in the location filter. */
export const LOCATIONS_CAP = 100;

/** How many at-risk variants the summary highlights. */
export const TOP_AT_RISK_LIMIT = 10;

// --- Cache and webhooks (phase 3) --------------------------------------------

/** Safety-net TTL; webhooks invalidate entries sooner. */
export const CACHE_TTL_MS = 10 * 60 * 1000;

/** Upper bound on in-memory cache entries (oldest evicted first). */
export const CACHE_MAX_ENTRIES = 1_000;

/** Processed webhook ids older than this are deleted. */
export const PROCESSED_WEBHOOK_RETENTION_DAYS = 30;

/** Run the processed-webhook cleanup at most this often per server instance. */
export const WEBHOOK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// --- Order operations (phase 4) ----------------------------------------------

/** Unfulfilled orders older than this need attention. */
export const UNFULFILLED_ALERT_HOURS = 24;

/**
 * Orders with a current total >= this (in the shop's currency) are
 * "high value". Default 500; adjust per store.
 */
export const HIGH_VALUE_ORDER_THRESHOLD = 500;

/** "Recent" filter window on the Order Operations page. */
export const RECENT_ORDER_DAYS = 7;

/** Orders per page on the Order Operations table. */
export const ORDERS_PAGE_SIZE = 25;

/** Max recent orders scanned for the summary cards. */
export const ORDERS_SAMPLE_CAP = 250;

/** Line items fetched per order (for the low-stock cross-check). */
export const ORDER_LINE_ITEMS_LIMIT = 20;

// --- Storefront readiness (phase 4) ------------------------------------------

/** Max collections scanned for readiness. */
export const COLLECTIONS_CAP = 250;

/** Affected resources listed per readiness check. */
export const READINESS_AFFECTED_LIMIT = 20;

/** Check score at or above this is "warn" rather than "fail" (1 = pass). */
export const READINESS_WARN_AT = 0.75;
