import type {
  Account,
  AverageUnitPurchasePrice,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  AssetSearchResult,
  ConnectConnectionInput,
  Connection,
  ConnectionRefreshResult,
  Dashboard,
  MaintainAssetInput,
  ManualHoldingLookup,
  Position,
  PositionEdit,
  Settings,
  UpdateAccountInput,
  UpdateConnectionInput,
  UpdateSettingsInput,
} from "@optimus/engine/api";

import type { ConnectorCapabilities, PortfolioEngine, PortfolioEngineOperation } from "./engine";
import { abortError, PortfolioFailure } from "./failure";
import {
  addDecimal,
  canonicalDecimal,
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "../financial-number";

export type DashboardProjection = (dashboard: Dashboard, settings: Settings) => Dashboard;

export type MemoryPortfolioSeed = {
  readonly dashboard?: Dashboard;
  readonly settings?: Settings;
  readonly projectDashboard?: DashboardProjection;
  readonly connections?: ReadonlyArray<Connection>;
  readonly accounts?: ReadonlyArray<Account>;
  readonly assets?: ReadonlyArray<Asset>;
  readonly positionEdits?: ReadonlyArray<PositionEdit>;
  readonly capabilities?: ConnectorCapabilities;
  readonly searchResults?: ReadonlyArray<AssetSearchResult>;
  readonly holdingLookup?: ManualHoldingLookup;
  readonly refreshResult?: ConnectionRefreshResult;
  readonly addAssetsResult?: AddAssetsResult;
};

export type MemoryPortfolioEngine = PortfolioEngine & {
  readonly seed: (next: MemoryPortfolioSeed) => void;
  readonly reset: () => void;
  readonly fail: (
    error: PortfolioFailure | null,
    operations?: ReadonlyArray<PortfolioEngineOperation>,
  ) => void;
};

const defaultDashboard: Dashboard = {
  reportingCurrency: { assetId: "fiat:USD", iso: "USD" },
  portfolioValue: "0",
  unrealizedPnl: "0",
  unrealizedPnlPercent: null,
  totalIncomplete: false,
  unpricedAssetCount: 0,
  negativeHoldingCount: 0,
  hasMeaningfulAssets: false,
  accounts: [],
  assetAllocation: [],
  categoryAllocation: [],
  history: [],
};

const defaultSettings: Settings = {
  reportingCurrency: { assetId: "fiat:USD", iso: "USD" },
  currencies: [
    { assetId: "fiat:EUR", iso: "EUR", name: "Euro" },
    { assetId: "fiat:USD", iso: "USD", name: "US dollar" },
  ],
};

const defaultCapabilities: ConnectorCapabilities = { connectors: [] };
const defaultHoldingLookup: ManualHoldingLookup = { assetId: null, quantity: null };

const clone = <T>(value: T): T => structuredClone(value);

const providerAveragesFrom = (
  accounts: ReadonlyArray<Account>,
  positionEdits: ReadonlyArray<PositionEdit>,
) => {
  const averages = new Map<string, AverageUnitPurchasePrice>();
  const positions = [
    ...accounts.flatMap((account) => account.positions),
    ...positionEdits.map(({ position }) => position),
  ];
  for (const position of positions) {
    if (
      position.assetCategory !== "cash" &&
      position.averageUnitPurchasePrice?.source === "connection"
    ) {
      averages.set(position.id, clone(position.averageUnitPurchasePrice));
    }
  }
  return averages;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

const notFound = (entity: string) => new PortfolioFailure("not_found", `${entity} was not found`);

const nowIso = () => new Date().toISOString();

const accountTotal = (positions: ReadonlyArray<Position>, baseCurrencyAssetId: string) => {
  let total = "0";
  let unrealizedPnl = "0";
  let acquisitionCost = "0";
  let incomplete = false;
  for (const position of positions) {
    if (compareDecimal(position.quantity, "0") === 0) continue;
    if (position.reportingValue === null) {
      incomplete = true;
      continue;
    }
    total = addDecimal(total, position.reportingValue);
    if (
      position.unrealizedPnl !== null &&
      position.acquisitionCost !== null &&
      position.averageUnitPurchasePrice !== null &&
      position.averageUnitPurchasePrice.currencyAssetId === baseCurrencyAssetId
    ) {
      unrealizedPnl = addDecimal(unrealizedPnl, position.unrealizedPnl);
      acquisitionCost = addDecimal(acquisitionCost, position.acquisitionCost);
    }
  }
  return {
    total,
    totalIncomplete: incomplete,
    unrealizedPnl,
    unrealizedPnlPercent:
      compareDecimal(acquisitionCost, "0") === 0
        ? null
        : divideDecimal(unrealizedPnl, acquisitionCost),
  };
};

const revaluePosition = (
  position: Position,
  baseCurrencyAssetId: string,
  next: {
    readonly quantity?: string | number;
    readonly price?: Position["price"];
    readonly averageUnitPurchasePrice?: Position["averageUnitPurchasePrice"];
  } = {},
): Position => {
  const quantity = canonicalDecimal(next.quantity ?? position.quantity);
  const price = next.price === undefined ? position.price : next.price;
  const average =
    next.averageUnitPurchasePrice === undefined
      ? position.averageUnitPurchasePrice
      : next.averageUnitPurchasePrice;
  const acquisitionCost = average === null ? null : multiplyDecimal(quantity, average.price);
  const reportingValue =
    price === null
      ? null
      : price.currencyAssetId === baseCurrencyAssetId
        ? multiplyDecimal(quantity, price.price)
        : position.reportingValue;
  let unrealizedPnl: string | null = null;
  let unrealizedPnlPercent: string | null = null;
  if (
    position.assetCategory !== "cash" &&
    compareDecimal(quantity, "0") > 0 &&
    average !== null &&
    compareDecimal(average.price, "0") > 0 &&
    price !== null &&
    price.currencyAssetId === average.currencyAssetId
  ) {
    unrealizedPnl = subtractDecimal(multiplyDecimal(quantity, price.price), acquisitionCost ?? "0");
    unrealizedPnlPercent = divideDecimal(unrealizedPnl, acquisitionCost ?? "1");
  }
  return {
    ...position,
    quantity,
    price,
    reportingValue,
    averageUnitPurchasePrice: average,
    acquisitionCost,
    unrealizedPnl,
    unrealizedPnlPercent,
  };
};

export const createMemoryPortfolioEngine = (
  seed: MemoryPortfolioSeed = {},
): MemoryPortfolioEngine => {
  type MemoryState = {
    dashboard: Dashboard;
    settings: Settings;
    projectDashboard: DashboardProjection | undefined;
    connections: Connection[];
    accounts: Account[];
    assets: Asset[];
    positionEdits: PositionEdit[];
    capabilities: ConnectorCapabilities;
    searchResults: AssetSearchResult[];
    holdingLookup: ManualHoldingLookup;
    refreshResult: ConnectionRefreshResult | undefined;
    addAssetsResult: AddAssetsResult | undefined;
    providerAverages: Map<string, AverageUnitPurchasePrice>;
  };
  const snapshot = (next: MemoryPortfolioSeed): MemoryState => {
    const accounts = clone([...(next.accounts ?? [])]);
    const positionEdits = clone([...(next.positionEdits ?? [])]);
    return {
      dashboard: clone(next.dashboard ?? defaultDashboard),
      settings: clone(next.settings ?? defaultSettings),
      projectDashboard: next.projectDashboard,
      connections: clone([...(next.connections ?? [])]),
      accounts,
      assets: clone([...(next.assets ?? [])]),
      positionEdits,
      capabilities: clone(next.capabilities ?? defaultCapabilities),
      searchResults: clone([...(next.searchResults ?? [])]),
      holdingLookup: clone(next.holdingLookup ?? defaultHoldingLookup),
      refreshResult: next.refreshResult === undefined ? undefined : clone(next.refreshResult),
      addAssetsResult: next.addAssetsResult === undefined ? undefined : clone(next.addAssetsResult),
      providerAverages: providerAveragesFrom(accounts, positionEdits),
    };
  };
  const cloneState = (value: MemoryState): MemoryState => ({
    dashboard: clone(value.dashboard),
    settings: clone(value.settings),
    projectDashboard: value.projectDashboard,
    connections: clone(value.connections),
    accounts: clone(value.accounts),
    assets: clone(value.assets),
    positionEdits: clone(value.positionEdits),
    capabilities: clone(value.capabilities),
    searchResults: clone(value.searchResults),
    holdingLookup: clone(value.holdingLookup),
    refreshResult: value.refreshResult === undefined ? undefined : clone(value.refreshResult),
    addAssetsResult: value.addAssetsResult === undefined ? undefined : clone(value.addAssetsResult),
    providerAverages: new Map(
      [...value.providerAverages].map(([id, average]) => [id, clone(average)] as const),
    ),
  });
  const defaults = snapshot(seed);
  let state = cloneState(defaults);
  let failure: PortfolioFailure | null = null;
  let failedOperations: ReadonlySet<PortfolioEngineOperation> | null = null;

  const rejectIfFailed = (operation: PortfolioEngineOperation) => {
    if (failure === null) return;
    if (failedOperations === null || failedOperations.has(operation)) throw failure;
  };

  const requireAccount = (id: string) => {
    const account = state.accounts.find((candidate) => candidate.id === id);
    if (account === undefined) throw notFound("Account");
    return account;
  };

  const requireAsset = (id: string) => {
    const asset = state.assets.find((candidate) => candidate.id === id);
    if (asset === undefined) throw notFound("Asset");
    return asset;
  };

  const requireConnection = (id: string) => {
    const connection = state.connections.find((candidate) => candidate.id === id);
    if (connection === undefined) throw notFound("Connection");
    return connection;
  };

  const requirePositionEdit = (id: string) => {
    const edit = state.positionEdits.find((candidate) => candidate.position.id === id);
    if (edit === undefined) throw notFound("Position");
    return edit;
  };

  const currencyIso = (assetId: string) => {
    const fromSettings = state.settings.currencies.find((option) => option.assetId === assetId);
    if (fromSettings !== undefined) return fromSettings.iso;
    const fromAssets = state.assets.find((asset) => asset.id === assetId);
    return fromAssets?.symbol ?? "USD";
  };

  const syncDashboardAccounts = () => {
    state.dashboard = {
      ...state.dashboard,
      accounts: state.accounts.map((account) => {
        return {
          accountId: account.id,
          accountName: account.name,
          connectionId: account.connectionId,
          connectionName: account.connectionName,
          positionCount: account.positions.filter(
            (position) => compareDecimal(position.quantity, "0") !== 0,
          ).length,
          total: account.total,
          unrealizedPnl: account.unrealizedPnl,
          unrealizedPnlPercent: account.unrealizedPnlPercent,
          totalIncomplete: account.totalIncomplete,
        };
      }),
    };
  };

  const replaceAccount = (next: Account) => {
    const totals = accountTotal(next.positions, next.baseCurrencyAssetId);
    const account = { ...next, ...totals };
    state.accounts = state.accounts.map((candidate) =>
      candidate.id === account.id ? account : candidate,
    );
    state.positionEdits = state.positionEdits.map((edit) => {
      if (edit.account.id !== account.id) return edit;
      const position = account.positions.find((item) => item.id === edit.position.id);
      return {
        position: position ?? edit.position,
        account: {
          id: account.id,
          name: account.name,
          connectionId: account.connectionId,
          connectionName: account.connectionName,
          baseCurrencyAssetId: account.baseCurrencyAssetId,
          baseCurrencyIso: account.baseCurrencyIso,
        },
      };
    });
    state.connections = state.connections.map((connection) => {
      if (account.connectionId !== connection.id) return connection;
      return {
        ...connection,
        accounts: connection.accounts.map((summary) =>
          summary.id === account.id
            ? {
                ...summary,
                name: account.name,
                baseCurrencyIso: account.baseCurrencyIso,
                positionCount: account.positions.filter(
                  (position) => compareDecimal(position.quantity, "0") !== 0,
                ).length,
              }
            : summary,
        ),
      };
    });
    syncDashboardAccounts();
    return account;
  };

  const applySettings = (next: Settings): Settings => {
    state.settings = next;
    const withCurrency: Dashboard = {
      ...state.dashboard,
      reportingCurrency: next.reportingCurrency,
    };
    state.dashboard =
      state.projectDashboard === undefined
        ? withCurrency
        : state.projectDashboard(withCurrency, next);
    return state.settings;
  };

  const addAssetsOutcome = (inputAccountName?: string): AddAssetsResult => {
    if (state.addAssetsResult !== undefined) return clone(state.addAssetsResult);
    const name = inputAccountName ?? "Account";
    return {
      accountId: `account-${state.accounts.length + 1}`,
      accountName: name,
      positionOutcome: "created",
    };
  };

  const ensureAccountFromDestination = (destination: AddManualHoldingInput["account"]) => {
    if (destination.type === "existing") return requireAccount(destination.id);
    const created: Account = {
      id: `account-${state.accounts.length + 1}`,
      connectionId: null,
      connectionName: null,
      name: destination.name,
      baseCurrencyAssetId: destination.baseCurrencyAssetId ?? "fiat:USD",
      baseCurrencyIso: currencyIso(destination.baseCurrencyAssetId ?? "fiat:USD"),
      connectorAccountId: null,
      positions: [],
      total: "0",
      unrealizedPnl: "0",
      unrealizedPnlPercent: null,
      totalIncomplete: false,
      hasStalePrices: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.accounts = [...state.accounts, created];
    syncDashboardAccounts();
    return created;
  };

  return {
    getDashboard: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getDashboard");
      return state.dashboard;
    },
    getSettings: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getSettings");
      return state.settings;
    },
    updateSettings: async (input: UpdateSettingsInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("updateSettings");
      const currency = state.settings.currencies.find(
        (option) => option.assetId === input.reportingCurrencyAssetId,
      );
      if (currency === undefined) {
        throw new PortfolioFailure("validation", "Unknown reporting currency");
      }
      return applySettings({
        ...state.settings,
        reportingCurrency: { assetId: currency.assetId, iso: currency.iso },
      });
    },
    listAssets: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("listAssets");
      return state.assets;
    },
    getAsset: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getAsset");
      return requireAsset(id);
    },
    updateAsset: async (id, input: MaintainAssetInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("updateAsset");
      const current = requireAsset(id);
      const symbol = input.symbol?.trim() ? input.symbol.trim() : null;
      const price =
        input.manualPrice === undefined
          ? current.price
          : {
              price: canonicalDecimal(input.manualPrice.price),
              currencyAssetId: input.manualPrice.currencyAssetId,
              currencyIso: currencyIso(input.manualPrice.currencyAssetId),
              source: "manual",
              observedAt: input.manualPrice.observedAt ?? nowIso(),
              updatedAt: nowIso(),
              isStale: false,
            };
      const next: Asset = {
        ...current,
        name: input.name,
        symbol,
        price,
        updatedAt: nowIso(),
      };
      state.assets = state.assets.map((asset) => (asset.id === id ? next : asset));
      for (const account of state.accounts) {
        replaceAccount({
          ...account,
          positions: account.positions.map((position) =>
            position.assetId === id
              ? revaluePosition(
                  {
                    ...position,
                    assetName: next.name,
                    assetSymbol: next.symbol,
                  },
                  account.baseCurrencyAssetId,
                  { price: next.price },
                )
              : position,
          ),
        });
      }
      return next;
    },
    deleteAsset: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("deleteAsset");
      requireAsset(id);
      state.assets = state.assets.filter((asset) => asset.id !== id);
      for (const account of state.accounts) {
        replaceAccount({
          ...account,
          positions: account.positions.filter((position) => position.assetId !== id),
        });
      }
      state.positionEdits = state.positionEdits.filter((edit) => edit.position.assetId !== id);
    },
    getAccount: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getAccount");
      return requireAccount(id);
    },
    updateAccount: async (id, input: UpdateAccountInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("updateAccount");
      const current = requireAccount(id);
      return replaceAccount({
        ...current,
        name: input.name,
        baseCurrencyAssetId: input.baseCurrencyAssetId,
        baseCurrencyIso: currencyIso(input.baseCurrencyAssetId),
        updatedAt: nowIso(),
      });
    },
    deleteAccount: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("deleteAccount");
      requireAccount(id);
      state.accounts = state.accounts.filter((account) => account.id !== id);
      state.positionEdits = state.positionEdits.filter((edit) => edit.account.id !== id);
      state.connections = state.connections.map((connection) => ({
        ...connection,
        accounts: connection.accounts.filter((summary) => summary.id !== id),
      }));
      state.dashboard = {
        ...state.dashboard,
        accounts: state.dashboard.accounts.filter((row) => row.accountId !== id),
      };
    },
    getPositionEdit: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getPositionEdit");
      return requirePositionEdit(id);
    },
    updatePosition: async (id, input, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("updatePosition");
      const edit = requirePositionEdit(id);
      const account = requireAccount(edit.account.id);
      if (input.quantity !== undefined && account.connectionId !== null) {
        throw new PortfolioFailure("read_only", "Connected quantities are read-only");
      }
      if (input.averageUnitPurchasePrice != null && edit.position.assetCategory === "cash") {
        throw new PortfolioFailure(
          "validation",
          "Cash positions cannot have an average unit purchase price",
        );
      }
      const positions = account.positions.map((position) =>
        position.id === id
          ? revaluePosition(position, account.baseCurrencyAssetId, {
              quantity: input.quantity ?? position.quantity,
              averageUnitPurchasePrice: (() => {
                if (input.averageUnitPurchasePrice === undefined) {
                  return position.averageUnitPurchasePrice;
                }
                if (input.averageUnitPurchasePrice === null) {
                  return state.providerAverages.get(position.id) ?? null;
                }
                return {
                  ...input.averageUnitPurchasePrice,
                  price: canonicalDecimal(input.averageUnitPurchasePrice.price),
                  currencyIso: currencyIso(input.averageUnitPurchasePrice.currencyAssetId),
                  source: "manual" as const,
                };
              })(),
            })
          : position,
      );
      return replaceAccount({ ...account, positions, updatedAt: nowIso() });
    },
    deletePosition: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("deletePosition");
      const edit = requirePositionEdit(id);
      const account = requireAccount(edit.account.id);
      replaceAccount({
        ...account,
        positions: account.positions.filter((position) => position.id !== id),
        updatedAt: nowIso(),
      });
      state.positionEdits = state.positionEdits.filter((candidate) => candidate.position.id !== id);
    },
    listConnections: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("listConnections");
      return state.connections;
    },
    getConnection: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getConnection");
      return requireConnection(id);
    },
    updateConnection: async (id, input: UpdateConnectionInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("updateConnection");
      const current = requireConnection(id);
      const next: Connection = { ...current, name: input.name, updatedAt: nowIso() };
      state.connections = state.connections.map((connection) =>
        connection.id === id ? next : connection,
      );
      state.accounts = state.accounts.map((account) =>
        account.connectionId === id ? { ...account, connectionName: next.name } : account,
      );
      state.positionEdits = state.positionEdits.map((edit) =>
        edit.account.connectionId === id
          ? { ...edit, account: { ...edit.account, connectionName: next.name } }
          : edit,
      );
      state.dashboard = {
        ...state.dashboard,
        accounts: state.dashboard.accounts.map((row) =>
          row.connectionId === id ? { ...row, connectionName: next.name } : row,
        ),
      };
      return next;
    },
    deleteConnection: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("deleteConnection");
      requireConnection(id);
      const removedAccountIds = new Set(
        state.accounts
          .filter((account) => account.connectionId === id)
          .map((account) => account.id),
      );
      state.connections = state.connections.filter((connection) => connection.id !== id);
      state.accounts = state.accounts.filter((account) => account.connectionId !== id);
      state.positionEdits = state.positionEdits.filter(
        (edit) => !removedAccountIds.has(edit.account.id),
      );
      state.dashboard = {
        ...state.dashboard,
        accounts: state.dashboard.accounts.filter((row) => row.connectionId !== id),
      };
    },
    refreshConnection: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("refreshConnection");
      const connection = requireConnection(id);
      if (state.refreshResult !== undefined) {
        const result = clone(state.refreshResult);
        state.connections = state.connections.map((candidate) =>
          candidate.id === id ? result.connection : candidate,
        );
        return result;
      }
      return { connection, failures: [] };
    },
    connectorCapabilities: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("connectorCapabilities");
      return state.capabilities;
    },
    listManualAccounts: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("listManualAccounts");
      return state.accounts.filter((account) => account.connectionId === null);
    },
    lookupManualHolding: async (_accountId, _identifierType, _identifierValue, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("lookupManualHolding");
      return state.holdingLookup;
    },
    searchAssets: async (_query, assetCategory, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("searchAssets");
      return state.searchResults.filter((result) => result.assetCategory === assetCategory);
    },
    connectConnection: async (input: ConnectConnectionInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("connectConnection");
      const connection: Connection = {
        id: `connection-${state.connections.length + 1}`,
        name: input.name,
        connectorId: input.connectorId,
        accounts: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.connections = [...state.connections, connection];
      return connection;
    },
    addManualHolding: async (input: AddManualHoldingInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("addManualHolding");
      const account = ensureAccountFromDestination(input.account);
      return addAssetsOutcome(account.name);
    },
    addCashAccount: async (input: AddCashAccountInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("addCashAccount");
      const account = ensureAccountFromDestination(input.account);
      return addAssetsOutcome(account.name);
    },
    addOtherAsset: async (input: AddOtherAssetInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("addOtherAsset");
      const account = ensureAccountFromDestination(input.account);
      return addAssetsOutcome(account.name);
    },
    seed: (next) => {
      if (next.dashboard !== undefined) state.dashboard = clone(next.dashboard);
      if (next.settings !== undefined) state.settings = clone(next.settings);
      if (next.projectDashboard !== undefined) state.projectDashboard = next.projectDashboard;
      if (next.connections !== undefined) state.connections = clone([...next.connections]);
      if (next.accounts !== undefined) {
        state.accounts = clone([...next.accounts]);
        state.providerAverages = providerAveragesFrom(state.accounts, state.positionEdits);
      }
      if (next.assets !== undefined) state.assets = clone([...next.assets]);
      if (next.positionEdits !== undefined) {
        state.positionEdits = clone([...next.positionEdits]);
        state.providerAverages = providerAveragesFrom(state.accounts, state.positionEdits);
      }
      if (next.capabilities !== undefined) state.capabilities = clone(next.capabilities);
      if (next.searchResults !== undefined) state.searchResults = clone([...next.searchResults]);
      if (next.holdingLookup !== undefined) state.holdingLookup = clone(next.holdingLookup);
      if (next.refreshResult !== undefined) state.refreshResult = clone(next.refreshResult);
      if (next.addAssetsResult !== undefined) state.addAssetsResult = clone(next.addAssetsResult);
    },
    reset: () => {
      state = cloneState(defaults);
      failure = null;
      failedOperations = null;
    },
    fail: (error, operations) => {
      failure = error;
      failedOperations = error === null || operations === undefined ? null : new Set(operations);
    },
  };
};
