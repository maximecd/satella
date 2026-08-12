import { createFileRoute } from "@tanstack/react-router";
import { CustodianDetailScreen } from "../screens/custodians";
export const Route = createFileRoute("/custodians/$custodianId/")({
  component: () => <CustodianDetailScreen id={Route.useParams().custodianId} />,
});
