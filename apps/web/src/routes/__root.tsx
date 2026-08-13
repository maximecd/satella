import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

import { RootLayout } from "../components";
import { AddAssetsProvider } from "../screens/add-assets";

export interface RouterContext {
  readonly queryClient: QueryClient;
}

function Root() {
  return (
    <AddAssetsProvider>
      <RootLayout />
    </AddAssetsProvider>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: Root });
