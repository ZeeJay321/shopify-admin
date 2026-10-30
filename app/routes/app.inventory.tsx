import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
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
import {
  loadInventoryPage,
  loadInventorySummary,
} from "../lib/services/inventory-risk.server";
import { toLoaderError } from "../lib/shopify/errors";
import { getLocations } from "../lib/shopify/inventory.server";
import {
  RISK_LABELS,
  RISK_TONES,
  formatNumber,
  plural,
} from "../lib/presentation";
import {
  CardGrid,
  DataCapNotice,
  EmptyState,
  ErrorState,
  MetricCard,
  PermissionBanner,
  ProportionBars,
  RiskBadge,
  TableSkeleton,
  Toolbar,
} from "../components/ui";
import { writeAccess } from "../lib/shopify/scopes";
import {
  inventoryActionHandlers,
  runWriteAction,
} from "../lib/services/actions/index.server";
import type { AdjustTarget } from "../components/actions/inventory-adjust";
import {
  ADJUST_MODAL,
  InventoryAdjustModal,
} from "../components/actions/inventory-adjust";
import { WriteAccessBanner } from "../components/actions/shared";

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
  const canWrite = writeAccess(session.scope).inventory;

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
      canWrite,
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
      canWrite,
    };
  }
};

/** POST only: adjust_inventory (compare-and-set via Shopify). */
export const action = ({ request }: ActionFunctionArgs) =>
  runWriteAction(request, {
    authenticate: authenticate.admin,
    cache: appCache,
    handlers: inventoryActionHandlers,
  });

function toRow(r: VariantRisk) {
  return {
    key: r.variant.variantId,
    variantId: r.variant.variantId,
    inventoryItemId: r.variant.inventoryItemId,
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
  const {
    error,
    summary,
    rows,
    pageRowCount,
    pageInfo,
    locations,
    filters,
    canWrite,
  } = useLoaderData<typeof loader>();
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null);
  const [, setSearchParams] = useSearchParams();
  const loading = useNavigation().state === "loading";
  const locationName = locations.find((l) => l.id === filters.locationId)?.name;
  const permissionMissing = error?.kind === "access_denied";

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
    <s-page heading="Inventory risk">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button
        slot="secondary-actions"
        href="shopify://admin/products/inventory"
        target="_top"
      >
        Open Shopify inventory
      </s-button>

      {permissionMissing ? (
        <PermissionBanner
          kind="read"
          feature="inventory risk"
          scopes={["read inventory", "read locations"]}
        />
      ) : (
        error && <ErrorState error={error} />
      )}
      {!error && !canWrite && (
        <WriteAccessBanner action="adjust stock" scope="write_inventory" />
      )}

      {summary && (
        <s-section accessibilityLabel="Inventory summary">
          <s-stack gap="base">
            <CardGrid>
              {RISK_LEVELS.map((level) => (
                <MetricCard
                  key={level}
                  label={RISK_LABELS[level]}
                  value={formatNumber(summary.counts[level])}
                  tone={RISK_TONES[level]}
                  toneLabel={
                    level === "untracked" ? "Excluded" : RISK_LABELS[level]
                  }
                  href={`/app/inventory?risk=${level}`}
                  linkLabel="Show these"
                />
              ))}
            </CardGrid>
            <ProportionBars
              total={summary.sampleSize}
              segments={(["critical", "low", "healthy"] as const).map(
                (risk) => ({
                  key: risk,
                  label: RISK_LABELS[risk],
                  value: summary.counts[risk],
                  tone: RISK_TONES[risk],
                }),
              )}
            />
            <DataCapNotice>
              Based on {plural(summary.sampleSize, "variant")}
              {summary.capped
                ? ` (capped at ${formatNumber(INVENTORY_SAMPLE_CAP)}, least stock first)`
                : ""}
              . Critical is {CRITICAL_STOCK_THRESHOLD} or fewer available, low
              is {LOW_STOCK_THRESHOLD} or fewer; totals add up all locations.
            </DataCapNotice>
          </s-stack>
        </s-section>
      )}

      {!permissionMissing && (
        <s-section padding="none" accessibilityLabel="Variants">
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
            <s-stack slot="filters" gap="small-200">
              <Toolbar>
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
              </Toolbar>
              <DataCapNotice>
                {filters.risk && pageRowCount > 0
                  ? `${plural(rows.length, "variant")} with this risk on this page (of ${pageRowCount}). `
                  : ""}
                Least stock first.
              </DataCapNotice>
            </s-stack>

            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header format="numeric">
                {locationName ? `Available at ${locationName}` : "Available"}
              </s-table-header>
              <s-table-header listSlot="inline">Risk</s-table-header>
              <s-table-header>By location</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((row) => (
                <InventoryRow
                  key={row.key}
                  row={row}
                  canWrite={canWrite}
                  onAdjust={() =>
                    setAdjustTarget({
                      productId: row.productId,
                      productTitle: row.productTitle,
                      variantTitle: row.variantTitle,
                      inventoryItemId: row.inventoryItemId,
                      locations: row.locations,
                      defaultLocationId: filters.locationId,
                    })
                  }
                />
              ))}
            </s-table-body>
          </s-table>

          {!error && rows.length === 0 && (
            <s-box padding="base">
              {loading ? (
                <TableSkeleton />
              ) : pageRowCount > 0 ? (
                <EmptyState
                  icon="check-circle"
                  heading="Nothing at this risk level on this page"
                  body="Use Next to check more variants, or choose another risk level."
                />
              ) : filters.locationId ? (
                <EmptyState
                  icon="inventory"
                  heading="No variants at this location"
                  body="Nothing is stocked here. Choose another location."
                  action={{ label: "All locations", href: "/app/inventory" }}
                />
              ) : (
                <EmptyState
                  icon="inventory"
                  heading="No variants yet"
                  body="Add products with tracked inventory in Shopify Admin to see stock risk here."
                />
              )}
            </s-box>
          )}
        </s-section>
      )}

      {canWrite && <InventoryAdjustModal target={adjustTarget} />}
    </s-page>
  );
}

