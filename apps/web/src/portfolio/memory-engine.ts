import type {
  Account,
  AverageUnitPurchasePrice,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  AssetSearchResult,
  ConnectCustodianInput,
  Custodian,
  CustodianRefreshResult,
  Dashboard,
  DashboardCustodianGroup,
  MaintainAssetInput,
  ManualHoldingLookup,
  Position,
  PositionEdit,
  Settings,
  UpdateAccountInput,
  UpdateCustodianInput,
  UpdateSettingsInput,
} from "@satella-app/engine/api";

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
  readonly custodians?: ReadonlyArray<Custodian>;
  readonly accounts?: ReadonlyArray<Account>;
  readonly assets?: ReadonlyArray<Asset>;
  readonly positionEdits?: ReadonlyArray<PositionEdit>;
  readonly capabilities?: ConnectorCapabilities;
  readonly searchResults?: ReadonlyArray<AssetSearchResult>;
  readonly holdingLookup?: ManualHoldingLookup;
  readonly refreshResult?: CustodianRefreshResult;
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
  custodians: [],
  custodianAllocation: [],
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
  language: "en",
};

const defaultCapabilities: ConnectorCapabilities = { connectors: [] };
const defaultHoldingLookup: ManualHoldingLookup = { assetId: null, quantity: null };

const clone = <T>(value: T): T => structuredClone(value);

const isSyncedAccount = (account: { readonly connectorAccountId: string | null }) =>
  account.connectorAccountId !== null;

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
      position.averageUnitPurchasePrice?.source === "synced"
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

const editAccountFrom = (account: Account): PositionEdit["account"] => ({
  id: account.id,
  name: account.name,
  custodianId: account.custodianId,
  custodianName: account.custodianName,
  isDefaultCustodian: account.isDefaultCustodian,
  accountType: account.accountType,
  connectorAccountId: account.connectorAccountId,
  baseCurrencyAssetId: account.baseCurrencyAssetId,
  baseCurrencyIso: account.baseCurrencyIso,
});

