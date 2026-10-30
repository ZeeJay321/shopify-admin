import { flatRoutes } from "@react-router/fs-routes";

// Colocated tests live next to routes; don't register them as routes.
export default flatRoutes({ ignoredRouteFiles: ["**/*.test.{ts,tsx}"] });
