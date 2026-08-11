import { createFileRoute } from "@tanstack/react-router";
import { AccountDetailScreen } from "../screens/accounts";
export const Route = createFileRoute("/accounts/$accountId/")({
  component: () => <AccountDetailScreen id={Route.useParams().accountId} />,
});
