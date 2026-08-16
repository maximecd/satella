import {
  Box,
  Button,
  Heading,
  IconButton,
  Image,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { AssetSearchResult, ConnectorCapability } from "@optimus/engine/api";
import { NumberFromNonEmptyString } from "@optimus/engine/api";
import { ConnectConnectionInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { ChevronLeft, Search, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { ADD_ASSETS_CATEGORIES, categoryMeta, type AddAssetsCategory } from "../add-assets";
import { FormError, FormFrame, PageState } from "../components";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { Field } from "../components/ui/field";
import { InputGroup } from "../components/ui/input-group";
import { PasswordInput } from "../components/ui/password-input";
import { notify } from "../components/ui/toaster";
import {
  useAddCashAccount,
  useAddManualHolding,
  useAddOtherAsset,
  useAssetSearch,
  useAssets,
  useConnectConnection,
  useConnections,
  useConnectorCapabilities,
  useManualAccounts,
  useManualHoldingLookup,
} from "../portfolio";
import { SelectField } from "../select-field";
import { SetupInstructions } from "./setup-instructions";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const CREATE_NEW = "__new__";

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
  variant = "solid",
  start,
}: {
  readonly label?: string;
  readonly variant?: "solid" | "outline" | "ghost";
  readonly start?: AddAssetsStart;
}) {
  const { open } = useAddAssets();
  return (
    <Button
      colorPalette={variant === "solid" ? "blue" : undefined}
      variant={variant}
      onClick={() => open(start)}
    >
      {label}
    </Button>
  );
}

function AddAssetsDialog({
  start,
  onClose,
}: {
  readonly start: AddAssetsStart;
  readonly onClose: () => void;
}) {
  const capabilities = useConnectorCapabilities();
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
    const listed = capabilities.data ?? (await capabilities.refetch()).data;
    if (listed === undefined) return;
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
    <DialogRoot
      open
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="lg"
      scrollBehavior="inside"
    >
      <DialogContent aria-label="Add assets">
        <DialogHeader>
          <Stack direction="row" align="center" gap="2" w="full">
            <IconButton
              aria-label="Back"
              variant="ghost"
              onClick={back}
              disabled={!canGoBack}
              visibility={canGoBack ? "visible" : "hidden"}
            >
              <ChevronLeft />
            </IconButton>
            <DialogTitle flex="1" textAlign="center">
              Add assets
            </DialogTitle>
            <IconButton aria-label="Close" variant="ghost" onClick={onClose}>
              <X />
            </IconButton>
          </Stack>
        </DialogHeader>
        <DialogBody>
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
        </DialogBody>
        <DialogFooter p="0">
          <Box
            role="progressbar"
            aria-label="Form progress"
            aria-valuemin={0}
            aria-valuenow={progress.value}
            aria-valuemax={progress.max}
            bg="bg.muted"
            h="1.5"
            w="full"
          >
            <Box
              h="full"
              bg="blue.solid"
              width={`${progress.max === 0 ? 0 : (progress.value / progress.max) * 100}%`}
            />
          </Box>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function SearchInput({
  label,
  value,
  onChange,
  name,
  placeholder,
  errorText,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly name: string;
  readonly placeholder?: string | undefined;
  readonly errorText?: string | undefined;
}) {
  return (
    <Field label={label} invalid={errorText !== undefined} errorText={errorText}>
      <InputGroup
        startElement={<Search size={16} />}
        endElement={
          value.length > 0 ? (
            <IconButton aria-label="Clear" variant="ghost" size="xs" onClick={() => onChange("")}>
              <X />
            </IconButton>
          ) : undefined
        }
      >
        <Input
          name={name}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </InputGroup>
    </Field>
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
    <Stack gap="4">
      <SearchInput
        label="Search categories"
        value={search}
        onChange={setSearch}
        name="categorySearch"
      />
      {categories.length === 0 ? (
        <EmptyState title="No categories found" description="Try a different search." />
      ) : (
        <Stack gap="1" as="ul">
          <Text fontWeight="medium">Asset types</Text>
          {categories.map((category) => (
            <Box as="li" key={category.id} listStyle="none">
              <Button
                variant="ghost"
                width="full"
                height="auto"
                py="3"
                justifyContent="flex-start"
                onClick={() => onSelect(category.id)}
              >
                <Stack align="flex-start" gap="0.5">
                  <Text fontWeight="semibold">{category.label}</Text>
                  <Text color="fg.muted" fontSize="sm" whiteSpace="normal">
                    {category.description}
                  </Text>
                </Stack>
              </Button>
            </Box>
          ))}
        </Stack>
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
  const capabilities = useConnectorCapabilities();
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
    <Stack gap="4">
      {connectors.length > 0 && (
        <SearchInput
          label="Search connectors"
          value={search}
          onChange={setSearch}
          name="connectorSearch"
        />
      )}
      {connectors.length === 0 ? (
        <EmptyState
          title="No connectors for this category"
          description="Continue manually to add this asset type."
        >
          <Button colorPalette="blue" onClick={onManual}>
            Add manually
          </Button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No connectors found" description="Try a different connector name." />
      ) : (
        <Box as="section" aria-label="Available connectors">
          <SimpleGrid columns={{ base: 2, md: 3 }} gap="3">
            {filtered.map((connector) => (
              <Button
                key={connector.id}
                type="button"
                variant="outline"
                height="auto"
                py="5"
                aria-label={`Connect ${connector.name}`}
                onClick={() => onConnect(connector.id)}
              >
                <Stack align="center" gap="3">
                  {connector.icon === undefined ? (
                    <Heading as="h2" size="lg">
                      {connector.name.slice(0, 1)}
                    </Heading>
                  ) : (
                    <Image src={connector.icon} alt="" aria-hidden="true" boxSize="12" />
                  )}
                  <Text fontWeight="semibold">{connector.name}</Text>
                </Stack>
              </Button>
            ))}
          </SimpleGrid>
        </Box>
      )}
      <Stack gap="1">
        <Text fontWeight="medium">Or add manually</Text>
        <Button variant="ghost" height="auto" py="3" justifyContent="flex-start" onClick={onManual}>
          <Stack align="flex-start" gap="0.5">
            <Text fontWeight="semibold">Add manually</Text>
            <Text color="fg.muted" fontSize="sm" whiteSpace="normal">
              Enter this asset yourself instead of connecting a provider.
            </Text>
          </Stack>
        </Button>
      </Stack>
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
  const capabilities = useConnectorCapabilities();
  const listed = useConnections();
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
  const connect = useConnectConnection();
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
    try {
      const connection = await connect.mutateAsync(payload);
      notify.success(`Imported accounts from ${connection.name}.`);
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Stack gap="4">
      <Text as="p" color="fg.muted">
        Prefer read-only credentials with no trading or withdrawal capability whenever the Connector
        allows it.
      </Text>
      <SetupInstructions source={connector.instructions} />
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <Field label="Name" invalid={fieldErrors.name !== undefined} errorText={fieldErrors.name}>
          <Input
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
          />
        </Field>
        {connector.credentialFields.map((field) => {
          const fieldError = fieldErrors[field.key];
          return field.kind === "select" ? (
            <SelectField
              key={field.key}
              label={field.label}
              options={[...(field.options ?? [])]}
              value={credentials[field.key] ?? ""}
              onChange={(value) => {
                setCredentials((current) => ({ ...current, [field.key]: value }));
                clearFieldError(field.key);
              }}
              name={field.key}
              helperText={field.helpText}
              invalid={fieldError !== undefined}
              errorText={fieldError}
            />
          ) : (
            <Field
              key={field.key}
              label={field.label}
              helperText={field.helpText}
              invalid={fieldError !== undefined}
              errorText={fieldError}
            >
              {field.kind === "password" ? (
                <PasswordInput
                  name={field.key}
                  value={credentials[field.key] ?? ""}
                  onChange={(event) => {
                    setCredentials((current) => ({ ...current, [field.key]: event.target.value }));
                    clearFieldError(field.key);
                  }}
                />
              ) : (
                <Input
                  name={field.key}
                  value={credentials[field.key] ?? ""}
                  onChange={(event) => {
                    setCredentials((current) => ({ ...current, [field.key]: event.target.value }));
                    clearFieldError(field.key);
                  }}
                />
              )}
            </Field>
          );
        })}
        <Button
          type="submit"
          colorPalette="blue"
          disabled={connect.isPending}
          loading={connect.isPending}
        >
          Connect and import
        </Button>
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
  const accounts = useManualAccounts();
  const assets = useAssets();
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
        <SelectField
          label="Choose an account"
          options={picker.accountOptions}
          value={picker.accountChoice}
          onChange={(value) => {
            picker.setAccountChoice(value);
            const next = picker.listed.find((account) => account.id === value);
            if (next !== undefined) picker.setCurrencyId(next.baseCurrencyAssetId);
          }}
        />
      )}
      {picker.creatingAccount && (
        <Field
          label={picker.listed.length === 0 ? "Choose an account" : "Account name"}
          invalid={fieldErrors.accountName !== undefined}
          errorText={fieldErrors.accountName}
        >
          <Input
            name="accountName"
            value={picker.accountName}
            onChange={(event) => {
              picker.setAccountName(event.target.value);
              clearFieldError("accountName");
            }}
          />
        </Field>
      )}
      {picker.creatingAccount && (
        <SelectField
          label="Base currency"
          options={picker.cash.map((asset) => ({
            value: asset.id,
            label: asset.symbol ?? asset.name,
          }))}
          value={picker.currencyId}
          onChange={picker.setCurrencyId}
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
  const results = useAssetSearch(debounced, searchCategory);
  const identifier = selected?.identifiers[0];
  const lookup = useManualHoldingLookup(
    picker.creatingAccount ? "" : picker.accountChoice,
    identifier?.type ?? "",
    identifier?.value ?? "",
  );
  const existingQuantity = lookup.data?.quantity;
  useEffect(() => {
    if (existingQuantity !== undefined && existingQuantity !== null) {
      setQuantity(String(existingQuantity));
    }
  }, [existingQuantity]);
  const mutation = useAddManualHolding();
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
    try {
      const result = await mutation.mutateAsync({
        asset: {
          assetCategory: searchCategory,
          name: selected.name,
          symbol: selected.symbol,
          identifiers: [{ type: identifier.type, value: identifier.value }],
        },
        account: picker.destination(),
        quantity: decoded,
      });
      notify.success(
        result.positionOutcome === "updated"
          ? `Updated ${selected.name} quantity in ${result.accountName}.`
          : `Added ${selected.name} to ${result.accountName}.`,
      );
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Stack gap="4">
      <SearchInput
        label="Asset"
        value={query}
        onChange={(value) => {
          setQuery(value);
          clearFieldError("asset");
        }}
        name="assetSearch"
        placeholder="Search by name or exact symbol"
        errorText={fieldErrors.asset}
      />
      {selected !== null && (
        <Text fontWeight="semibold">
          {selected.name} · {selected.symbol}
        </Text>
      )}
      {results.isFetching && (
        <Text color="fg.muted" as="p" role="status">
          Searching…
        </Text>
      )}
      {results.isError && (
        <Text color="fg.muted" as="p" role="alert">
          Provider search is temporarily unavailable.
        </Text>
      )}
      {results.data && results.data.length > 0 && (
        <Stack gap="1">
          <Text fontWeight="medium">Matches</Text>
          {results.data.map((result) => {
            const match = result.identifiers[0];
            return (
              <Button
                key={`${result.provider}:${match?.value ?? result.symbol}`}
                variant="ghost"
                height="auto"
                py="2"
                justifyContent="flex-start"
                onClick={() => {
                  if (match === undefined) return;
                  setSelected(result);
                  setQuery("");
                  clearFieldError("asset");
                }}
              >
                <Stack align="flex-start" gap="0.5">
                  <Text fontWeight="semibold">
                    {result.name} · {result.symbol}
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    {`${result.provider} · ${result.assetCategory}`}
                  </Text>
                </Stack>
              </Button>
            );
          })}
        </Stack>
      )}
      {debounced.length > 0 && !results.isFetching && results.data?.length === 0 && (
        <EmptyState
          title="No provider matches found"
          description="Custom stocks and crypto are not available. Try a different symbol."
        />
      )}
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="4">
          <AccountFields
            picker={picker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <Field
            label="Quantity"
            invalid={fieldErrors.quantity !== undefined}
            errorText={fieldErrors.quantity}
          >
            <Input
              name="quantity"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                clearFieldError("quantity");
              }}
            />
          </Field>
          <Button
            type="submit"
            colorPalette="blue"
            disabled={mutation.isPending}
            loading={mutation.isPending}
          >
            {existingQuantity === undefined || existingQuantity === null
              ? "Add quantity"
              : "Update quantity"}
          </Button>
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
  const cash = useAddCashAccount();
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
    try {
      const result = await cash.mutateAsync({
        account: picker.destination(),
        currencyAssetId: picker.currencyId,
        balance: decoded,
      });
      notify.success(`Updated ${result.accountName}.`);
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Stack gap="4">
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="4">
          <AccountFields
            picker={picker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          {!picker.creatingAccount && (
            <SelectField
              label="Currency"
              options={picker.cash.map((asset) => ({
                value: asset.id,
                label: asset.symbol ?? asset.name,
              }))}
              value={picker.currencyId}
              onChange={picker.setCurrencyId}
            />
          )}
          <Field
            label="Balance"
            invalid={fieldErrors.balance !== undefined}
            errorText={fieldErrors.balance}
          >
            <Input
              name="balance"
              value={balance}
              onChange={(event) => {
                setBalance(event.target.value);
                clearFieldError("balance");
              }}
            />
          </Field>
          <Button
            type="submit"
            colorPalette="blue"
            loading={cash.isPending}
            disabled={cash.isPending}
          >
            Save cash
          </Button>
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
  const mutation = useAddOtherAsset();
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
      nextFieldErrors.value =
        value.trim() === "" ? "Current value is required." : "Enter a valid value.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || decoded === undefined) return;
    try {
      await mutation.mutateAsync({
        category:
          meta.assetCategory === "bonds" ||
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
      notify.success(`Added ${name.trim()}.`);
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Stack gap="4">
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="4">
          <Field
            label="Asset name"
            invalid={fieldErrors.name !== undefined}
            errorText={fieldErrors.name}
          >
            <Input
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearFieldError("name");
              }}
            />
          </Field>
          <AccountFields
            picker={picker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <Field
            label="Current value"
            invalid={fieldErrors.value !== undefined}
            errorText={fieldErrors.value}
          >
            <Input
              name="value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                clearFieldError("value");
              }}
            />
          </Field>
          <SelectField
            label="Currency"
            options={picker.cash.map((asset) => ({
              value: asset.id,
              label: asset.symbol ?? asset.name,
            }))}
            value={picker.currencyId}
            onChange={picker.setCurrencyId}
          />
          <Button
            type="submit"
            colorPalette="blue"
            loading={mutation.isPending}
            disabled={mutation.isPending}
          >
            Add asset
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
