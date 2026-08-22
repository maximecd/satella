import { Icon, IconButton } from "@chakra-ui/react";
import { RefreshCw } from "lucide-react";
import type { MouseEvent } from "react";

import { notify } from "./components/ui/toaster";
import { useRefreshCustodian } from "./portfolio";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

export function RefreshCustodianButton({
  custodianId,
  onError,
}: {
  readonly custodianId: string;
  readonly onError?: (message: string | null) => void;
}) {
  const refresh = useRefreshCustodian();
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    refresh.mutate(custodianId, {
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
        notify.success("Custodian refreshed.");
      },
      onError: (cause) => {
        const message = errorMessage(cause);
        onError?.(message);
        if (onError === undefined) {
          notify.error(message, undefined, true);
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
