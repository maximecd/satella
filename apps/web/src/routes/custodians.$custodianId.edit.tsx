import { createFileRoute } from "@tanstack/react-router";
import { EditCustodianScreen } from "../screens/custodians";
export const Route = createFileRoute("/custodians/$custodianId/edit")({
  component: () => <EditCustodianScreen id={Route.useParams().custodianId} />,
});
