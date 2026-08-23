import type { ConnectorCapability } from "@satella-app/connector-core";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export const EvmConnectorCapability = {
  id: "evm",
  name: "EVM wallet",
  icon,
  instructions,
  assetCategories: ["crypto"],
  credentialFields: [
    {
      key: "address",
      label: "Wallet address",
      kind: "text",
      required: true,
      helpText: "A public 0x wallet address. Satella never asks for a private key.",
    },
  ],
} satisfies ConnectorCapability;
