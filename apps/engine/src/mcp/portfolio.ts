import type {
  Account,
  AllocationCell,
  Dashboard,
  Debt,
  Goal,
  Position,
  ReportingCurrency,
} from "../finance/contracts.js";

export interface McpPrice {
  readonly price: string;
  readonly currencyAssetId: string;
  readonly currencyIso: string;
  readonly observedAt: string;
  readonly updatedAt: string;
}

export interface McpPosition {
  readonly id: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly assetSymbol: string | null;
  readonly assetCategory: Position["assetCategory"];
  readonly quantity: string;
  readonly price: McpPrice | null;
  readonly reportingValue: string | null;
  readonly averageUnitPurchasePrice: Position["averageUnitPurchasePrice"];
  readonly acquisitionCost: string | null;
  readonly unrealizedPnl: string | null;
  readonly unrealizedPnlPercent: string | null;
}

export interface McpAccount {
  readonly id: string;
  readonly name: string;
  readonly accountType: Account["accountType"];
  readonly custodianId: string;
  readonly custodianName: string;
  readonly synced: boolean;
  readonly connectorAccountId: string | null;
  readonly baseCurrencyIso: string;
  readonly total: string;
  readonly unrealizedPnl: string;
  readonly unrealizedPnlPercent: string | null;
  readonly totalIncomplete: boolean;
  readonly positions: ReadonlyArray<McpPosition>;
}

export interface McpPortfolio {
  readonly reportingCurrency: ReportingCurrency;
  readonly totalAssets: string;
  readonly totalDebt: string;
  readonly netWorth: string;
  readonly unrealizedPnl: string;
  readonly unrealizedPnlPercent: string | null;
  readonly totalIncomplete: boolean;
  readonly unpricedAssetCount: number;
  readonly negativeHoldingCount: number;
  readonly categoryAllocation: ReadonlyArray<AllocationCell>;
  readonly custodianAllocation: ReadonlyArray<AllocationCell>;
  readonly assetAllocation: ReadonlyArray<AllocationCell>;
  readonly accounts: ReadonlyArray<McpAccount>;
  readonly debts: ReadonlyArray<Debt>;
  readonly goals: ReadonlyArray<Goal>;
}

const mcpPrice = (price: Position["price"]): McpPrice | null =>
  price === null
    ? null
    : {
        price: price.price,
        currencyAssetId: price.currencyAssetId,
        currencyIso: price.currencyIso,
        observedAt: price.observedAt,
        updatedAt: price.updatedAt,
      };

const mcpPosition = (position: Position): McpPosition => ({
  id: position.id,
  assetId: position.assetId,
  assetName: position.assetName,
  assetSymbol: position.assetSymbol,
  assetCategory: position.assetCategory,
  quantity: position.quantity,
  price: mcpPrice(position.price),
  reportingValue: position.reportingValue,
  averageUnitPurchasePrice: position.averageUnitPurchasePrice,
  acquisitionCost: position.acquisitionCost,
  unrealizedPnl: position.unrealizedPnl,
  unrealizedPnlPercent: position.unrealizedPnlPercent,
});

export const toMcpPortfolio = (
  dashboard: Dashboard,
  accounts: ReadonlyArray<{ readonly account: Account; readonly synced: boolean }>,
  debts: ReadonlyArray<Debt>,
  goals: ReadonlyArray<Goal>,
): McpPortfolio => ({
  reportingCurrency: dashboard.reportingCurrency,
  totalAssets: dashboard.totalAssets,
  totalDebt: dashboard.totalDebt,
  netWorth: dashboard.netWorth,
  unrealizedPnl: dashboard.unrealizedPnl,
  unrealizedPnlPercent: dashboard.unrealizedPnlPercent,
  totalIncomplete: dashboard.totalIncomplete,
  unpricedAssetCount: dashboard.unpricedAssetCount,
  negativeHoldingCount: dashboard.negativeHoldingCount,
  categoryAllocation: dashboard.categoryAllocation,
  custodianAllocation: dashboard.custodianAllocation,
  assetAllocation: dashboard.assetAllocation,
  accounts: accounts.map(({ account, synced }) => ({
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    custodianId: account.custodianId,
    custodianName: account.custodianName,
    synced,
    connectorAccountId: account.connectorAccountId,
    baseCurrencyIso: account.baseCurrencyIso,
    total: account.total,
    unrealizedPnl: account.unrealizedPnl,
    unrealizedPnlPercent: account.unrealizedPnlPercent,
    totalIncomplete: account.totalIncomplete,
    positions: account.positions.map(mcpPosition),
  })),
  debts,
  goals,
});
