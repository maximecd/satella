import { createFileRoute } from "@tanstack/react-router";
import { DebtsScreen } from "../screens/debts";

export const Route = createFileRoute("/debts/")({
  component: DebtsScreen,
});
