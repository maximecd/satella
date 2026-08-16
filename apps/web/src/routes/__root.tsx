import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

import { RootLayout } from "../components";
import { AddAssetsProvider } from "../screens/add-assets";
import { VaultGate } from "../screens/vault-gate";

export interface RouterContext {
  readonly queryClient: QueryClient;
}

function Root() {
  return (
    <AddAssetsProvider>
      <VaultGate>
        <RootLayout />
      </VaultGate>
    </AddAssetsProvider>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: Root });
