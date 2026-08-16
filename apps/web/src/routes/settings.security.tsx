import { createFileRoute } from "@tanstack/react-router";

import { SettingsSecurityScreen } from "../screens/settings-security";

export const Route = createFileRoute("/settings/security")({
  component: SettingsSecurityScreen,
});
