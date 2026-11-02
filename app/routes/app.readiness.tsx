import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import { loadReadinessView } from "../lib/services/readiness.server";
import {
  readinessActionHandlers,
  runWriteAction,
} from "../lib/services/actions/index.server";
import type { WriteActionResult } from "../lib/actions";
import { readinessFix } from "../lib/actions";
import { BULK_ACTION_MAX, SEO_BATCH_MAX } from "../lib/config";
import { hasScope } from "../lib/shopify/scopes";
import { toLoaderError } from "../lib/shopify/errors";
import type { CheckResult } from "../lib/storefront-readiness";
import { READINESS_GROUPS } from "../lib/storefront-readiness";
import type { AffectedRow } from "../lib/storefront-readiness/affected";
import {
  AFFECTED_SORT_FIELDS,
  affectedPage,
  affectedRows,
} from "../lib/storefront-readiness/affected";
import type { Selection } from "../lib/tables";
import {
  formatSort,
  nextSort,
  pageRange,
  parseTableParams,
  pruneSelection,
} from "../lib/tables";
import {
  checkSeverityTone,
  enumLabel,
  formatNumber,
  formatPercent,
  plural,
  readinessVerdict,
  scoreTone,
} from "../lib/presentation";
import {
  Card,
  CheckRow,
  DataCapNotice,
  EmptyState,
  ErrorState,
  LiveRegion,
  PermissionBanner,
  SplitGrid,
  StatusBadge,
} from "../components/ui";
import {
  HorizontalBarChart,
  InlineScoreBar,
  ScoreGauge,
  toneColor,
} from "../components/charts";
import type { RowAction } from "../components/tables";
import {
  DataTable,
  RowActions,
  TableSearch,
  useTableUrl,
} from "../components/tables";
import { WriteAccessBanner } from "../components/actions/shared";
import type { BulkTarget } from "../components/actions/bulk-dialog";
import { BulkFixDialog } from "../components/actions/bulk-dialog";
import type { ContentTarget } from "../components/actions/content-edit";
import { ContentEditDialog } from "../components/actions/content-edit";
import { SeoBatchDialog } from "../components/actions/seo-batch";
import { useModalTarget } from "../components/actions/modal-target";

/**
 * Storefront Readiness: weighted checks over products and collections.
 * Query params:
 * - channel: publication id for the Publishing check (default: see
 *   chooseChannel)
 * - check: which check's affected table is open
 * - page, size, sort, q: that table's paging, sort and title search
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const access = {
    products: hasScope(session.scope, "write_products"),
    publications: hasScope(session.scope, "write_publications"),
  };
  const table = parseTableParams(params, {
    sortFields: AFFECTED_SORT_FIELDS,
    defaultSort: { field: "title", dir: "asc" },
  });

  try {
    const view = await loadReadinessView(
      admin,
      session.shop,
      appCache,
      params.get("channel"),
    );
    const { productIndex, ...report } = view.report;
    const open = report.checks.find(
      (c) => c.id === params.get("check") && c.affectedCount > 0,
    );
    const affected = open
      ? affectedPage(affectedRows(open, productIndex), table)
      : null;

    return {
      error: null,
      // Only counts go to the client; affected rows come one page at a time.
      report: {
        ...report,
        checks: report.checks.map((c) => ({ ...c, affectedResources: [] })),
      },
      channels: view.channels,
      channel: view.choice?.channel ?? null,
      headlessHint: view.choice?.headlessHint ?? false,
      table:
        open && affected ? { checkId: open.id, ...table, ...affected } : null,
      access,
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      report: null,
      channels: null,
      channel: null,
      headlessHint: false,
      table: null,
      access,
    };
  }
};

/**
 * POST only. recheck: clears this app's cached report (no Shopify write).
 * Fixes (confirmed, scoped): preview_seo_batch / apply_seo_batch /
 * update_seo, update_content, publish_products, activate_products.
 */
