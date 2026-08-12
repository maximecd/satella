import { createFileRoute } from "@tanstack/react-router";
import { CustodianListScreen } from "../screens/custodians";
export const Route = createFileRoute("/custodians/")({ component: CustodianListScreen });
