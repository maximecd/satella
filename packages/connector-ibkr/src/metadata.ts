import type { ConnectorCapability } from "@satella-app/connector-core";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export const IbkrConnectorCapability = {
  id: "ibkr",
  name: "Interactive Brokers",
  icon,
  instructions,
  assetCategories: ["stocks_etfs", "crypto", "cash", "other"],
  credentialFields: [
    {
      key: "token",
      label: "Flex token",
      kind: "password",
      required: true,
      helpText: "Create a read-only Flex Web Service token in IBKR Client Portal.",
    },
    {
      key: "queryId",
      label: "Activity Query ID",
      kind: "text",
      required: true,
      helpText:
        "Use the ID of an Activity Flex Query configured for XML and Base Currency Summary (or Currency Breakout for multi-currency cash).",
    },
  ],
} satisfies ConnectorCapability;
