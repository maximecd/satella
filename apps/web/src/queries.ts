import { queryOptions } from "@tanstack/react-query";

import { engineApi } from "./api";

export const queryKeys = {
  vault: ["vault"] as const,
};

export const vaultStatusQuery = queryOptions({
  queryKey: queryKeys.vault,
  queryFn: () => engineApi.vaultStatus(),
  staleTime: 5_000,
  retry: 1,
});
