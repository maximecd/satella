import { createFileRoute } from "@tanstack/react-router";

import { CreateManualCustodianScreen } from "../screens/custodians";

export const Route = createFileRoute("/custodians/new/manual")({
  component: CreateManualCustodianScreen,
});
