/**
 * Granted-scope checks against the session's comma-separated scope string.
 * Mirrors Shopify's rule that `write_x` implies `read_x`.
 */
export function hasScope(
  granted: string | null | undefined,
  required: string,
): boolean {
  const scopes = new Set(
    (granted ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (scopes.has(required)) return true;
  const match = /^read_(.+)$/.exec(required);
  return match !== null && scopes.has(`write_${match[1]}`);
}

export type WriteAccess = { products: boolean; inventory: boolean };

export function writeAccess(granted: string | null | undefined): WriteAccess {
  return {
    products: hasScope(granted, "write_products"),
    inventory: hasScope(granted, "write_inventory"),
  };
}
