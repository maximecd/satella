import { createFileRoute } from "@tanstack/react-router";
import { CreatePositionScreen } from "../screens/positions";
export const Route = createFileRoute("/accounts/$accountId/positions/new")({
  component: () => <CreatePositionScreen accountId={Route.useParams().accountId} />,
});
