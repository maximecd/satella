import { createFileRoute } from "@tanstack/react-router";
import { DebtFormScreen } from "../screens/debts";

export const Route = createFileRoute("/debts/new")({
  component: () => <DebtFormScreen />,
});
