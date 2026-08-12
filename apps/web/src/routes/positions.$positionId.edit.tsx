import { createFileRoute } from "@tanstack/react-router";
import { EditPositionScreen } from "../screens/positions";
export const Route = createFileRoute("/positions/$positionId/edit")({
  component: () => <EditPositionScreen positionId={Route.useParams().positionId} />,
});
