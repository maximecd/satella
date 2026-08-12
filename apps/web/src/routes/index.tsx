import { createFileRoute } from "@tanstack/react-router";

import { DashboardScreen } from "../screens/dashboard";

export const Route = createFileRoute("/")({
  component: DashboardScreen,
});
