export const ADD_ASSETS_CATEGORIES = [
  "checking",
  "savings",
  "stocks_etfs",
  "crypto",
  "other",
] as const;

export type AddAssetsCategory = (typeof ADD_ASSETS_CATEGORIES)[number];

export type AddAssetsFlow = "holdings" | "cash" | "generic";

export const categoryMeta = (category: AddAssetsCategory) => {
  switch (category) {
    case "checking":
      return {
        label: "Checking",
        description: "Add a checking account at a bank with a starting balance.",
        assetCategory: "cash" as const,
        flow: "cash" as const,
        skipConnectors: true,
        custodianLabel: "Bank",
        accountType: "checking" as const,
      };
    case "savings":
      return {
        label: "Savings",
        description: "Add a savings account at a bank with a starting balance.",
        assetCategory: "cash" as const,
        flow: "cash" as const,
        skipConnectors: true,
        custodianLabel: "Bank",
        accountType: "savings" as const,
      };
    case "stocks_etfs":
      return {
        label: "Stocks & ETFs",
        description: "Search listed stocks and ETFs, then place them in a brokerage account.",
        assetCategory: "stocks_etfs" as const,
        flow: "holdings" as const,
        skipConnectors: false,
        custodianLabel: "Broker",
        accountType: "brokerage" as const,
      };
    case "crypto":
      return {
        label: "Crypto",
        description: "Search supported crypto and place it in a wallet account.",
        assetCategory: "crypto" as const,
        flow: "holdings" as const,
        skipConnectors: false,
        custodianLabel: "Exchange",
        accountType: "crypto_wallet" as const,
      };
    case "other":
      return {
        label: "Other assets",
        description: "Track a custom asset by name and current value.",
        assetCategory: "other" as const,
        flow: "generic" as const,
        skipConnectors: true,
        custodianLabel: null,
        accountType: "other" as const,
      };
  }
};
