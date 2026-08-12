import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/custodians/$custodianId/accounts/new")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
