import type { ConnectorCapability } from "@satella-app/connector-core";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export const TradeRepublicConnectorCapability = {
  id: "trade-republic",
  name: "Trade Republic",
  icon,
  instructions,
  assetCategories: ["stocks_etfs", "crypto", "cash", "other"],
  autoRefreshIntervalMs: 6 * 60 * 60 * 1_000,
  authenticationMode: "interactive",
  credentialFields: [
    {
      key: "phone",
      label: "Phone number",
      kind: "text",
      required: true,
      helpText: "Use the phone number registered with Trade Republic.",
    },
    {
      key: "pin",
      label: "PIN",
      kind: "password",
      required: true,
      helpText: "The confirmation code is requested in the next step.",
    },
  ],
} satisfies ConnectorCapability;
