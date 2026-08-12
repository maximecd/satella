import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/custodians/new/manual")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
