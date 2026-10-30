/** Plain inventory types for risk classification (no Shopify or UI types). */

export type LocationLevel = {
  locationId: string;
  locationName: string;
  /** "available" quantity at this location; may be negative (oversold). */
  available: number;
};

export type VariantInventory = {
  variantId: string;
  variantTitle: string;
  productId: string;
  productTitle: string;
  tracked: boolean;
  levels: LocationLevel[];
};

export type RiskLevel = "critical" | "low" | "healthy" | "untracked";

export type VariantRisk = {
  variant: VariantInventory;
  risk: RiskLevel;
  /** Total across locations, or at the filtered location. */
  available: number;
  /** Per-location breakdown (all locations the item is stocked at). */
  byLocation: LocationLevel[];
  outOfStock: boolean;
};

export type RiskThresholds = {
  /** available <= critical -> CRITICAL (covers out of stock). */
  critical: number;
  /** available <= low -> LOW. */
  low: number;
};

export type InventorySummary = {
  total: number;
  counts: Record<RiskLevel, number>;
  /** Most at-risk tracked variants: critical first, then low; least stock first. */
  topAtRisk: VariantRisk[];
};
