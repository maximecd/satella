import { createFileRoute } from "@tanstack/react-router";
import { CreateCustodianScreen } from "../screens/custodians";
export const Route = createFileRoute("/custodians/new")({ component: CreateCustodianScreen });
