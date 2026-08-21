import { createFileRoute } from "@tanstack/react-router";

import { CustodianDetailScreen } from "../screens/custodians";

export const Route = createFileRoute("/settings/custodians/$custodianId/")({
  component: () => <CustodianDetailScreen id={Route.useParams().custodianId} />,
});
