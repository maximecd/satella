import { createFileRoute } from "@tanstack/react-router";
import { GoalFormScreen } from "../screens/goals";

export const Route = createFileRoute("/goals/new")({
  component: () => <GoalFormScreen />,
});
