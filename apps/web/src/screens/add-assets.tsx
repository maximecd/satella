import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Dialog } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssetSearchResult, ConnectorCapability } from "@optimus/engine/api";
import { NumberFromNonEmptyString } from "@optimus/engine/api";
import { ConnectConnectionInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  ADD_ASSETS_CATEGORIES,
  categoryMeta,
  invalidateFinanceQueries,
  type AddAssetsCategory,
} from "../add-assets";
import { engineApi } from "../api";
import { FormError, FormFrame, PageState } from "../components";
import {
  assetSearchQuery,
  assetsQuery,
  connectionsQuery,
  connectorCapabilitiesQuery,
  manualAccountsQuery,
  manualHoldingQuery,
} from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const CREATE_NEW = "__new__";

const connectorButtonStyle: CSSProperties = {
  appearance: "none",
  background: "var(--color-background-muted)",
  border: "var(--border-width) solid var(--color-border)",
  borderRadius: "var(--radius-element)",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  padding: "var(--spacing-5)",
};

const connectorIconStyle: CSSProperties = {
  aspectRatio: "1 / 1",
  display: "block",
  objectFit: "contain",
  width: "var(--spacing-12)",
};

type WizardStep = "category" | "connectors" | "connect" | "manual";

type Frame = {
  readonly step: WizardStep;
  readonly category: AddAssetsCategory | null;
  readonly connectorId: string | null;
};

export type AddAssetsStart = "category" | "other";

const categoryFrame = (): Frame => ({
  step: "category",
  category: null,
  connectorId: null,
});

const otherFrame = (): Frame => ({
  step: "manual",
  category: "other",
  connectorId: null,
});

const initialHistory = (start: AddAssetsStart): Frame[] =>
  start === "other" ? [categoryFrame(), otherFrame()] : [categoryFrame()];

const plannedSteps = (frame: Frame, history: ReadonlyArray<Frame>): WizardStep[] => {
  if (frame.step === "connectors" || frame.step === "connect") {
    return ["category", "connectors", "connect"];
  }
  if (frame.step === "manual" || frame.category !== null) {
    const viaConnectors = history.some((item) => item.step === "connectors");
    return viaConnectors ? ["category", "connectors", "manual"] : ["category", "manual"];
  }
  return ["category"];
};

const wizardProgress = (frame: Frame, history: ReadonlyArray<Frame>) => {
  if (frame.step === "category" || frame.category === null) {
    return { value: 0, max: 1 };
  }
  const steps = plannedSteps(frame, history);
  const index = steps.indexOf(frame.step);
  return { value: Math.max(0, index), max: steps.length };
};

const AddAssetsContext = createContext<{ open: (start?: AddAssetsStart) => void } | null>(null);

export function AddAssetsProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<{ start: AddAssetsStart } | null>(null);
  return (
    <AddAssetsContext.Provider value={{ open: (start = "category") => setSession({ start }) }}>
      {children}
      {session !== null && (
        <AddAssetsDialog start={session.start} onClose={() => setSession(null)} />
      )}
    </AddAssetsContext.Provider>
  );
}

export function useAddAssets() {
  const context = useContext(AddAssetsContext);
  if (context === null) {
    throw new Error("AddAssetsProvider is required");
  }
  return context;
}

export function AddAssetsButton({
  label = "Add assets",
  variant = "primary",
  start,
}: {
  readonly label?: string;
  readonly variant?: "primary" | "secondary" | "ghost";
  readonly start?: AddAssetsStart;
}) {
  const { open } = useAddAssets();
  return <Button label={label} variant={variant} onClick={() => open(start)} />;
}

