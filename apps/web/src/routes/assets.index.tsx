import { createFileRoute } from "@tanstack/react-router";
import { AssetListScreen } from "../screens/assets";
export const Route = createFileRoute("/assets/")({ component: AssetListScreen });
