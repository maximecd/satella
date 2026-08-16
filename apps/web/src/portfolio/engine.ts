import type {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  AssetSearchResult,
  ConnectConnectionInput,
  Connection,
  ConnectionRefreshResult,
  ConnectorCapability,
  Dashboard,
  MaintainAssetInput,
  ManualHoldingLookup,
  PositionEdit,
  Settings,
  UpdateAccountInput,
  UpdateConnectionInput,
  UpdateSettingsInput,
} from "@optimus/engine/api";

export type ConnectorCapabilities = {
  readonly connectors: ReadonlyArray<ConnectorCapability>;
};

export type SearchableAssetCategory = AssetSearchResult["assetCategory"];

export type PortfolioEngine = {
  readonly getDashboard: (signal?: AbortSignal) => Promise<Dashboard>;
  readonly getSettings: (signal?: AbortSignal) => Promise<Settings>;
  readonly updateSettings: (input: UpdateSettingsInput, signal?: AbortSignal) => Promise<Settings>;
  readonly listAssets: (signal?: AbortSignal) => Promise<ReadonlyArray<Asset>>;
  readonly getAsset: (id: string, signal?: AbortSignal) => Promise<Asset>;
  readonly updateAsset: (
    id: string,
    input: MaintainAssetInput,
    signal?: AbortSignal,
  ) => Promise<Asset>;
  readonly deleteAsset: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly getAccount: (id: string, signal?: AbortSignal) => Promise<Account>;
  readonly updateAccount: (
    id: string,
    input: UpdateAccountInput,
    signal?: AbortSignal,
  ) => Promise<Account>;
  readonly deleteAccount: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly getPositionEdit: (id: string, signal?: AbortSignal) => Promise<PositionEdit>;
  readonly updatePosition: (id: string, quantity: number, signal?: AbortSignal) => Promise<Account>;
  readonly deletePosition: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly listConnections: (signal?: AbortSignal) => Promise<ReadonlyArray<Connection>>;
  readonly getConnection: (id: string, signal?: AbortSignal) => Promise<Connection>;
  readonly updateConnection: (
    id: string,
    input: UpdateConnectionInput,
    signal?: AbortSignal,
  ) => Promise<Connection>;
  readonly deleteConnection: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly refreshConnection: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<ConnectionRefreshResult>;
  readonly connectorCapabilities: (signal?: AbortSignal) => Promise<ConnectorCapabilities>;
  readonly listManualAccounts: (signal?: AbortSignal) => Promise<ReadonlyArray<Account>>;
  readonly lookupManualHolding: (
    accountId: string,
    identifierType: string,
    identifierValue: string,
    signal?: AbortSignal,
  ) => Promise<ManualHoldingLookup>;
  readonly searchAssets: (
    query: string,
    assetCategory: SearchableAssetCategory,
    signal?: AbortSignal,
  ) => Promise<ReadonlyArray<AssetSearchResult>>;
  readonly connectConnection: (
    input: ConnectConnectionInput,
    signal?: AbortSignal,
  ) => Promise<Connection>;
  readonly addManualHolding: (
    input: AddManualHoldingInput,
    signal?: AbortSignal,
  ) => Promise<AddAssetsResult>;
  readonly addCashAccount: (
    input: AddCashAccountInput,
    signal?: AbortSignal,
  ) => Promise<AddAssetsResult>;
  readonly addOtherAsset: (
    input: AddOtherAssetInput,
    signal?: AbortSignal,
  ) => Promise<AddAssetsResult>;
};

export type PortfolioEngineOperation = keyof PortfolioEngine;
