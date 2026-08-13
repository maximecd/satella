import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/accounts/$accountId/positions/new")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
