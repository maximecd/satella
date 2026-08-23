import type {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  AssetSearchResult,
  ConnectCustodianInput,
  Custodian,
  CustodianRefreshResult,
  ConnectorCapability,
  Dashboard,
  MaintainAssetInput,
  ManualHoldingLookup,
  PositionEdit,
  Settings,
  SyncLogPage,
  UpdateAccountInput,
  UpdateCustodianInput,
  UpdatePositionInput,
  UpdateSettingsInput,
} from "@satella-app/engine/api";

export type ConnectorCapabilities = {
  readonly connectors: ReadonlyArray<ConnectorCapability>;
};

export type SearchableAssetCategory = AssetSearchResult["assetCategory"];

export type PortfolioEngine = {
  readonly getDashboard: (signal?: AbortSignal) => Promise<Dashboard>;
  readonly getSettings: (signal?: AbortSignal) => Promise<Settings>;
  readonly listSyncLog: (cursor?: string, signal?: AbortSignal) => Promise<SyncLogPage>;
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
  readonly updatePosition: (
    id: string,
    input: UpdatePositionInput,
    signal?: AbortSignal,
  ) => Promise<Account>;
  readonly deletePosition: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly listCustodians: (signal?: AbortSignal) => Promise<ReadonlyArray<Custodian>>;
  readonly getCustodian: (id: string, signal?: AbortSignal) => Promise<Custodian>;
  readonly updateCustodian: (
    id: string,
    input: UpdateCustodianInput,
    signal?: AbortSignal,
  ) => Promise<Custodian>;
  readonly deleteCustodian: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly refreshCustodian: (id: string, signal?: AbortSignal) => Promise<CustodianRefreshResult>;
  readonly connectorCapabilities: (signal?: AbortSignal) => Promise<ConnectorCapabilities>;
  readonly listManualAccounts: (signal?: AbortSignal) => Promise<ReadonlyArray<Account>>;
  readonly listManualCustodians: (signal?: AbortSignal) => Promise<ReadonlyArray<Custodian>>;
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
  readonly connectCustodian: (
    input: ConnectCustodianInput,
    signal?: AbortSignal,
  ) => Promise<Custodian>;
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
