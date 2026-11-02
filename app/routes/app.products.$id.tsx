import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GROUPS, scoreProduct, summarizeGroups } from "../lib/product-health";
import { toLoaderError } from "../lib/shopify/errors";
import { toNumericId, toProductGid } from "../lib/shopify/gid";
import { getProduct } from "../lib/shopify/products.server";
import { writeAccess } from "../lib/shopify/scopes";
import { suggestSeo } from "../lib/actions";
import {
  appCache,
  productActionHandlers,
  runWriteAction,
} from "../lib/services/actions/index.server";
import {
  SEO_MODAL_ID,
  STATUS_MODAL_ID,
  SeoModal,
  StatusModal,
  nextStatus,
  statusActionLabel,
} from "../components/actions/product-actions";
import { WriteAccessBanner } from "../components/actions/shared";
import { ContentEditDialog } from "../components/actions/content-edit";

const EDIT_MODAL_ID = "content-edit-modal";
import type { CheckId, HealthCheck } from "../lib/product-health/types";
import { plural, scoreTone } from "../lib/presentation";
import {
  CheckRow,
  EmptyState,
  ErrorState,
  StatusBadge,
} from "../components/ui";
import { HorizontalBarChart, ScoreGauge } from "../components/charts";

/**
 * Product Health detail: issues with manual fix steps, plus confirmed write
 * actions (Fix SEO, Publish / Move to draft) when write_products is granted.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const canWrite = writeAccess(session.scope).products;

  try {
    const gid = toProductGid(params.id);
    const record = await getProduct(admin, gid);
    const health = scoreProduct(record.snapshot);
    return {
      error: null,
      product: {
        id: toNumericId(record.snapshot.id),
        title: record.snapshot.title || "(untitled)",
        status: record.snapshot.status,
        imageUrl: record.imageUrl,
        imageAlt: record.imageAlt,
        description: record.snapshot.description,
        rawTitle: record.snapshot.title,
      },
      seo: {
        title: record.snapshot.seoTitle ?? "",
        description: record.snapshot.seoDescription ?? "",
      },
      suggestion: suggestSeo({
        title: record.snapshot.title,
        vendor: record.vendor,
        description: record.snapshot.description,
      }),
      health,
      canWrite,
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      product: null,
      seo: null,
      suggestion: null,
      health: null,
      canWrite,
    };
  }
};

/** POST only: update_seo | set_status (see lib/services/actions). */
export const action = ({ request }: ActionFunctionArgs) =>
  runWriteAction(request, {
    authenticate: authenticate.admin,
    cache: appCache,
    handlers: productActionHandlers,
  });