export const action = ({ request }: ActionFunctionArgs) =>
  runWriteAction(request, {
    authenticate: authenticate.admin,
    cache: appCache,
    handlers: readinessActionHandlers,
  });

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type Channel = NonNullable<LoaderData["channel"]>;

const MODALS = {
  seo: "readiness-seo-modal",
  bulk: "readiness-bulk-modal",
  edit: "readiness-edit-modal",
} as const;

export default function StorefrontReadiness() {
  const data = useLoaderData<typeof loader>();
  const { error, report, channel, channels, headlessHint, access } = data;
  const fetcher = useFetcher<WriteActionResult>();
  const navigation = useNavigation();
  const busy = fetcher.state !== "idle" || navigation.state === "loading";
  const url = useTableUrl();

  const seo = useModalTarget<string[]>(MODALS.seo);
  const bulk = useModalTarget<BulkTarget>(MODALS.bulk);
  const edit = useModalTarget<ContentTarget>(MODALS.edit);

  const openChecks = report
    ? report.checks.filter((c) => c.status === "warn" || c.status === "fail")
        .length
    : 0;
  const verdict = report ? readinessVerdict(report.score, openChecks) : null;
  const onlineStore = channels?.find((c) => c.isOnlineStore) ?? null;

  return (
    <s-page heading="Storefront readiness">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button
        slot="secondary-actions"
        loading={busy}
        onClick={() =>
          fetcher.submit({ intent: "recheck" }, { method: "post" })
        }
      >
        Recheck now
      </s-button>

      <s-stack gap="base">
        {error && <ErrorState error={error} />}
        {fetcher.data?.ok && fetcher.state === "idle" && (
          <LiveRegion>
            <s-text accessibilityVisibility="exclusive">
              {fetcher.data.message}
            </s-text>
          </LiveRegion>
        )}
        {report && !access.products && (
          <WriteAccessBanner action="fix products from this page" />
        )}

        {report && verdict && report.score === null && (
          <s-section>
            <EmptyState
              icon="product"
              heading="Nothing to check yet"
              body="Add and activate products to see how ready your storefront is."
              action={{
                label: "Add product",
                href: "shopify://admin/products/new",
              }}
            />
          </s-section>
        )}

        {report && verdict && report.score !== null && (
          <s-stack gap="base">
            <SplitGrid ratio="1:2">
              <Card heading="Readiness score">
                <s-stack gap="small-200" alignItems="center">
                  <ScoreGauge
                    score={report.score}
                    label="Storefront readiness"
                  />
                  <s-text type="strong">{verdict.text}</s-text>
                </s-stack>
              </Card>
              <Card
                heading="Where to focus"
                subheading="Items affected by each open check"
              >
                <HorizontalBarChart
                  label="Affected items per open check"
                  emptyMessage="Every check passes. Your storefront is ready."
                  items={report.checks
                    .filter((c) => c.status === "warn" || c.status === "fail")
                    .sort((a, b) => b.affectedCount - a.affectedCount)
                    .map((c) => ({
                      key: c.id,
                      label: c.name,
                      value: c.affectedCount,
                      valueText: plural(c.affectedCount, "item"),
                      tone: checkSeverityTone(c.severity, c.status),
                    }))}
                />
              </Card>
            </SplitGrid>
            <DataCapNotice>
              Based on {plural(report.productCount, "product")} (
              {formatNumber(report.liveProductCount)} active)
              {report.productsCapped ? ", capped" : ""}
              {report.collectionCount === null
                ? "; collections couldn't be loaded"
                : ` and ${plural(report.collectionCount, "collection")}${report.collectionsCapped ? " (capped)" : ""}`}
              . Changes refresh automatically from Shopify webhooks, or use
              Recheck now.
            </DataCapNotice>
          </s-stack>
        )}

        {report &&
          report.score !== null &&
          READINESS_GROUPS.map((group) => {
            const checks = report.checks.filter((c) => c.group === group.id);
            if (checks.length === 0) return null;
            const open = checks.filter(
              (c) => c.status === "warn" || c.status === "fail",
            ).length;
            return (
              <s-section key={group.id} heading={group.label}>
                <s-stack gap="base">
                  {group.id === "publishing" && (
                    <ChannelPicker
                      channels={channels}
                      channel={channel}
                      headlessHint={headlessHint}
                      onlineStore={onlineStore}
                      onSelect={(id) =>
                        url.set({
                          channel: id,
                          check: null,
                          sort: null,
                          q: null,
                        })
                      }
                    />
                  )}
                  <s-text color="subdued">
                    {open === 0
                      ? `All ${checks.length} checks pass`
                      : `${open} of ${checks.length} checks need work`}
                  </s-text>
                  {checks.map((check) => (
                    <ReadinessCheck
                      key={check.id}
                      check={check}
                      table={
                        data.table?.checkId === check.id ? data.table : null
                      }
                      channel={channel}
                      access={access}
                      onOpen={() =>
                        url.set({ check: check.id, sort: null, q: null })
                      }
                      onClose={() =>
                        url.set({ check: null, sort: null, q: null })
                      }
                      onSeo={seo.open}
                      onBulk={bulk.open}
                      onEdit={edit.open}
                    />
                  ))}
                </s-stack>
              </s-section>
            );
          })}
      </s-stack>

      {access.products && (
        <SeoBatchDialog modalId={MODALS.seo} productIds={seo.target ?? []} />
      )}
      <BulkFixDialog modalId={MODALS.bulk} target={bulk.target} />
      {access.products && (
        <ContentEditDialog modalId={MODALS.edit} target={edit.target} />
      )}
    </s-page>
  );
}

