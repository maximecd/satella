import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { MouseEvent } from "react";

import { invalidateFinanceQueries } from "./add-assets";
import { engineApi } from "./api";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function RefreshConnectionButton({
  connectionId,
  onError,
}: {
  readonly connectionId: string;
  readonly onError?: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = useMutation({
    mutationFn: () => engineApi.refreshConnection(connectionId),
    onSuccess: async (result) => {
      onError?.(null);
      await invalidateFinanceQueries(queryClient);
      if (result.failures.length > 0) {
        toast({
          body: `Refresh completed with ${result.failures.length} price issue${
            result.failures.length === 1 ? "" : "s"
          }.`,
          type: "error",
        });
        return;
      }
      toast({ body: "Connection refreshed." });
    },
    onError: (cause) => {
      const message = errorMessage(cause);
      onError?.(message);
      if (onError === undefined) {
        toast({ body: message, isAutoHide: false, type: "error" });
      }
    },
  });
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    refresh.mutate();
  };
  return (
    <IconButton
      label="Refresh"
      tooltip="Refresh"
      variant="ghost"
      icon={<Icon icon={RefreshCw} />}
      isLoading={refresh.isPending}
      onClick={handleClick}
    />
  );
}
