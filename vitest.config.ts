import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Separate from vite.config.ts so Vitest does not load the Shopify/React Router
 * Vite plugins or HOST/SHOPIFY_APP_URL side effects used for app dev.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "extensions/**/*.test.ts"],
    passWithNoTests: true,
  },
});