/** "Sales channel to check" select plus headless / permission banners. */
function ChannelPicker({
  channels,
  channel,
  headlessHint,
  onlineStore,
  onSelect,
}: {
  channels: LoaderData["channels"];
  channel: Channel | null;
  headlessHint: boolean;
  onlineStore: Channel | null;
  onSelect: (id: string) => void;
}) {
  if (channels === null) {
    return (
      <PermissionBanner
        kind="read"
        feature="sales channels"
        scopes={["read publications"]}
      />
    );
  }
  return (
    <s-stack gap="small-200">
      {channels.length > 0 && (
        <s-box maxInlineSize="420px">
          <s-select
            label="Sales channel to check"
            value={channel?.id ?? ""}
            onChange={(event) => onSelect(event.currentTarget.value)}
          >
            {channels.map((c) => (
              <s-option key={c.id} value={c.id}>
                {`${c.name} (${formatNumber(c.productCount)}${c.atLeast ? "+" : ""} products)`}
              </s-option>
            ))}
          </s-select>
        </s-box>
      )}
      {headlessHint && channel && (
        <s-banner tone="info">
          <s-stack gap="small-200">
            <s-text>
              {`This store doesn't seem to use the Online Store channel (common for headless storefronts). Showing results for ${channel.name}.`}
            </s-text>
            {onlineStore && (
              <s-stack direction="inline">
                <s-button
                  variant="tertiary"
                  onClick={() => onSelect(onlineStore.id)}
                >
                  Check Online Store instead
                </s-button>
              </s-stack>
            )}
          </s-stack>
        </s-banner>
      )}
    </s-stack>
  );
}

type TableData = NonNullable<LoaderData["table"]>;

