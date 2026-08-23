import type { ConnectorCapability } from "@satella-app/connector-core";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export const KrakenConnectorCapability = {
  id: "kraken",
  name: "Kraken",
  icon,
  instructions,
  assetCategories: ["crypto"],
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      kind: "text",
      required: true,
      helpText: "Create a read-only API key in Kraken.",
    },
    {
      key: "apiSecret",
      label: "API secret",
      kind: "password",
      required: true,
    },
  ],
} satisfies ConnectorCapability;
