import { createFileRoute } from "@tanstack/react-router";
import { DebtFormScreen } from "../screens/debts";

export const Route = createFileRoute("/debts/$debtId/edit")({
  component: () => <DebtFormScreen id={Route.useParams().debtId} />,
});
