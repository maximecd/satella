import { createFileRoute } from "@tanstack/react-router";
import { GoalsScreen } from "../screens/goals";

export const Route = createFileRoute("/goals/")({
  component: GoalsScreen,
});
