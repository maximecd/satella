import { createFileRoute } from "@tanstack/react-router";

import { SyncLogScreen } from "../screens/sync-log";

export const Route = createFileRoute("/settings/sync-log")({
  component: SyncLogScreen,
});
