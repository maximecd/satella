import { createFileRoute } from "@tanstack/react-router";
import { AssetDetailScreen } from "../screens/assets";
export const Route = createFileRoute("/assets/$assetId/edit")({
  component: () => <AssetDetailScreen id={Route.useParams().assetId} />,
});
