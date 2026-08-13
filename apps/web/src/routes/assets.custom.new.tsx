import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/assets/custom/new")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
