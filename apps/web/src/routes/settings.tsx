import { createFileRoute, Outlet } from "@tanstack/react-router";

function SettingsLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});
