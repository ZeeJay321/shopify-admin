import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import {
  CRITICAL_STOCK_THRESHOLD,
  INVENTORY_SAMPLE_CAP,
  LOW_STOCK_THRESHOLD,
} from "../lib/config";
import type { RiskLevel, VariantRisk } from "../lib/inventory-risk";
import { RISK_LABELS, RISK_TONES } from "../lib/inventory-risk";
import {
  loadInventoryPage,
  loadInventorySummary,
} from "../lib/services/inventory-risk.server";
import { toLoaderError } from "../lib/shopify/errors";
import { getLocations } from "../lib/shopify/inventory.server";
import { ErrorBanner } from "../components/health-ui";

const RISK_LEVELS: RiskLevel[] = ["critical", "low", "healthy", "untracked"];

function isRiskLevel(value: string | null): value is RiskLevel {
  return RISK_LEVELS.some((r) => r === value);
}

/**
 * Inventory Risk (read-only). Query params:
 * - risk: critical | low | healthy | untracked (applied to the current page)
 * - location: numeric location id (server-side filter; quantities then
 *   refer to that location)
 * - cursor + dir=next|prev: cursor pagination (least stock first)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;

  const rawRisk = params.get("risk");
  const risk = isRiskLevel(rawRisk) ? rawRisk : null;
  const rawLocation = params.get("location");
  const locationId =
    rawLocation && /^\d+$/.test(rawLocation) ? rawLocation : null;
  const cursor = params.get("cursor");
  const direction = params.get("dir") === "prev" ? "prev" : "next";
  const filters = { risk, locationId };

  try {
    const [summary, page, { locations }] = await Promise.all([
      loadInventorySummary(admin, session.shop, appCache),
      loadInventoryPage(admin, { cursor, direction, locationId }),
      getLocations(admin),
    ]);
    const rows = page.rows.map(toRow);
    return {
      error: null,
      summary: {
        sampleSize: summary.sampleSize,
        capped: summary.capped,
        counts: summary.counts,
        topAtRisk: summary.topAtRisk.slice(0, 5).map(toRow),
      },
      rows: risk ? rows.filter((r) => r.risk === risk) : rows,
      pageRowCount: rows.length,
      pageInfo: page.pageInfo,
      locations,
      filters,
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      summary: null,
      rows: [],
      pageRowCount: 0,
      pageInfo: null,
      locations: [],
      filters,
    };
  }
};

function toRow(r: VariantRisk) {
  return {
    key: r.variant.variantId,
    variantId: r.variant.variantId,
    productId: r.variant.productId,
    productTitle: r.variant.productTitle,
    variantTitle: r.variant.variantTitle,
    available: r.available,
    risk: r.risk,
    locations: r.byLocation.map((l) => ({
      id: l.locationId,
      name: l.locationName,
      available: l.available,
    })),
  };
}

type Row = ReturnType<typeof toRow>;

export default function InventoryRisk() {
  const { error, summary, rows, pageRowCount, pageInfo, locations, filters } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const loading = useNavigation().state === "loading";
  const locationName = locations.find((l) => l.id === filters.locationId)?.name;

  const go = (next: {
    risk?: string | null;
    locationId?: string | null;
    cursor?: string | null;
    dir?: "next" | "prev";
  }) => {
    const params = new URLSearchParams();
    const risk = next.risk !== undefined ? next.risk : filters.risk;
    const location =
      next.locationId !== undefined ? next.locationId : filters.locationId;
    if (risk) params.set("risk", risk);
    if (location) params.set("location", location);
    if (next.cursor) {
      params.set("cursor", next.cursor);
      params.set("dir", next.dir ?? "next");
    }
    setSearchParams(params);
  };

  return (
    <s-page heading="Inventory Risk">
      <s-link slot="breadcrumb-actions" href="/app">
        Store Health
      </s-link>

      {error && <ErrorBanner error={error} />}
      {error?.kind === "access_denied" && (
        <s-banner tone="info" heading="New permissions needed">
          Inventory Risk needs the read inventory and read locations
          permissions. Open the app from Shopify Admin and approve the updated
          access request to enable this page.
        </s-banner>
      )}

      {summary && (
        <s-section heading="Summary">
          <s-stack gap="base">
            <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
              {RISK_LEVELS.map((level) => (
                <s-box
                  key={level}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack gap="small-200">
                    <s-badge tone={RISK_TONES[level]}>
                      {RISK_LABELS[level]}
                    </s-badge>
                    <s-heading>{summary.counts[level]}</s-heading>
                  </s-stack>
                </s-box>
              ))}
            </s-grid>
            <s-text color="subdued">
              Based on {summary.sampleSize} variant
              {summary.sampleSize === 1 ? "" : "s"}
              {summary.capped
                ? ` (capped at ${INVENTORY_SAMPLE_CAP}, least stock first)`
                : ""}
              . Critical: {CRITICAL_STOCK_THRESHOLD} or fewer available
              (including out of stock). Low: {LOW_STOCK_THRESHOLD} or fewer.
              Totals add up all locations.
            </s-text>
          </s-stack>
        </s-section>
      )}

      <s-section padding="none">
        <s-table
          loading={loading}
          paginate
          hasNextPage={pageInfo?.hasNextPage ?? false}
          hasPreviousPage={pageInfo?.hasPreviousPage ?? false}
          onNextPage={() =>
            go({ cursor: pageInfo?.endCursor ?? null, dir: "next" })
          }
          onPreviousPage={() =>
            go({ cursor: pageInfo?.startCursor ?? null, dir: "prev" })
          }
        >
          <s-grid slot="filters" gridTemplateColumns="1fr 1fr" gap="base">
            <s-select
              label="Risk"
              value={filters.risk ?? ""}
              onChange={(event) =>
                go({ risk: event.currentTarget.value || null })
              }
            >
              <s-option value="">All risk levels</s-option>
              {RISK_LEVELS.map((level) => (
                <s-option key={level} value={level}>
                  {RISK_LABELS[level]}
                </s-option>
              ))}
            </s-select>
            <s-select
              label="Location"
              value={filters.locationId ?? ""}
              onChange={(event) =>
                go({ locationId: event.currentTarget.value || null })
              }
            >
              <s-option value="">All locations</s-option>
              {locations.map((l) => (
                <s-option key={l.id} value={l.id}>
                  {l.name}
                </s-option>
              ))}
            </s-select>
          </s-grid>

          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header listSlot="secondary">Variant</s-table-header>
            <s-table-header format="numeric">
              {locationName
                ? `Available at ${locationName}`
                : "Total available"}
            </s-table-header>
            <s-table-header>By location</s-table-header>
            <s-table-header listSlot="inline">Risk</s-table-header>
            <s-table-header>Shopify Admin</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((row) => (
              <InventoryRow key={row.key} row={row} />
            ))}
          </s-table-body>
        </s-table>

        {!error && rows.length === 0 && (
          <s-box padding="base">
            <s-paragraph>
              {pageRowCount > 0
                ? "No variants on this page match this risk level. Use Next to check the next page."
                : filters.locationId
                  ? "No variants are stocked at this location."
                  : "No variants found. Add products in Shopify Admin to see inventory risk."}
            </s-paragraph>
          </s-box>
        )}
      </s-section>

      {filters.risk && pageRowCount > 0 && (
        <s-text color="subdued">
          Showing {rows.length} of {pageRowCount} variants on this page with
          risk level {RISK_LABELS[filters.risk].toLowerCase()}.
        </s-text>
      )}
    </s-page>
  );
}

function InventoryRow({ row }: { row: Row }) {
  const breakdown =
    row.locations.length === 0
      ? "Not stocked"
      : row.locations.map((l) => `${l.name}: ${l.available}`).join(" · ");

  return (
    <s-table-row>
      <s-table-cell>
        <s-link href={`/app/products/${row.productId}`}>
          {row.productTitle}
        </s-link>
      </s-table-cell>
      <s-table-cell>{row.variantTitle}</s-table-cell>
      <s-table-cell>
        {row.risk === "untracked" ? "—" : row.available}
      </s-table-cell>
      <s-table-cell>
        <s-text color="subdued">{breakdown}</s-text>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone={RISK_TONES[row.risk]}>{RISK_LABELS[row.risk]}</s-badge>
      </s-table-cell>
      <s-table-cell>
        <s-link
          href={`shopify://admin/products/${row.productId}/variants/${row.variantId}`}
          target="_top"
        >
          Open variant
        </s-link>
      </s-table-cell>
    </s-table-row>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
