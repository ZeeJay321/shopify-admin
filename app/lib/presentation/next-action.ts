/**
 * Picks the single most useful "next best action" for the home page from
 * already-computed issue counts. Pure presentation helper: it ranks, it
 * doesn't score.
 */

import type { CheckId } from "../product-health/types";

export type NextAction = {
  heading: string;
  body: string;
  href: string;
  cta: string;
};

type IssueCountLike = { checkId: CheckId; count: number };

/** Higher = more urgent for a merchant to fix first. */
const PRIORITY: Partial<Record<CheckId, number>> = {
  variant_prices: 100,
  status_active: 60,
  images: 90,
  title: 85,
  description: 70,
  seo_description: 65,
  seo_title: 64,
  out_of_stock: 80,
  low_stock: 50,
  online_store: 40,
  variant_options: 30,
};

const COPY: Partial<
  Record<CheckId, (n: string) => Omit<NextAction, "heading">>
> = {
  variant_prices: (n) => ({
    body: `${n} have a variant with no price or a price of 0. Shoppers can't buy them.`,
    href: "/app/products?issues=1",
    cta: "Review products",
  }),
  images: (n) => ({
    body: `${n} have too few images. Products with 3+ images convert better.`,
    href: "/app/readiness",
    cta: "See affected products",
  }),
  title: (n) => ({
    body: `${n} have a missing or placeholder title.`,
    href: "/app/products?issues=1",
    cta: "Review products",
  }),
  out_of_stock: (n) => ({
    body: `${n} have tracked variants that are out of stock.`,
    href: "/app/inventory?risk=critical",
    cta: "Review inventory",
  }),
  description: (n) => ({
    body: `${n} have a missing or very short description.`,
    href: "/app/readiness",
    cta: "See affected products",
  }),
  seo_description: (n) => ({
    body: `${n} are missing an SEO description. You can apply suggested SEO in a few clicks.`,
    href: "/app/readiness",
    cta: "Fix SEO",
  }),
  seo_title: (n) => ({
    body: `${n} are missing an SEO title. You can apply suggested SEO in a few clicks.`,
    href: "/app/readiness",
    cta: "Fix SEO",
  }),
  status_active: (n) => ({
    body: `${n} are drafts or archived and not for sale.`,
    href: "/app/products?status=DRAFT",
    cta: "Review drafts",
  }),
  low_stock: (n) => ({
    body: `${n} are running low on stock.`,
    href: "/app/inventory?risk=low",
    cta: "Review inventory",
  }),
};

export function nextBestAction(
  issues: readonly IssueCountLike[],
): NextAction | null {
  const candidates = issues
    .filter((i) => i.count > 0 && COPY[i.checkId])
    .sort(
      (a, b) =>
        (PRIORITY[b.checkId] ?? 0) - (PRIORITY[a.checkId] ?? 0) ||
        b.count - a.count,
    );
  const top = candidates[0];
  if (!top) return null;
  const subject = `${top.count} product${top.count === 1 ? "" : "s"}`;
  const copy = COPY[top.checkId];
  if (!copy) return null;
  return { heading: "Next best action", ...copy(subject) };
}

/** One-line readiness verdict, e.g. "Almost ready: 3 issues to fix". */
export function readinessVerdict(
  score: number | null,
  openChecks: number,
): { tone: "success" | "warning" | "critical" | "neutral"; text: string } {
  if (score === null) return { tone: "neutral", text: "Nothing to check yet" };
  const issues = `${openChecks} issue${openChecks === 1 ? "" : "s"} to fix`;
  if (openChecks === 0)
    return { tone: "success", text: "Ready: every check passes" };
  if (score >= 80) return { tone: "success", text: `Almost ready: ${issues}` };
  if (score >= 50) return { tone: "warning", text: `Getting there: ${issues}` };
  return { tone: "critical", text: `Not ready yet: ${issues}` };
}
