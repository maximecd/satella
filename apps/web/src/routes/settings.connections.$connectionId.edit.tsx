import { createFileRoute } from "@tanstack/react-router";

import { EditConnectionScreen } from "../screens/connections";

export const Route = createFileRoute("/settings/connections/$connectionId/edit")({
  component: () => <EditConnectionScreen id={Route.useParams().connectionId} />,
});
