export * from "./types";
export { DEFAULT_CHECKS, liveProductRatio, liveProducts } from "./checks";
export {
  CheckRegistry,
  defaultRegistry,
  evaluateReadiness,
  statusFor,
} from "./run";

export const READINESS_GROUPS = [
  { id: "products", label: "Products" },
  { id: "variants", label: "Variants" },
  { id: "seo", label: "SEO" },
  { id: "collections", label: "Collections" },
  { id: "publishing", label: "Publishing" },
] as const;
