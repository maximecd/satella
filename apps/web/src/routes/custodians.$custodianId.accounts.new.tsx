import { createFileRoute } from "@tanstack/react-router";
import { CreateAccountScreen } from "../screens/accounts";
export const Route = createFileRoute("/custodians/$custodianId/accounts/new")({
  component: () => <CreateAccountScreen custodianId={Route.useParams().custodianId} />,
});
