import { createFileRoute } from "@tanstack/react-router";

import { CustodiansListScreen } from "../screens/custodians";

export const Route = createFileRoute("/settings/custodians/")({
  component: CustodiansListScreen,
});
