/**
 * Shopify search-syntax builders for table search boxes (pure).
 *
 * Terms are reduced to letters, digits and dashes, so user input can never
 * inject search operators. Shopify matches words by prefix (`hood*` matches
 * "Organic Hoodie"), which is how "title contains" behaves here.
 */

const MAX_TERMS = 5;

export function searchTerms(q: string): string[] {
  return q
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

/** Every word of the product title. */
export function productTitleSearch(q: string): string | null {
  const terms = searchTerms(q);
  return terms.length ? terms.map((t) => `title:${t}*`).join(" AND ") : null;
}

/** Variants: Shopify's default fields (product and variant title, SKU). */
export function variantSearch(q: string): string | null {
  const terms = searchTerms(q);
  return terms.length ? terms.map((t) => `${t}*`).join(" AND ") : null;
}

/**
 * Orders by name only (never by customer fields): "1001" or "#1001" both
 * become `name:#1001*`.
 */
export function orderNameSearch(q: string): string | null {
  const [term] = searchTerms(q.replace(/^#/, ""));
  if (!term) return null;
  return /^\d/.test(term) ? `name:#${term}*` : `name:${term}*`;
}

/** Join non-empty query fragments with AND. */
export function joinQuery(
  ...parts: Array<string | null | undefined>
): string | null {
  const present = parts.filter((p): p is string => Boolean(p && p.trim()));
  if (present.length <= 1) return present[0] ?? null;
  return present.map((p) => `(${p})`).join(" AND ");
}
