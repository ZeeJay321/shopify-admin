/** Table state in the URL: read params, apply changes (see withParams). */

import { useSearchParams } from "react-router";
import { withParams } from "../../lib/tables";

export function useTableUrl() {
  const [params, setParams] = useSearchParams();
  const set = (changes: Record<string, string | null>) =>
    setParams(withParams(params, changes), { preventScrollReset: true });

  /** Cursor paging; `page` keeps "Showing 21–40" accurate. */
  const pageTo = (
    direction: "next" | "prev",
    cursor: string | null | undefined,
    page: number,
  ) =>
    set({
      cursor: cursor ?? null,
      dir: direction,
      page: String(Math.max(1, direction === "next" ? page + 1 : page - 1)),
    });

  return { params, set, pageTo };
}
