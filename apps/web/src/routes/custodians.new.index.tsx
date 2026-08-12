import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/custodians/new/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
