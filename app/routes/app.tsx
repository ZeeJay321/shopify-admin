import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { PageSkeleton, skeletonFor } from "../components/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const location = useLocation();
  // Skeleton only when moving to another page; same-page filter changes keep
  // their content and show inline loading instead (no layout jump).
  const target =
    navigation.state === "loading" &&
    navigation.location.pathname !== location.pathname
      ? navigation.location.pathname
      : null;

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        {/* rel="home": the app name opens Store Health; not a separate item */}
        <a href="/app" rel="home">
          Store health
        </a>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/inventory">Inventory</s-link>
        <s-link href="/app/orders">Orders</s-link>
        <s-link href="/app/readiness">Readiness</s-link>
      </s-app-nav>
      {target ? <PageSkeleton variant={skeletonFor(target)} /> : <Outlet />}
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
