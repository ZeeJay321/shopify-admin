import type { WriteErrorCode } from "./messages";
import type { SeoBatchItem } from "./seo-batch";
import type { FieldError } from "./types";

export * from "./types";
export * from "./seo";
export * from "./status";
export * from "./inventory";
export * from "./seo-batch";
export * from "./messages";
export * from "./content";
export * from "./bulk";
export * from "./fixes";

/** Result of a write-action POST, as returned to the UI. */
export type WriteActionResult =
  | {
      ok: true;
      intent: string;
      message: string;
      /** Batch only: per-product outcomes. */
      results?: BatchOutcome[];
      /** Batch preview only: planned changes awaiting confirmation. */
      preview?: SeoBatchItem[];
      skipped?: number;
    }
  | {
      ok: false;
      intent: string;
      code: WriteErrorCode;
      message: string;
      fieldErrors?: FieldError[];
      /** Conflict: the values now in Shopify, so the dialog can reload them. */
      current?: Record<string, string | number | null>;
      results?: BatchOutcome[];
    };

export type BatchOutcome = {
  productId: string;
  productTitle: string;
  ok: boolean;
  message: string;
};
