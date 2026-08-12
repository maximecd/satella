import { createFileRoute } from "@tanstack/react-router";
import { CustodianCreationLayout } from "../screens/custodians";

export const Route = createFileRoute("/custodians/new")({ component: CustodianCreationLayout });
