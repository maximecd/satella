export const ADD_ASSETS_CATEGORIES = ["stocks_etfs", "bonds", "crypto", "cash", "other"] as const;

export type AddAssetsCategory = (typeof ADD_ASSETS_CATEGORIES)[number];

export type AddAssetsFlow = "holdings" | "cash" | "generic";

export const categoryMeta = (category: AddAssetsCategory) => {
  switch (category) {
    case "stocks_etfs":
      return {
        label: "Stocks & ETFs",
        description: "Search listed stocks and ETFs, then place them in an account.",
        assetCategory: "stocks_etfs" as const,
        flow: "holdings" as const,
        accountPrompt: "Choose an account",
      };
    case "bonds":
      return {
        label: "Bonds",
        description: "Track a bond by name and current value.",
        assetCategory: "bonds" as const,
        flow: "generic" as const,
        accountPrompt: "Choose an account",
      };
    case "crypto":
      return {
        label: "Crypto",
        description: "Search supported crypto and place it in an account.",
        assetCategory: "crypto" as const,
        flow: "holdings" as const,
        accountPrompt: "Choose an account",
      };
    case "cash":
      return {
        label: "Cash",
        description: "Select or create an account, then set its currency and balance.",
        assetCategory: "cash" as const,
        flow: "cash" as const,
        accountPrompt: "Choose an account",
      };
    case "other":
      return {
        label: "Other assets",
        description: "Track a custom asset by name and current value.",
        assetCategory: "other" as const,
        flow: "generic" as const,
        accountPrompt: "Choose an account",
      };
  }
};