function ReadinessCheck({
  check,
  table,
  channel,
  access,
  onOpen,
  onClose,
  onSeo,
  onBulk,
  onEdit,
}: {
  check: CheckResult;
  table: TableData | null;
  channel: Channel | null;
  access: LoaderData["access"];
  onOpen: () => void;
  onClose: () => void;
  onSeo: (ids: string[]) => void;
  onBulk: (target: BulkTarget) => void;
  onEdit: (target: ContentTarget) => void;
}) {
  const percent = check.score === null ? null : Math.round(check.score * 100);
  return (
    <CheckRow
      status={check.status}
      label={check.name}
      message={check.description}
      meta={
        <>
          <s-badge tone={checkSeverityTone(check.severity, check.status)}>
            {enumLabel(check.severity)}
          </s-badge>
          {check.affectedCount > 0 && (
            <s-text color="subdued">{`${formatNumber(check.affectedCount)} affected`}</s-text>
          )}
        </>
      }
    >
      {percent !== null && (
        <div className="zj-inline-score">
          <div className="zj-track zj-track--thin" aria-hidden="true">
            <div
              className="zj-fill"
              style={{
                inlineSize: `${percent}%`,
                background: toneColor(scoreTone(percent)),
              }}
            />
          </div>
          <s-text color="subdued">{`${formatPercent(check.score ?? 0)} passing`}</s-text>
        </div>
      )}
      {check.affectedCount > 0 && !table && (
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="chevron-down" onClick={onOpen}>
            {`Show ${plural(check.affectedCount, "affected item")}`}
          </s-button>
        </s-stack>
      )}
      {table && (
        <s-stack gap="small-200">
          <s-stack direction="inline">
            <s-button variant="tertiary" icon="chevron-up" onClick={onClose}>
              Hide affected items
            </s-button>
          </s-stack>
          <AffectedTable
            check={check}
            table={table}
            channel={channel}
            access={access}
            onSeo={onSeo}
            onBulk={onBulk}
            onEdit={onEdit}
          />
        </s-stack>
      )}
    </CheckRow>
  );
}