export default function ProductHealthDetail() {
  const { error, product, seo, suggestion, health, canWrite } =
    useLoaderData<typeof loader>();

  if (error || !product || !health || !seo || !suggestion) {
    return (
      <s-page heading="Product health">
        <s-link slot="breadcrumb-actions" href="/app/products">
          Products
        </s-link>
        {error && <ErrorState error={error} />}
        <s-section>
          <EmptyState
            icon="product"
            heading="This product can't be shown"
            body="It may have been deleted, or the link is incorrect."
            action={{ label: "Back to products", href: "/app/products" }}
          />
        </s-section>
      </s-page>
    );
  }

  const next = nextStatus(product.status);
  const seoIssues = health.issues.some((i) => i.group === "seo");
  const adminUrl = `shopify://admin/products/${product.id}`;
  const groups = summarizeGroups(health);
  const failing = health.checks.filter((c) => c.status === "fail").length;
  const warning = health.checks.filter((c) => c.status === "warn").length;

  /** Inline action for a check, where one exists. */
  const actionFor = (check: HealthCheck) => {
    if (check.status === "pass") return undefined;
    const SEO: CheckId[] = ["seo_title", "seo_description"];
    if (SEO.includes(check.id) && canWrite) {
      return (
        <s-button commandFor={SEO_MODAL_ID} command="--show">
          Fix SEO
        </s-button>
      );
    }
    if (check.id === "status_active" && next === "ACTIVE" && canWrite) {
      return (
        <s-button commandFor={STATUS_MODAL_ID} command="--show">
          Publish
        </s-button>
      );
    }
    if ((check.id === "title" || check.id === "description") && canWrite) {
      return (
        <s-button commandFor={EDIT_MODAL_ID} command="--show">
          Edit title and description
        </s-button>
      );
    }
    if (check.id === "out_of_stock" || check.id === "low_stock") {
      return <s-link href="/app/inventory">Adjust stock in Inventory</s-link>;
    }
    if (check.id === "online_store") {
      return (
        <s-link href={adminUrl} target="_top">
          Manage sales channels in Shopify Admin
        </s-link>
      );
    }
    return undefined;
  };

  return (
    <s-page heading={product.title}>
      <s-link slot="breadcrumb-actions" href="/app/products">
        Products
      </s-link>
      {canWrite && seoIssues ? (
        <s-button
          slot="primary-action"
          variant="primary"
          commandFor={SEO_MODAL_ID}
          command="--show"
        >
          Fix SEO
        </s-button>
      ) : canWrite && next === "ACTIVE" ? (
        <s-button
          slot="primary-action"
          variant="primary"
          commandFor={STATUS_MODAL_ID}
          command="--show"
        >
          Publish
        </s-button>
      ) : null}
      <s-button slot="secondary-actions" href={adminUrl} target="_top">
        View in Shopify Admin
      </s-button>

      {!canWrite && <WriteAccessBanner action="fix SEO and change status" />}

      {GROUPS.map((group) => {
        const checks = health.checks.filter((c) => c.group === group.id);
        const summary = groups.find((g) => g.id === group.id);
        const earned = summary?.earned ?? 0;
        const percent = Math.round((earned / group.weight) * 100);
        return (
          <s-section key={group.id} heading={group.label}>
            <s-stack gap="base">
              <HorizontalBarChart
                label={`${group.label} score`}
                max={100}
                items={[
                  {
                    key: group.id,
                    label:
                      summary && summary.issueCount > 0
                        ? plural(summary.issueCount, "issue")
                        : "All checks pass",
                    value: percent,
                    tone: scoreTone(percent),
                    valueText: `${earned} / ${group.weight} points`,
                  },
                ]}
              />
              <s-divider />
              {checks.map((check) => (
                <CheckRow
                  key={check.id}
                  status={check.status}
                  label={check.label}
                  message={check.message}
                  fix={check.status === "pass" ? undefined : check.fix}
                  action={actionFor(check)}
                />
              ))}
            </s-stack>
          </s-section>
        );
      })}

      <s-section slot="aside" heading="Health score">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-thumbnail
              src={product.imageUrl ?? undefined}
              alt={product.imageAlt ?? product.title}
              size="small"
            />
            <StatusBadge status={product.status} />
          </s-stack>
          <ScoreGauge score={health.score} label="Health score" size="medium" />
          <s-stack gap="small-200" alignItems="center">
            <s-text type="strong">
              {health.issues.length === 0
                ? "All checks pass"
                : `${plural(health.issues.length, "issue")} to fix`}
            </s-text>
            {health.issues.length > 0 && (
              <s-stack direction="inline" gap="small-200">
                {failing > 0 && (
                  <s-badge tone="critical">{`${failing} failing`}</s-badge>
                )}
                {warning > 0 && (
                  <s-badge tone="warning">{`${warning} need attention`}</s-badge>
                )}
              </s-stack>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="By area">
        <HorizontalBarChart
          label="Score by area"
          max={100}
          items={groups.map((g) => {
            const percent = Math.round((g.earned / g.weight) * 100);
            return {
              key: g.id,
              label: g.label,
              value: percent,
              tone: scoreTone(percent),
              valueText: `${g.earned} / ${g.weight}`,
            };
          })}
        />
      </s-section>

      <s-section slot="aside" heading="Quick actions">
        <s-stack gap="small-200">
          <s-button
            disabled={!canWrite}
            commandFor={SEO_MODAL_ID}
            command="--show"
          >
            Fix SEO
          </s-button>
          {next && (
            <s-button
              disabled={!canWrite}
              tone={next === "DRAFT" ? "critical" : "auto"}
              commandFor={STATUS_MODAL_ID}
              command="--show"
            >
              {statusActionLabel(next)}
            </s-button>
          )}
          <s-button
            disabled={!canWrite}
            commandFor={EDIT_MODAL_ID}
            command="--show"
          >
            Edit title and description
          </s-button>
          <s-button variant="tertiary" href={adminUrl} target="_top">
            View in Shopify Admin
          </s-button>
        </s-stack>
      </s-section>

      {canWrite && (
        <SeoModal product={product} seo={seo} suggestion={suggestion} />
      )}
      {canWrite && next && (
        <StatusModal product={product} next={next} checks={health.checks} />
      )}
      {canWrite && (
        <ContentEditDialog
          modalId={EDIT_MODAL_ID}
          target={{
            id: product.id,
            title: product.rawTitle,
            description: product.description,
          }}
        />
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
