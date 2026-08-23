import type { ConnectorCapability } from "@satella-app/connector-core";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export const OkxConnectorCapability = {
  id: "okx",
  name: "OKX",
  icon,
  instructions,
  assetCategories: ["crypto"],
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      kind: "text",
      required: true,
      helpText: "Create a read-only API key in OKX.",
    },
    {
      key: "secretKey",
      label: "Secret key",
      kind: "password",
      required: true,
    },
    {
      key: "passphrase",
      label: "Passphrase",
      kind: "password",
      required: true,
    },
    {
      key: "region",
      label: "Region",
      kind: "select",
      required: true,
      options: [
        { value: "global", label: "Global" },
        { value: "eea", label: "European Economic Area" },
        { value: "us", label: "United States" },
      ],
    },
  ],
} satisfies ConnectorCapability;
