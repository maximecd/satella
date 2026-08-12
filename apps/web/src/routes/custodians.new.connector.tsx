import { createFileRoute } from "@tanstack/react-router";

import { CreateConnectorCustodianScreen } from "../screens/custodians";

export const Route = createFileRoute("/custodians/new/connector")({
  component: CreateConnectorCustodianScreen,
});