function InventoryRow({
  row,
  canWrite,
  onAdjust,
}: {
  row: Row;
  canWrite: boolean;
  onAdjust: () => void;
}) {
  const adjustable = row.risk !== "untracked" && row.locations.length > 0;
  const variantLabel =
    row.variantTitle === "Default Title" ? null : row.variantTitle;

  return (
    <s-table-row>
      <s-table-cell>
        <s-stack gap="small-300">
          <s-link href={`/app/products/${row.productId}`}>
            {row.productTitle}
          </s-link>
          {variantLabel && <s-text color="subdued">{variantLabel}</s-text>}
        </s-stack>
      </s-table-cell>
      <s-table-cell>
        <s-text type="strong">
          {row.risk === "untracked" ? "—" : formatNumber(row.available)}
        </s-text>
      </s-table-cell>
      <s-table-cell>
        <RiskBadge risk={row.risk} />
      </s-table-cell>
      <s-table-cell>
        <LocationBreakdown locations={row.locations} />
      </s-table-cell>
      <s-table-cell>
        <s-button-group>
          <s-button
            variant="secondary"
            disabled={!canWrite || !adjustable}
            commandFor={ADJUST_MODAL}
            command="--show"
            onClick={onAdjust}
            accessibilityLabel={`Adjust stock for ${row.productTitle}`}
          >
            Adjust
          </s-button>
          <s-button
            variant="tertiary"
            href={`shopify://admin/products/${row.productId}/variants/${row.variantId}`}
            target="_top"
            accessibilityLabel={`Open ${row.productTitle} in Shopify Admin`}
          >
            Admin
          </s-button>
        </s-button-group>
      </s-table-cell>
    </s-table-row>
  );
}

/** One location inline; several collapse into an expandable list. */
function LocationBreakdown({ locations }: { locations: Row["locations"] }) {
  if (locations.length === 0)
    return <s-text color="subdued">Not stocked</s-text>;
  if (locations.length === 1) {
    const [only] = locations;
    return (
      <s-text color="subdued">{`${only.name}: ${formatNumber(only.available)}`}</s-text>
    );
  }
  return (
    <details>
      <summary>
        <s-text color="subdued">{`${locations.length} locations`}</s-text>
      </summary>
      <s-stack gap="small-300">
        {locations.map((l) => (
          <s-text
            key={l.id}
            color="subdued"
          >{`${l.name}: ${formatNumber(l.available)}`}</s-text>
        ))}
      </s-stack>
    </details>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
