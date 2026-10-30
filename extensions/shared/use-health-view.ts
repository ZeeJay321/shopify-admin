/**
 * Shared Preact hook for both product extensions: fetches the health summary
 * from the app route on mount and whenever the product changes. No polling.
 *
 * `fetch` from an Admin UI extension resolves relative URLs against the app
 * URL and adds the Shopify ID token automatically.
 */

import { useCallback, useEffect, useState } from "preact/hooks";
import type { HealthViewState } from "../../app/lib/product-health-api/view-model";
import { loadHealthView } from "../../app/lib/product-health-api/view-model";

export function useHealthView(productGid: string | null): {
  state: HealthViewState;
  retry: () => void;
} {
  const [state, setState] = useState<HealthViewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    loadHealthView((url) => fetch(url), productGid).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [productGid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
