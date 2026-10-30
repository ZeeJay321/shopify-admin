/**
 * Generic cursor pagination over Shopify connections.
 * Uses `pageInfo { hasNextPage endCursor }` and stops at a hard cap so
 * dashboards never walk an entire catalog.
 */

export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type Page<TNode> = {
  nodes: TNode[];
  pageInfo: PageInfo;
};

export type CollectedPages<TNode> = {
  nodes: TNode[];
  /** True when more data existed beyond the cap. */
  capped: boolean;
};

export async function collectPages<TNode>(
  fetchPage: (cursor: string | null, pageSize: number) => Promise<Page<TNode>>,
  { cap, pageSize }: { cap: number; pageSize: number },
): Promise<CollectedPages<TNode>> {
  const nodes: TNode[] = [];
  let cursor: string | null = null;

  while (nodes.length < cap) {
    const remaining = cap - nodes.length;
    const page = await fetchPage(cursor, Math.min(pageSize, remaining));
    nodes.push(...page.nodes.slice(0, remaining));

    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) {
      return { nodes, capped: false };
    }
    cursor = page.pageInfo.endCursor;
  }

  return { nodes, capped: true };
}
