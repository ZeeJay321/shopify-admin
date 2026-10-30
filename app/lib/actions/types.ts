/**
 * Shared types for write-action planning. Pure: used by the server (to
 * re-validate every request) and the browser (to preview before confirming).
 */

export type FieldError = { field: string; message: string };

export type ActionPlan<S> = {
  valid: boolean;
  errors: FieldError[];
  /** Non-blocking notes shown in the preview. */
  warnings: string[];
  /** Before/after values for the preview and confirmation dialog. */
  summary: S;
  /** The merchant must tick an extra acknowledgement before confirming. */
  requiresExtraConfirmation: boolean;
};

export type BeforeAfter<T> = { before: T; after: T };