export const createMemoryPortfolioEngine = (
  seed: MemoryPortfolioSeed = {},
): MemoryPortfolioEngine => {
  type MemoryState = {
    dashboard: Dashboard;
    settings: Settings;
    projectDashboard: DashboardProjection | undefined;
    custodians: Custodian[];
    accounts: Account[];
    assets: Asset[];
    positionEdits: PositionEdit[];
    capabilities: ConnectorCapabilities;
    searchResults: AssetSearchResult[];
    holdingLookup: ManualHoldingLookup;
    refreshResult: CustodianRefreshResult | undefined;
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
      custodians: clone([...(next.custodians ?? [])]),
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
    custodians: clone(value.custodians),
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

  const requireCustodian = (id: string) => {
    const custodian = state.custodians.find((candidate) => candidate.id === id);
    if (custodian === undefined) throw notFound("Custodian");
    return custodian;
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

  const dashboardRow = (account: Account) => ({
    accountId: account.id,
    accountName: account.name,
    accountType: account.accountType,
    positionCount: account.positions.filter(
      (position) => compareDecimal(position.quantity, "0") !== 0,
    ).length,
    total: account.total,
    unrealizedPnl: account.unrealizedPnl,
    unrealizedPnlPercent: account.unrealizedPnlPercent,
    totalIncomplete: account.totalIncomplete,
  });

  const syncDashboardCustodians = () => {
    const byCustodian = Map.groupBy(state.accounts, (account) => account.custodianId);
    const custodians: DashboardCustodianGroup[] = [...byCustodian].flatMap(
      ([custodianId, accounts]) => {
        const first = accounts[0]!;
        const meaningful =
          !first.isDefaultCustodian ||
          accounts.some((account) =>
            account.positions.some((position) => compareDecimal(position.quantity, "0") !== 0),
          );
        if (!meaningful) return [];
        const custodian = state.custodians.find((candidate) => candidate.id === custodianId);
        return [
          {
            custodianId,
            name: first.custodianName,
            isDefault: first.isDefaultCustodian,
            connectorId: custodian?.connectorId ?? null,
            accounts: accounts.map(dashboardRow),
          },
        ];
      },
    );
    state.dashboard = { ...state.dashboard, custodians };
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
        account: editAccountFrom(account),
      };
    });
    state.custodians = state.custodians.map((custodian) => {
      if (account.custodianId !== custodian.id) return custodian;
      return {
        ...custodian,
        accounts: custodian.accounts.map((summary) =>
          summary.id === account.id
            ? {
                ...summary,
                name: account.name,
                accountType: account.accountType,
                baseCurrencyIso: account.baseCurrencyIso,
                positionCount: account.positions.filter(
                  (position) => compareDecimal(position.quantity, "0") !== 0,
                ).length,
              }
            : summary,
        ),
      };
    });
    syncDashboardCustodians();
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

  const ensureCustodian = (input: AddManualHoldingInput["custodian"]) => {
    if (input.type === "existing") return requireCustodian(input.id);
    const created: Custodian = {
      id: `custodian-${state.custodians.length + 1}`,
      name: input.name,
      connectorId: null,
      isDefault: false,
      accounts: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.custodians = [...state.custodians, created];
    return created;
  };

  const createManualAccount = (
    custodian: Custodian,
    name: string,
    accountType: Account["accountType"],
    baseCurrencyAssetId: string,
  ): Account => {
    const created: Account = {
      id: `account-${state.accounts.length + 1}`,
      custodianId: custodian.id,
      custodianName: custodian.name,
      isDefaultCustodian: custodian.isDefault,
      accountType,
      name,
      baseCurrencyAssetId,
      baseCurrencyIso: currencyIso(baseCurrencyAssetId),
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
    state.custodians = state.custodians.map((candidate) =>
      candidate.id === custodian.id
        ? {
            ...candidate,
            accounts: [
              ...candidate.accounts,
              {
                id: created.id,
                name: created.name,
                accountType: created.accountType,
                baseCurrencyIso: created.baseCurrencyIso,
                connectorAccountId: null,
                positionCount: 0,
              },
            ],
          }
        : candidate,
    );
    syncDashboardCustodians();
    return created;
  };

  const ensureHoldingAccount = (
    custodian: Custodian,
    input: AddManualHoldingInput["account"],
  ): Account => {
    if (input.type === "existing") return requireAccount(input.id);
    return createManualAccount(
      custodian,
      input.name,
      input.accountType,
      input.baseCurrencyAssetId ?? "fiat:USD",
    );
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
      let reportingCurrency = state.settings.reportingCurrency;
      if (input.reportingCurrencyAssetId !== undefined) {
        const currency = state.settings.currencies.find(
          (option) => option.assetId === input.reportingCurrencyAssetId,
        );
        if (currency === undefined) {
          throw new PortfolioFailure("validation", "Unknown reporting currency");
        }
        reportingCurrency = { assetId: currency.assetId, iso: currency.iso };
      }
      return applySettings({
        ...state.settings,
        reportingCurrency,
        language: input.language ?? state.settings.language,
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
      state.custodians = state.custodians.map((custodian) => ({
        ...custodian,
        accounts: custodian.accounts.filter((summary) => summary.id !== id),
      }));
      syncDashboardCustodians();
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
      if (input.quantity !== undefined && isSyncedAccount(account)) {
        throw new PortfolioFailure("read_only", "Accounts under synced custodians are read-only");
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
    listCustodians: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("listCustodians");
      return state.custodians;
    },
    getCustodian: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("getCustodian");
      return requireCustodian(id);
    },
    updateCustodian: async (id, input: UpdateCustodianInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("updateCustodian");
      const current = requireCustodian(id);
      const next: Custodian = { ...current, name: input.name, updatedAt: nowIso() };
      state.custodians = state.custodians.map((custodian) =>
        custodian.id === id ? next : custodian,
      );
      state.accounts = state.accounts.map((account) =>
        account.custodianId === id ? { ...account, custodianName: next.name } : account,
      );
      state.positionEdits = state.positionEdits.map((edit) =>
        edit.account.custodianId === id
          ? { ...edit, account: { ...edit.account, custodianName: next.name } }
          : edit,
      );
      syncDashboardCustodians();
      return next;
    },
    deleteCustodian: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("deleteCustodian");
      const custodian = requireCustodian(id);
      if (custodian.isDefault) {
        throw new PortfolioFailure("validation", "The default manual custodian cannot be deleted");
      }
      if (custodian.connectorId === null && custodian.accounts.length > 0) {
        throw new PortfolioFailure(
          "validation",
          "Delete this custodian's accounts before deleting the custodian",
        );
      }
      const removedAccountIds = new Set(
        state.accounts.filter((account) => account.custodianId === id).map((account) => account.id),
      );
      state.custodians = state.custodians.filter((candidate) => candidate.id !== id);
      state.accounts = state.accounts.filter((account) => account.custodianId !== id);
      state.positionEdits = state.positionEdits.filter(
        (edit) => !removedAccountIds.has(edit.account.id),
      );
      syncDashboardCustodians();
    },
    refreshCustodian: async (id, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("refreshCustodian");
      const custodian = requireCustodian(id);
      if (state.refreshResult !== undefined) {
        const result = clone(state.refreshResult);
        state.custodians = state.custodians.map((candidate) =>
          candidate.id === id ? result.custodian : candidate,
        );
        return result;
      }
      return { custodian, failures: [] };
    },
    connectorCapabilities: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("connectorCapabilities");
      return state.capabilities;
    },
    listManualAccounts: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("listManualAccounts");
      return state.accounts.filter(
        (account) => !isSyncedAccount(account) && !account.isDefaultCustodian,
      );
    },
    listManualCustodians: async (signal) => {
      throwIfAborted(signal);
      rejectIfFailed("listManualCustodians");
      return state.custodians.filter(
        (custodian) => custodian.connectorId === null && !custodian.isDefault,
      );
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
    connectCustodian: async (input: ConnectCustodianInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("connectCustodian");
      const custodian: Custodian = {
        id: `custodian-${state.custodians.length + 1}`,
        name: input.name,
        connectorId: input.connectorId,
        isDefault: false,
        accounts: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.custodians = [...state.custodians, custodian];
      return custodian;
    },
    addManualHolding: async (input: AddManualHoldingInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("addManualHolding");
      const custodian = ensureCustodian(input.custodian);
      const account = ensureHoldingAccount(custodian, input.account);
      return addAssetsOutcome(account.name);
    },
    addCashAccount: async (input: AddCashAccountInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("addCashAccount");
      const custodian = ensureCustodian(input.custodian);
      const account = createManualAccount(
        custodian,
        input.name,
        input.accountType,
        input.currencyAssetId,
      );
      return addAssetsOutcome(account.name);
    },
    addOtherAsset: async (input: AddOtherAssetInput, signal) => {
      throwIfAborted(signal);
      rejectIfFailed("addOtherAsset");
      return addAssetsOutcome(input.name);
    },
    seed: (next) => {
      if (next.dashboard !== undefined) state.dashboard = clone(next.dashboard);
      if (next.settings !== undefined) state.settings = clone(next.settings);
      if (next.projectDashboard !== undefined) state.projectDashboard = next.projectDashboard;
      if (next.custodians !== undefined) state.custodians = clone([...next.custodians]);
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
