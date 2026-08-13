export const ADD_ASSETS_CATEGORIES = [
  "stocks-etfs",
  "crypto",
  "current",
  "savings",
  "other",
] as const;

export type AddAssetsCategory = (typeof ADD_ASSETS_CATEGORIES)[number];

export const categoryMeta = (category: AddAssetsCategory) => {
  switch (category) {
    case "stocks-etfs":
      return {
        label: "Stocks & ETFs",
        description: "Search listed stocks and ETFs, then place them in a bank or broker account.",
        assetClass: "security" as const,
        accountKind: "securities" as const,
        discoveryClass: "security" as const,
        custodianPrompt: "Choose a bank or broker",
        accountPrompt: "Choose an account",
        hasHoldingsFlow: true,
      };
    case "crypto":
      return {
        label: "Crypto",
        description: "Search supported crypto and place it in a platform or wallet account.",
        assetClass: "crypto" as const,
        accountKind: "crypto" as const,
        discoveryClass: "crypto" as const,
        custodianPrompt: "Choose a platform or wallet",
        accountPrompt: "Choose an account",
        hasHoldingsFlow: true,
      };
    case "current":
      return {
        label: "Current accounts",
        description: "Track a bank current account and its current balance.",
        assetClass: "fiat" as const,
        accountKind: "current" as const,
        discoveryClass: "fiat" as const,
        custodianPrompt: "Choose a bank",
        accountPrompt: "Account name",
        hasHoldingsFlow: false,
      };
    case "savings":
      return {
        label: "Savings accounts",
        description: "Track a savings account and its current balance.",
        assetClass: "fiat" as const,
        accountKind: "savings" as const,
        discoveryClass: "fiat" as const,
        custodianPrompt: "Choose a bank",
        accountPrompt: "Account name",
        hasHoldingsFlow: false,
      };
    case "other":
      return {
        label: "Other assets",
        description: "Track a custom asset by name and current value.",
        assetClass: "custom" as const,
        accountKind: "other" as const,
        discoveryClass: "custom" as const,
        custodianPrompt: "",
        accountPrompt: "",
        hasHoldingsFlow: false,
      };
  }
};

export const invalidateFinanceQueries = (queryClient: {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => Promise<unknown>;
}) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["custodians"] }),
    queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["assets"] }),
  ]);
