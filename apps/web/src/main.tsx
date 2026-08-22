import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createHashHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { Provider } from "./components/ui/provider";
import { AppLanguageSync } from "./i18n/AppLanguageSync";
import "./i18n/index.js";
import { createHttpPortfolioEngine, PortfolioEngineProvider } from "./portfolio";
import { routeTree } from "./routeTree.gen";

const portfolioEngine = createHttpPortfolioEngine();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 }, mutations: { retry: false } },
});

const history = window.location.protocol === "file:" ? createHashHistory() : createBrowserHistory();

const router = createRouter({ routeTree, context: { queryClient }, history });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <Provider>
      <QueryClientProvider client={queryClient}>
        <PortfolioEngineProvider engine={portfolioEngine}>
          <AppLanguageSync />
          <RouterProvider router={router} />
        </PortfolioEngineProvider>
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
