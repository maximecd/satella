import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsListScreen } from "../screens/connections";

export const Route = createFileRoute("/settings/connections/")({
  component: ConnectionsListScreen,
});