function AddAssetsDialog({
  start,
  onClose,
}: {
  readonly start: AddAssetsStart;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const capabilities = useQuery(connectorCapabilitiesQuery);
  const [history, setHistory] = useState<Frame[]>(() => initialHistory(start));
  const current = history[history.length - 1] ?? categoryFrame();
  const go = (frame: Frame) => setHistory((frames) => [...frames, frame]);
  const back = () => {
    if (history.length <= 1) {
      onClose();
      return;
    }
    setHistory((frames) => frames.slice(0, -1));
  };
  const selectCategory = async (category: AddAssetsCategory) => {
    if (category === "other") {
      go(otherFrame());
      return;
    }
    const meta = categoryMeta(category);
    const listed =
      capabilities.data ?? (await queryClient.ensureQueryData(connectorCapabilitiesQuery));
    const hasConnector = listed.connectors.some((connector) =>
      connector.assetCategories.includes(meta.assetCategory),
    );
    go({
      step: hasConnector ? "connectors" : "manual",
      category,
      connectorId: null,
    });
  };
  const goManual = () => {
    if (current.category === null) return;
    go({
      step: "manual",
      category: current.category,
      connectorId: null,
    });
  };
  const progress = wizardProgress(current, history);
  const canGoBack = history.length > 1;
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose="info"
      width="min(100%, 36rem)"
      maxHeight="min(90vh, 48rem)"
      aria-label="Add assets"
    >
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Toolbar
              label="Add assets"
              startContent={
                <Button
                  label="Back"
                  variant="ghost"
                  isIconOnly
                  icon={<Icon icon="chevronLeft" />}
                  onClick={back}
                  tooltip="Back"
                  isDisabled={!canGoBack}
                  style={canGoBack ? undefined : { visibility: "hidden" }}
                />
              }
              centerContent={
                <Heading level={2} justify="center">
                  Add assets
                </Heading>
              }
              endContent={
                <Button
                  label="Close"
                  variant="ghost"
                  isIconOnly
                  icon={<Icon icon="close" color="inherit" />}
                  onClick={onClose}
                  tooltip="Close"
                />
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={6}>
            {current.step === "category" && (
              <CategoryStep onSelect={(id) => void selectCategory(id)} />
            )}
            {current.step === "connectors" && current.category !== null && (
              <ConnectorStep
                category={current.category}
                onConnect={(connectorId) =>
                  go({
                    step: "connect",
                    category: current.category,
                    connectorId,
                  })
                }
                onManual={goManual}
              />
            )}
            {current.step === "connect" &&
              current.category !== null &&
              current.connectorId !== null && (
                <ConnectStep
                  category={current.category}
                  connectorId={current.connectorId}
                  onComplete={onClose}
                />
              )}
            {current.step === "manual" && current.category !== null && (
              <ManualStep category={current.category} onComplete={onClose} />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={0}>
            <ProgressBar
              label="Form progress"
              isLabelHidden
              value={progress.value}
              max={progress.max}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

function CategoryStep({ onSelect }: { readonly onSelect: (category: AddAssetsCategory) => void }) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase();
  const categories = ADD_ASSETS_CATEGORIES.map((id) => ({ id, ...categoryMeta(id) })).filter(
    (category) =>
      needle.length === 0 ||
      `${category.label} ${category.description}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <Stack gap={4}>
      <TextInput
        label="Search categories"
        value={search}
        onChange={setSearch}
        htmlName="categorySearch"
        startIcon="search"
        hasClear
        width="100%"
      />
      {categories.length === 0 ? (
        <EmptyState title="No categories found" description="Try a different search." isCompact />
      ) : (
        <List density="balanced" hasDividers header="Asset types">
          {categories.map((category) => (
            <ListItem
              key={category.id}
              label={category.label}
              description={category.description}
              onClick={() => onSelect(category.id)}
            />
          ))}
        </List>
      )}
    </Stack>
  );
}

function ConnectorStep({
  category,
  onConnect,
  onManual,
}: {
  readonly category: AddAssetsCategory;
  readonly onConnect: (connectorId: string) => void;
  readonly onManual: () => void;
}) {
  const meta = categoryMeta(category);
  const capabilities = useQuery(connectorCapabilitiesQuery);
  const [search, setSearch] = useState("");
  if (capabilities.isPending) return <PageState kind="pending" />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  const connectors = capabilities.data.connectors.filter((connector) =>
    connector.assetCategories.includes(meta.assetCategory),
  );
  const needle = search.trim().toLocaleLowerCase();
  const filtered = connectors.filter((connector) =>
    `${connector.name} ${connector.id}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <Stack gap={4}>
      {connectors.length > 0 && (
        <TextInput
          label="Search connectors"
          value={search}
          onChange={setSearch}
          htmlName="connectorSearch"
          startIcon="search"
          hasClear
          width="100%"
        />
      )}
      {connectors.length === 0 ? (
        <EmptyState
          title="No connectors for this category"
          description="Continue manually to add this asset type."
          isCompact
          actions={<Button label="Add manually" variant="primary" onClick={onManual} />}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No connectors found"
          description="Try a different connector name."
          isCompact
        />
      ) : (
        <section aria-label="Available connectors">
          <Grid columns={3} gap={3}>
            {filtered.map((connector) => (
              <button
                key={connector.id}
                type="button"
                aria-label={`Connect ${connector.name}`}
                style={connectorButtonStyle}
                onClick={() => onConnect(connector.id)}
              >
                <Stack align="center" gap={3}>
                  {connector.icon === undefined ? (
                    <Heading level={2}>{connector.name.slice(0, 1)}</Heading>
                  ) : (
                    <img
                      src={connector.icon}
                      alt=""
                      aria-hidden="true"
                      style={connectorIconStyle}
                    />
                  )}
                  <Text weight="semibold">{connector.name}</Text>
                </Stack>
              </button>
            ))}
          </Grid>
        </section>
      )}
      <List density="balanced" hasDividers header="Or add manually">
        <ListItem
          label="Add manually"
          description="Enter this asset yourself instead of connecting a provider."
          onClick={onManual}
        />
      </List>
    </Stack>
  );
}

function ConnectStep({
  category,
  connectorId,
  onComplete,
}: {
  readonly category: AddAssetsCategory;
  readonly connectorId: string;
  readonly onComplete: () => void;
}) {
  const meta = categoryMeta(category);
  const capabilities = useQuery(connectorCapabilitiesQuery);
  const listed = useQuery(connectionsQuery);
  if (capabilities.isPending || listed.isPending) return <PageState kind="pending" />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  const connector = capabilities.data.connectors.find(({ id }) => id === connectorId);
  if (connector === undefined) {
    return <PageState kind="error" message="That connector is not available." />;
  }
  if (!connector.assetCategories.includes(meta.assetCategory)) {
    return <PageState kind="error" message="That connector is not available." />;
  }
  const existingCount = (listed.data ?? []).filter(
    (connection) => connection.connectorId === connector.id,
  ).length;
  const suggestedName =
    existingCount === 0 ? connector.name : `${connector.name} ${existingCount + 1}`;
  return (
    <ConnectorImportForm
      connector={connector}
      suggestedName={suggestedName}
      onComplete={onComplete}
    />
  );
}

function ConnectorImportForm({
  connector,
  suggestedName,
  onComplete,
}: {
  readonly connector: ConnectorCapability;
  readonly suggestedName: string;
  readonly onComplete: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(suggestedName);
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      connector.credentialFields.map((field) => [
        field.key,
        field.kind === "select" ? (field.options?.[0]?.value ?? "") : "",
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (key: string) => {
    setFieldErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const connect = useMutation({
    mutationFn: engineApi.connectConnection,
    onSuccess: async (connection) => {
      await invalidateFinanceQueries(queryClient);
      toast({ body: `Imported accounts from ${connection.name}.` });
      onComplete();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (name.trim() === "") nextFieldErrors.name = "Name is required.";
    for (const field of connector.credentialFields) {
      if (field.required && (credentials[field.key] ?? "").trim() === "") {
        nextFieldErrors[field.key] = `${field.label} is required.`;
      }
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;
    const payload = await Schema.decodeUnknownPromise(ConnectConnectionInput)({
      name: name.trim(),
      connectorId: connector.id,
      credentials,
    });
    await connect.mutateAsync(payload);
  };
  const instructions = connector.instructions?.replace(/^#\s+.*$/m, "").trim();
  return (
    <Stack gap={4}>
      {instructions !== undefined && instructions.length > 0 && (
        <Card padding={3}>
          <Collapsible trigger="Setup instructions" defaultIsOpen={false}>
            <Markdown headingLevelStart={3} contentWidth="100%" autolink="gfm">
              {instructions}
            </Markdown>
          </Collapsible>
        </Card>
      )}
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <TextInput
          label="Name"
          value={name}
          onChange={(value) => {
            setName(value);
            clearFieldError("name");
          }}
          htmlName="name"
          width="100%"
          isRequired
          statusVariant="detached"
          {...(fieldErrors.name === undefined
            ? {}
            : { status: { type: "error" as const, message: fieldErrors.name } })}
        />
        {connector.credentialFields.map((field) => {
          const fieldError = fieldErrors[field.key];
          return field.kind === "select" ? (
            <Selector
              key={field.key}
              label={field.label}
              options={[...(field.options ?? [])]}
              value={credentials[field.key] ?? ""}
              onChange={(value) => {
                setCredentials((current) => ({ ...current, [field.key]: value }));
                clearFieldError(field.key);
              }}
              htmlName={field.key}
              {...(field.helpText === undefined ? {} : { description: field.helpText })}
              width="100%"
              statusVariant="detached"
              {...(fieldError === undefined
                ? {}
                : { status: { type: "error" as const, message: fieldError } })}
            />
          ) : (
            <TextInput
              key={field.key}
              label={field.label}
              type={field.kind === "password" ? "password" : "text"}
              value={credentials[field.key] ?? ""}
              onChange={(value) => {
                setCredentials((current) => ({ ...current, [field.key]: value }));
                clearFieldError(field.key);
              }}
              htmlName={field.key}
              {...(field.helpText === undefined ? {} : { description: field.helpText })}
              width="100%"
              isRequired={field.required}
              statusVariant="detached"
              {...(fieldError === undefined
                ? {}
                : { status: { type: "error" as const, message: fieldError } })}
            />
          );
        })}
        <Button
          label="Connect and import"
          type="submit"
          variant="primary"
          isDisabled={connect.isPending}
          isLoading={connect.isPending}
        />
      </FormFrame>
    </Stack>
  );
}

function ManualStep({
  category,
  onComplete,
}: {
  readonly category: AddAssetsCategory;
  readonly onComplete: () => void;
}) {
  const meta = categoryMeta(category);
  if (meta.flow === "holdings") return <HoldingsForm category={category} onComplete={onComplete} />;
  if (meta.flow === "cash") return <CashForm onComplete={onComplete} />;
  return <GenericForm category={category} onComplete={onComplete} />;
}

function useManualAccountPicker() {
  const accounts = useQuery(manualAccountsQuery);
  const assets = useQuery(assetsQuery);
  const [accountChoice, setAccountChoice] = useState(CREATE_NEW);
  const [accountName, setAccountName] = useState("");
  const [currencyId, setCurrencyId] = useState("fiat:USD");
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || accounts.data === undefined) return;
    didInit.current = true;
    const first = accounts.data[0];
    if (first === undefined) return;
    setAccountChoice(first.id);
    setCurrencyId(first.baseCurrencyAssetId);
  }, [accounts.data]);
  const cash = assets.data?.filter((asset) => asset.assetCategory === "cash") ?? [];
  const listed = accounts.data ?? [];
  const creatingAccount = listed.length === 0 || accountChoice === CREATE_NEW;
  const accountOptions = [
    ...listed.map((account) => ({
      value: account.id,
      label: `${account.name} · ${account.baseCurrencyIso}`,
    })),
    { value: CREATE_NEW, label: "Create new" },
  ];
  const destination = () =>
    creatingAccount
      ? { type: "new" as const, name: accountName.trim(), baseCurrencyAssetId: currencyId }
      : { type: "existing" as const, id: accountChoice };
  return {
    accounts,
    assets,
    cash,
    listed,
    creatingAccount,
    accountChoice,
    setAccountChoice,
    accountName,
    setAccountName,
    currencyId,
    setCurrencyId,
    accountOptions,
    destination,
  };
}

function AccountFields({
  picker,
  fieldErrors,
  clearFieldError,
}: {
  readonly picker: ReturnType<typeof useManualAccountPicker>;
  readonly fieldErrors: Record<string, string>;
  readonly clearFieldError: (key: string) => void;
}) {
  return (
    <>
      {picker.listed.length > 0 && (
        <Selector
          label="Choose an account"
          options={picker.accountOptions}
          value={picker.accountChoice}
          onChange={(value) => {
            picker.setAccountChoice(value);
            const next = picker.listed.find((account) => account.id === value);
            if (next !== undefined) picker.setCurrencyId(next.baseCurrencyAssetId);
          }}
          width="100%"
        />
      )}
      {picker.creatingAccount && (
        <TextInput
          label={picker.listed.length === 0 ? "Choose an account" : "Account name"}
          value={picker.accountName}
          onChange={(value) => {
            picker.setAccountName(value);
            clearFieldError("accountName");
          }}
          htmlName="accountName"
          width="100%"
          statusVariant="detached"
          {...(fieldErrors.accountName === undefined
            ? {}
            : { status: { type: "error" as const, message: fieldErrors.accountName } })}
        />
      )}
      {picker.creatingAccount && (
        <Selector
          label="Base currency"
          options={picker.cash.map((asset) => ({
            value: asset.id,
            label: asset.symbol ?? asset.name,
          }))}
          value={picker.currencyId}
          onChange={picker.setCurrencyId}
          width="100%"
        />
      )}
    </>
  );
}

function HoldingsForm({
  category,
  onComplete,
}: {
  readonly category: AddAssetsCategory;
  readonly onComplete: () => void;
}) {
  const meta = categoryMeta(category);
  const picker = useManualAccountPicker();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<AssetSearchResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  const searchCategory = meta.assetCategory === "crypto" ? "crypto" : "stocks_etfs";
  const results = useQuery(assetSearchQuery(debounced, searchCategory));
  const identifier = selected?.identifiers[0];
  const lookup = useQuery(
    manualHoldingQuery(
      picker.creatingAccount ? "" : picker.accountChoice,
      identifier?.type ?? "",
      identifier?.value ?? "",
    ),
  );
  const existingQuantity = lookup.data?.quantity;
  useEffect(() => {
    if (existingQuantity !== undefined && existingQuantity !== null) {
      setQuantity(String(existingQuantity));
    }
  }, [existingQuantity]);
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: engineApi.addManualHolding,
    onSuccess: async (result) => {
      await invalidateFinanceQueries(queryClient);
      toast({
        body:
          result.positionOutcome === "updated"
            ? `Updated ${selected?.name ?? "holding"} quantity in ${result.accountName}.`
            : `Added ${selected?.name ?? "holding"} to ${result.accountName}.`,
      });
      onComplete();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  if (picker.accounts.isPending || picker.assets.isPending) return <PageState kind="pending" />;
  if (picker.accounts.isError)
    return <PageState kind="error" message={errorMessage(picker.accounts.error)} />;
  const clearFieldError = (key: string) => {
    setFieldErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (selected === null || identifier === undefined) {
      nextFieldErrors.asset = "Select an asset.";
    }
    if (picker.creatingAccount && picker.accountName.trim() === "") {
      nextFieldErrors.accountName = "Account name is required.";
    }
    const decoded = await Schema.decodeUnknownPromise(NumberFromNonEmptyString)(quantity).catch(
      () => undefined,
    );
    if (decoded === undefined) {
      nextFieldErrors.quantity =
        quantity.trim() === "" ? "Quantity is required." : "Enter a valid quantity.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || selected === null || identifier === undefined) {
      return;
    }
    if (decoded === undefined) return;
    await mutation.mutateAsync({
      asset: {
        assetCategory: searchCategory,
        name: selected.name,
        symbol: selected.symbol,
        identifiers: [{ type: identifier.type, value: identifier.value }],
      },
      account: picker.destination(),
      quantity: decoded,
    });
  };
  return (
    <Stack gap={4}>
      <TextInput
        label="Asset"
        value={query}
        onChange={(value) => {
          setQuery(value);
          clearFieldError("asset");
        }}
        placeholder="Search by name or exact symbol"
        htmlName="assetSearch"
        startIcon="search"
        hasClear
        width="100%"
        statusVariant="detached"
        {...(fieldErrors.asset === undefined
          ? {}
          : { status: { type: "error" as const, message: fieldErrors.asset } })}
      />
      {selected !== null && (
        <Text type="body" weight="semibold">
          {selected.name} · {selected.symbol}
        </Text>
      )}
      {results.isFetching && (
        <Text type="supporting" as="p" role="status">
          Searching…
        </Text>
      )}
      {results.isError && (
        <Text type="supporting" as="p" role="alert">
          Provider search is temporarily unavailable.
        </Text>
      )}
      {results.data && results.data.length > 0 && (
        <List density="compact" hasDividers header="Matches">
          {results.data.map((result) => {
            const match = result.identifiers[0];
            return (
              <ListItem
                key={`${result.provider}:${match?.value ?? result.symbol}`}
                label={`${result.name} · ${result.symbol}`}
                description={`${result.provider} · ${result.assetCategory}`}
                onClick={() => {
                  if (match === undefined) return;
                  setSelected(result);
                  setQuery("");
                  clearFieldError("asset");
                }}
              />
            );
          })}
        </List>
      )}
      {debounced.length > 0 && !results.isFetching && results.data?.length === 0 && (
        <EmptyState
          title="No provider matches found"
          description="Custom stocks and crypto are not available. Try a different symbol."
          isCompact
        />
      )}
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap={4}>
          <AccountFields
            picker={picker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <TextInput
            label="Quantity"
            value={quantity}
            onChange={(value) => {
              setQuantity(value);
              clearFieldError("quantity");
            }}
            htmlName="quantity"
            width="100%"
            statusVariant="detached"
            {...(fieldErrors.quantity === undefined
              ? {}
              : { status: { type: "error" as const, message: fieldErrors.quantity } })}
          />
          <Button
            label={
              existingQuantity === undefined || existingQuantity === null
                ? "Add quantity"
                : "Update quantity"
            }
            type="submit"
            variant="primary"
            isDisabled={mutation.isPending}
            isLoading={mutation.isPending}
          />
        </Stack>
      </form>
    </Stack>
  );
}

function CashForm({ onComplete }: { readonly onComplete: () => void }) {
  const picker = useManualAccountPicker();
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const cash = useMutation({
    mutationFn: engineApi.addCashAccount,
    onSuccess: async (result) => {
      await invalidateFinanceQueries(queryClient);
      toast({ body: `Updated ${result.accountName}.` });
      onComplete();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  if (picker.accounts.isPending || picker.assets.isPending) return <PageState kind="pending" />;
  if (picker.accounts.isError)
    return <PageState kind="error" message={errorMessage(picker.accounts.error)} />;
  const clearFieldError = (key: string) => {
    setFieldErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (picker.creatingAccount && picker.accountName.trim() === "") {
      nextFieldErrors.accountName = "Account name is required.";
    }
    const decoded = await Schema.decodeUnknownPromise(NumberFromNonEmptyString)(balance).catch(
      () => undefined,
    );
    if (decoded === undefined) {
      nextFieldErrors.balance =
        balance.trim() === "" ? "Balance is required." : "Enter a valid balance.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || decoded === undefined) return;
    await cash.mutateAsync({
      account: picker.destination(),
      currencyAssetId: picker.currencyId,
      balance: decoded,
    });
  };
  return (
    <Stack gap={4}>
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap={4}>
          <AccountFields
            picker={picker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          {!picker.creatingAccount && (
            <Selector
              label="Currency"
              options={picker.cash.map((asset) => ({
                value: asset.id,
                label: asset.symbol ?? asset.name,
              }))}
              value={picker.currencyId}
              onChange={picker.setCurrencyId}
              width="100%"
            />
          )}
          <TextInput
            label="Balance"
            value={balance}
            onChange={(value) => {
              setBalance(value);
              clearFieldError("balance");
            }}
            htmlName="balance"
            width="100%"
            statusVariant="detached"
            {...(fieldErrors.balance === undefined
              ? {}
              : { status: { type: "error" as const, message: fieldErrors.balance } })}
          />
          <Button
            label="Save cash"
            type="submit"
            variant="primary"
            isLoading={cash.isPending}
            isDisabled={cash.isPending}
          />
        </Stack>
      </form>
    </Stack>
  );
}

function GenericForm({
  category,
  onComplete,
}: {
  readonly category: AddAssetsCategory;
  readonly onComplete: () => void;
}) {
  const meta = categoryMeta(category);
  const picker = useManualAccountPicker();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: engineApi.addOtherAsset,
    onSuccess: async (_result, variables) => {
      await invalidateFinanceQueries(queryClient);
      toast({ body: `Added ${variables.name}.` });
      onComplete();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  if (picker.accounts.isPending || picker.assets.isPending) return <PageState kind="pending" />;
  if (picker.accounts.isError)
    return <PageState kind="error" message={errorMessage(picker.accounts.error)} />;
  const clearFieldError = (key: string) => {
    setFieldErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (name.trim() === "") nextFieldErrors.name = "Asset name is required.";
    if (picker.creatingAccount && picker.accountName.trim() === "") {
      nextFieldErrors.accountName = "Account name is required.";
    }
    const decoded = await Schema.decodeUnknownPromise(NumberFromNonEmptyString)(value).catch(
      () => undefined,
    );
    if (decoded === undefined) {
      nextFieldErrors.value = value.trim() === "" ? "Current value is required." : "Enter a valid value.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || decoded === undefined) return;
    await mutation.mutateAsync({
      category: meta.assetCategory === "bonds" ||
        meta.assetCategory === "derivatives" ||
        meta.assetCategory === "commodities" ||
        meta.assetCategory === "other"
        ? meta.assetCategory
        : "other",
      account: picker.destination(),
      name: name.trim(),
      value: decoded,
      currencyAssetId: picker.creatingAccount
        ? picker.currencyId
        : (picker.listed.find((account) => account.id === picker.accountChoice)
            ?.baseCurrencyAssetId ?? picker.currencyId),
    });
  };
  return (
    <Stack gap={4}>
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap={4}>
          <TextInput
            label="Asset name"
            value={name}
            onChange={(next) => {
              setName(next);
              clearFieldError("name");
            }}
            htmlName="name"
            width="100%"
            statusVariant="detached"
            {...(fieldErrors.name === undefined
              ? {}
              : { status: { type: "error" as const, message: fieldErrors.name } })}
          />
          <AccountFields
            picker={picker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <TextInput
            label="Current value"
            value={value}
            onChange={(next) => {
              setValue(next);
              clearFieldError("value");
            }}
            htmlName="value"
            width="100%"
            statusVariant="detached"
            {...(fieldErrors.value === undefined
              ? {}
              : { status: { type: "error" as const, message: fieldErrors.value } })}
          />
          <Selector
            label="Currency"
            options={picker.cash.map((asset) => ({
              value: asset.id,
              label: asset.symbol ?? asset.name,
            }))}
            value={picker.currencyId}
            onChange={picker.setCurrencyId}
            width="100%"
          />
          <Button
            label="Add asset"
            type="submit"
            variant="primary"
            isLoading={mutation.isPending}
            isDisabled={mutation.isPending}
          />
        </Stack>
      </form>
    </Stack>
  );
}
