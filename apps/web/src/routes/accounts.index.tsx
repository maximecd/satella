import { createFileRoute } from "@tanstack/react-router";
import { AccountsScreen } from "../screens/accounts";

export const Route = createFileRoute("/accounts/")({
  component: AccountsScreen,
});
