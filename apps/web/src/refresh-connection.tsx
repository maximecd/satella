import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useToast } from "@astryxdesign/core/Toast";
import { RefreshCw } from "lucide-react";
import type { MouseEvent } from "react";

import { useRefreshConnection } from "./portfolio";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function RefreshConnectionButton({
  connectionId,
  onError,
}: {
  readonly connectionId: string;
  readonly onError?: (message: string | null) => void;
}) {
  const toast = useToast();
  const refresh = useRefreshConnection();
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    refresh.mutate(connectionId, {
      onSuccess: (result) => {
        onError?.(null);
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
