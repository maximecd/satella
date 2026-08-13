import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/custodians/new/connector")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
