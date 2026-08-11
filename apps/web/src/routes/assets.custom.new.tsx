import { createFileRoute } from "@tanstack/react-router";
import { CreateCustomAssetScreen } from "../screens/assets";
export const Route = createFileRoute("/assets/custom/new")({ component: CreateCustomAssetScreen });
