import { createFileRoute } from "@tanstack/react-router";
import { EditAccountScreen } from "../screens/accounts";
export const Route = createFileRoute("/accounts/$accountId/edit")({
  component: () => <EditAccountScreen id={Route.useParams().accountId} />,
});