function AffectedTable({
  check,
  table,
  channel,
  access,
  onSeo,
  onBulk,
  onEdit,
}: {
  check: CheckResult;
  table: TableData;
  channel: Channel | null;
  access: LoaderData["access"];
  onSeo: (ids: string[]) => void;
  onBulk: (target: BulkTarget) => void;
  onEdit: (target: ContentTarget) => void;
}) {
  const url = useTableUrl();
  const loading = useNavigation().state === "loading";
  const fix = readinessFix(check.id);
  const [selected, setSelected] = useState<Selection>(new Set());
  const rows = table.rows;
  const visible = pruneSelection(
    selected,
    rows.map((r) => r.id),
  );
  const products = rows.filter((r) => r.kind === "product");

  const canPublish =
    fix.kind === "publish" && channel !== null && access.publications;
  const canBulk = (fix.kind === "seo" && access.products) || canPublish;
  const cap = fix.kind === "seo" ? SEO_BATCH_MAX : BULK_ACTION_MAX;
  const items = (ids: Iterable<string>) => {
    const wanted = new Set(ids);
    return products
      .filter((r) => wanted.has(r.id))
      .map((r) => ({ productId: r.id, productTitle: r.title }));
  };
  const publish = (ids: Iterable<string>) =>
    channel &&
    onBulk({
      kind: "publish",
      items: items(ids),
      channel: { id: channel.id, name: channel.name },
    });

  const actionsFor = (row: AffectedRow): RowAction[] => {
    if (row.kind === "collection") {
      return [
        {
          label: "Open in Shopify Admin",
          href: `shopify://admin/collections/${row.id}`,
          external: true,
        },
      ];
    }
    const admin: RowAction = {
      label: "Open in Shopify Admin",
      href: `shopify://admin/products/${row.id}`,
      external: true,
    };
    const details: RowAction = {
      label: "View health report",
      href: `/app/products/${row.id}`,
    };
    switch (fix.kind) {
      case "seo":
        return [
          {
            label: "Apply suggested SEO",
            onClick: () => onSeo([row.id]),
            disabled: !access.products,
          },
          details,
          admin,
        ];
      case "publish":
        return [
          {
            label: `Publish to ${channel?.name ?? "channel"}`,
            onClick: () => publish([row.id]),
            disabled: !canPublish,
          },
          details,
          admin,
        ];
      case "edit":
        return [
          {
            label: "Edit",
            onClick: () =>
              onEdit({
                id: row.id,
                title: row.rawTitle,
                description: row.description,
              }),
            disabled: !access.products,
          },
          details,
          admin,
        ];
      case "adjust_stock":
        return [
          {
            label: "Adjust stock",
            href: `/app/inventory?q=${encodeURIComponent(row.title)}`,
          },
          details,
          admin,
        ];
      default:
        return [admin, details];
    }
  };

  const range = pageRange({
    page: table.page,
    size: table.size,
    rowCount: rows.length,
    total: table.total,
  });

  return (
    <s-stack gap="small-200">
      {fix.kind === "admin_only" && fix.reason && (
        <s-text color="subdued">{`No direct fix here: ${fix.reason}`}</s-text>
      )}
      {fix.kind === "publish" && channel && !access.publications && (
        <WriteAccessBanner action={`publish products to ${channel.name}`} />
      )}
      <DataTable<AffectedRow>
        label={`Items affected by ${check.name}`}
        rows={rows}
        rowId={(r) => r.id}
        rowLabel={(r) => r.title}
        loading={loading}
        sort={table.sort}
        onSort={(field) => {
          const sortField = AFFECTED_SORT_FIELDS.find((f) => f === field);
          if (sortField)
            url.set({ sort: formatSort(nextSort(table.sort, sortField)) });
        }}
        toolbar={
          <TableSearch
            label="Search affected items"
            placeholder="Search by title"
            value={table.q}
            onSearch={(q) => url.set({ q })}
          />
        }
        pagination={{
          hasNext: table.page * table.size < table.total,
          hasPrevious: table.page > 1,
          onNext: () => url.set({ page: String(table.page + 1) }),
          onPrevious: () => url.set({ page: String(table.page - 1) }),
          rangeText: range.text,
          pageSize: table.size,
          onPageSize: (size) => url.set({ size: String(size) }),
        }}
        selection={
          canBulk
            ? {
                selected: visible,
                onChange: setSelected,
                cap,
                bulkActions:
                  fix.kind === "seo" ? (
                    <s-button onClick={() => onSeo([...visible])}>
                      Apply suggested SEO
                    </s-button>
                  ) : (
                    <s-button
                      variant="primary"
                      onClick={() => publish(visible)}
                    >
                      {`Publish to ${channel?.name ?? "channel"}`}
                    </s-button>
                  ),
              }
            : undefined
        }
        columns={[
          {
            key: "title",
            header: rows.some((r) => r.kind === "collection")
              ? "Item"
              : "Product",
            sortField: "title",
            listSlot: "primary",
            render: (r) => (
              <s-stack direction="inline" gap="small" alignItems="center">
                {r.kind === "product" && (
                  <s-thumbnail
                    src={r.imageUrl ?? undefined}
                    alt={r.title}
                    size="small-200"
                  />
                )}
                {r.kind === "product" ? (
                  <s-link href={`/app/products/${r.id}`}>{r.title}</s-link>
                ) : (
                  <s-text>{r.title}</s-text>
                )}
              </s-stack>
            ),
          },
          {
            key: "status",
            header: "Status",
            sortField: "status",
            listSlot: "inline",
            render: (r) =>
              r.status ? (
                <StatusBadge status={r.status} />
              ) : (
                <s-text color="subdued">—</s-text>
              ),
          },
          {
            key: "vendor",
            header: "Vendor",
            sortField: "vendor",
            render: (r) => <s-text color="subdued">{r.vendor ?? "—"}</s-text>,
          },
          {
            key: "score",
            header: "Health",
            sortField: "score",
            render: (r) =>
              r.score === null ? (
                <s-text color="subdued">—</s-text>
              ) : (
                <InlineScoreBar score={r.score} />
              ),
          },
          {
            key: "problem",
            header: "Problem",
            listSlot: "secondary",
            render: (r) => <s-text>{r.problem}</s-text>,
          },
        ]}
        rowActions={(r) => (
          <RowActions
            id={`${check.id}-${r.id}`}
            label={r.title}
            actions={actionsFor(r)}
          />
        )}
        empty={
          <s-text color="subdued">
            {table.q
              ? "No affected items match this search."
              : "Nothing affected."}
          </s-text>
        }
      />
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
