import { Icon, IconButton } from "@chakra-ui/react";
import { RefreshCw } from "lucide-react";
import type { MouseEvent } from "react";

import { notify } from "./components/ui/toaster";
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
  const refresh = useRefreshConnection();
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    refresh.mutate(connectionId, {
      onSuccess: (result) => {
        onError?.(null);
        if (result.failures.length > 0) {
          notify.error(
            `Refresh completed with ${result.failures.length} price issue${
              result.failures.length === 1 ? "" : "s"
            }.`,
          );
          return;
        }
        notify.success("Connection refreshed.");
      },
      onError: (cause) => {
        const message = errorMessage(cause);
        onError?.(message);
        if (onError === undefined) {
          notify.error(message, true);
        }
      },
    });
  };
  return (
    <IconButton
      aria-label="Refresh"
      variant="ghost"
      loading={refresh.isPending}
      onClick={handleClick}
    >
      <Icon asChild>
        <RefreshCw />
      </Icon>
    </IconButton>
  );
}
