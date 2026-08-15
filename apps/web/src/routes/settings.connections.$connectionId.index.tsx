import { createFileRoute } from "@tanstack/react-router";

import { ConnectionDetailScreen } from "../screens/connections";

export const Route = createFileRoute("/settings/connections/$connectionId/")({
  component: () => <ConnectionDetailScreen id={Route.useParams().connectionId} />,
});
