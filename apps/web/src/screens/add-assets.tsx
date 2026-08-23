import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Image,
  Input,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import type {
  AddManualHoldingInput,
  AssetSearchResult,
  ConnectorAuthenticationAttempt,
  ConnectorCapability,
} from "@satella-app/engine/api";
import {
  ConnectCustodianInput,
  DecimalFromNonEmptyString,
  StartConnectorAuthenticationInput,
  SubmitConnectorAuthenticationInput,
} from "@satella-app/engine/api";
import * as Schema from "effect/Schema";
import { ChevronLeft, Search, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

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
  useConnectCustodian,
  useStartConnectorAuthentication,
  useSubmitConnectorAuthentication,
  useCancelConnectorAuthentication,
  useCustodians,
  useConnectorCapabilities,
  useManualAccounts,
  useManualCustodians,
  useManualHoldingLookup,
} from "../portfolio";
import { SelectField } from "../select-field";
import { compareDecimal } from "../financial-number";
import { SetupInstructions } from "./setup-instructions";
import { PinField } from "./pin-field";

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

const CREATE_NEW = "__new__";

const CUSTODIAN_LABEL_KEYS = {
  Bank: "addAssets.custodian.labels.Bank",
  Broker: "addAssets.custodian.labels.Broker",
  Exchange: "addAssets.custodian.labels.Exchange",
} as const;

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
  label,
  variant = "solid",
  start,
}: {
  readonly label?: string;
  readonly variant?: "solid" | "outline" | "ghost";
  readonly start?: AddAssetsStart;
}) {
  const { t } = useTranslation();
  const { open } = useAddAssets();
  return (
    <Button
      colorPalette={variant === "solid" ? "blue" : undefined}
      variant={variant}
      onClick={() => open(start)}
    >
      {label ?? t("addAssets.title")}
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
  const { t } = useTranslation();
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
    if (categoryMeta(category).skipConnectors) {
      go({
        step: "manual",
        category,
        connectorId: null,
      });
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
      <DialogContent aria-label={t("addAssets.dialogAriaLabel")}>
        <DialogHeader>
          <Stack direction="row" align="center" gap="2" w="full">
            <IconButton
              aria-label={t("addAssets.back")}
              variant="ghost"
              onClick={back}
              disabled={!canGoBack}
              visibility={canGoBack ? "visible" : "hidden"}
            >
              <Icon asChild>
                <ChevronLeft />
              </Icon>
            </IconButton>
            <DialogTitle flex="1" textAlign="center">
              {t("addAssets.title")}
            </DialogTitle>
            <IconButton aria-label={t("addAssets.close")} variant="ghost" onClick={onClose}>
              <Icon asChild>
                <X />
              </Icon>
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
          <Progress.Root
            value={progress.value}
            max={progress.max}
            size="xs"
            colorPalette="blue"
            translations={{ value: () => t("addAssets.progressAriaLabel") }}
            w="full"
          >
            <Progress.Track rounded="none">
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
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
  const { t } = useTranslation();
  return (
    <Field label={label} invalid={errorText !== undefined} errorText={errorText}>
      <InputGroup
        startElement={
          <Icon asChild>
            <Search />
          </Icon>
        }
        endElement={
          value.length > 0 ? (
            <IconButton
              aria-label={t("addAssets.clearSearch")}
              variant="ghost"
              size="xs"
              onClick={() => onChange("")}
            >
              <Icon asChild>
                <X />
              </Icon>
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
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase();
  const categories = ADD_ASSETS_CATEGORIES.map((id) => ({
    id,
    ...categoryMeta(id),
    label: t(`addAssets.categories.${id}.label`),
    description: t(`addAssets.categories.${id}.description`),
  })).filter(
    (category) =>
      needle.length === 0 ||
      `${category.label} ${category.description}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <Stack gap="4">
      <SearchInput
        label={t("addAssets.searchCategories")}
        value={search}
        onChange={setSearch}
        name="categorySearch"
      />
      {categories.length === 0 ? (
        <EmptyState
          title={t("addAssets.categoriesEmpty.title")}
          description={t("addAssets.categoriesEmpty.description")}
        />
      ) : (
        <Stack gap="1" as="ul">
          <Text fontWeight="medium">{t("addAssets.assetTypes")}</Text>
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
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
  const meta = categoryMeta(category);
  const capabilities = useConnectorCapabilities();
  const [search, setSearch] = useState("");
  if (capabilities.isPending) return <PageState kind="pending" />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error, requestFailed)} />;
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
          label={t("addAssets.connectors.search")}
          value={search}
          onChange={setSearch}
          name="connectorSearch"
        />
      )}
      {connectors.length === 0 ? (
        <EmptyState
          title={t("addAssets.connectors.noneForCategory.title")}
          description={t("addAssets.connectors.noneForCategory.description")}
        >
          <Button colorPalette="blue" onClick={onManual}>
            {t("addAssets.connectors.addManually")}
          </Button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("addAssets.connectors.noneFound.title")}
          description={t("addAssets.connectors.noneFound.description")}
        />
      ) : (
        <Box as="section" aria-label={t("addAssets.connectors.availableAriaLabel")}>
          <SimpleGrid columns={{ base: 2, md: 3 }} gap="3">
            {filtered.map((connector) => (
              <Button
                key={connector.id}
                type="button"
                variant="outline"
                height="auto"
                py="5"
                aria-label={t("addAssets.connectors.connectAriaLabel", { name: connector.name })}
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
        <Text fontWeight="medium">{t("addAssets.connectors.orAddManually")}</Text>
        <Button variant="ghost" height="auto" py="3" justifyContent="flex-start" onClick={onManual}>
          <Stack align="flex-start" gap="0.5">
            <Text fontWeight="semibold">{t("addAssets.connectors.addManually")}</Text>
            <Text color="fg.muted" fontSize="sm" whiteSpace="normal">
              {t("addAssets.connectors.manualDescription")}
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
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
  const meta = categoryMeta(category);
  const capabilities = useConnectorCapabilities();
  const listed = useCustodians();
  if (capabilities.isPending || listed.isPending) return <PageState kind="pending" />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error, requestFailed)} />;
  const connector = capabilities.data.connectors.find(({ id }) => id === connectorId);
  if (connector === undefined) {
    return <PageState kind="error" message={t("addAssets.connectors.unavailable")} />;
  }
  if (!connector.assetCategories.includes(meta.assetCategory)) {
    return <PageState kind="error" message={t("addAssets.connectors.unavailable")} />;
  }
  const existingCount = (listed.data ?? []).filter(
    (custodian) => custodian.connectorId === connector.id,
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
  if (connector.authenticationMode === "interactive") {
    return (
      <InteractiveConnectorImportForm
        connector={connector}
        suggestedName={suggestedName}
        onComplete={onComplete}
      />
    );
  }
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
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
  const connect = useConnectCustodian();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (name.trim() === "") nextFieldErrors.name = t("addAssets.connectors.nameRequired");
    for (const field of connector.credentialFields) {
      if (field.required && (credentials[field.key] ?? "").trim() === "") {
        nextFieldErrors[field.key] = t("addAssets.connectors.fieldRequired", {
          field: field.label,
        });
      }
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;
    const payload = await Schema.decodeUnknownPromise(ConnectCustodianInput)({
      name: name.trim(),
      connectorId: connector.id,
      credentials,
    });
    try {
      const custodian = await connect.mutateAsync(payload);
      notify.success(t("addAssets.connectors.importedAccounts", { name: custodian.name }));
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };
  return (
    <Stack gap="4">
      <Text as="p" color="fg.muted">
        {t("addAssets.connectors.readOnlyHint")}
      </Text>
      <SetupInstructions source={connector.instructions} />
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <Field
          label={t("addAssets.connectors.nameField")}
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
          {t("addAssets.connectors.connectAndImport")}
        </Button>
      </FormFrame>
    </Stack>
  );
}

export function InteractiveConnectorImportForm({
  connector,
  suggestedName,
  onComplete,
  existingCustodianId,
}: {
  readonly connector: ConnectorCapability;
  readonly suggestedName: string;
  readonly onComplete: () => void;
  readonly existingCustodianId?: string;
}) {
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
  const [name, setName] = useState(suggestedName);
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(connector.credentialFields.map((field) => [field.key, ""])),
  );
  const [attempt, setAttempt] = useState<ConnectorAuthenticationAttempt | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const start = useStartConnectorAuthentication();
  const submit = useSubmitConnectorAuthentication();
  const cancel = useCancelConnectorAuthentication();
  const cancelAuthenticationRequest = cancel.mutateAsync;

  useEffect(() => {
    if (attempt === null) return;
    const attemptId = attempt.attemptId;
    return () => {
      void cancelAuthenticationRequest(attemptId).catch(() => undefined);
    };
  }, [attempt, cancelAuthenticationRequest]);

  const clearFieldError = (key: string) => {
    setFieldErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const startAuthentication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (name.trim() === "") nextFieldErrors.name = t("addAssets.connectors.nameRequired");
    for (const field of connector.credentialFields) {
      if (field.required && (credentials[field.key] ?? "").trim() === "") {
        nextFieldErrors[field.key] = t("addAssets.connectors.fieldRequired", {
          field: field.label,
        });
      }
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;
    try {
      const payloadInput = {
        name: name.trim(),
        connectorId: connector.id,
        credentials,
      };
      if (existingCustodianId !== undefined)
        Object.assign(payloadInput, { custodianId: existingCustodianId });
      const payload = await Schema.decodeUnknownPromise(StartConnectorAuthenticationInput)(
        payloadInput,
      );
      const next = await start.mutateAsync(payload);
      setCredentials((current) => ({ ...current, pin: "" }));
      setAttempt(next);
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (code.length !== 4) {
      setError(t("addAssets.connectors.confirmationCodeInvalid"));
      return;
    }
    if (attempt === null) return;
    try {
      const payload = await Schema.decodeUnknownPromise(SubmitConnectorAuthenticationInput)({
        code,
      });
      const custodian = await submit.mutateAsync({ attemptId: attempt.attemptId, input: payload });
      notify.success(t("addAssets.connectors.importedAccounts", { name: custodian.name }));
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };

  const cancelAuthentication = async () => {
    if (attempt === null) return;
    try {
      await cancel.mutateAsync(attempt.attemptId);
      setAttempt(null);
      setCode("");
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };

  if (attempt !== null) {
    return (
      <Stack gap="4">
        <Text as="p" color="fg.muted">
          {attempt.challenge.prompt}
        </Text>
        <FormError message={error} />
        <FormFrame onSubmit={(event) => void submitCode(event)}>
          <PinField
            label={t("addAssets.connectors.confirmationCode")}
            value={code}
            onChange={setCode}
            htmlName="confirmationCode"
            invalid={error !== null}
            errorText={undefined}
            autoFocus
          />
          <Stack direction={{ base: "column", sm: "row" }} gap="2">
            <Button
              type="submit"
              colorPalette="blue"
              disabled={submit.isPending}
              loading={submit.isPending}
            >
              {t("addAssets.connectors.confirmAndImport")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void cancelAuthentication()}
              disabled={cancel.isPending || submit.isPending}
            >
              {t("addAssets.connectors.cancelAuthentication")}
            </Button>
          </Stack>
        </FormFrame>
      </Stack>
    );
  }

  return (
    <Stack gap="4">
      <Text as="p" color="fg.muted">
        {t("addAssets.connectors.interactiveHint")}
      </Text>
      <SetupInstructions source={connector.instructions} />
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void startAuthentication(event)}>
        <Field
          label={t("addAssets.connectors.nameField")}
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
        {connector.credentialFields.map((field) => {
          const fieldError = fieldErrors[field.key];
          return (
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
          disabled={start.isPending}
          loading={start.isPending}
        >
          {t("addAssets.connectors.startAuthentication")}
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
  if (meta.flow === "cash") return <CashForm category={category} onComplete={onComplete} />;
  return <GenericForm onComplete={onComplete} />;
}

function useCashAssets() {
  const assets = useAssets();
  const cash = assets.data?.filter((asset) => asset.assetCategory === "cash") ?? [];
  return { assets, cash };
}

function useManualCustodianPicker() {
  const { t } = useTranslation();
  const custodians = useManualCustodians();
  const [custodianChoiceOverride, setCustodianChoiceOverride] = useState<string>();
  const [custodianName, setCustodianName] = useState("");
  const listed = custodians.data ?? [];
  const first = listed[0];
  const custodianChoice = custodianChoiceOverride ?? first?.id ?? CREATE_NEW;
  const creatingCustodian = listed.length === 0 || custodianChoice === CREATE_NEW;
  const custodianOptions = [
    ...listed.map((custodian) => ({ value: custodian.id, label: custodian.name })),
    { value: CREATE_NEW, label: t("addAssets.createOption") },
  ];
  const destination = () =>
    creatingCustodian
      ? { type: "new" as const, name: custodianName.trim() }
      : { type: "existing" as const, id: custodianChoice };
  return {
    custodians,
    listed,
    creatingCustodian,
    custodianChoice,
    setCustodianChoice: setCustodianChoiceOverride,
    custodianName,
    setCustodianName,
    custodianOptions,
    destination,
    selectedId: creatingCustodian ? "" : custodianChoice,
  };
}

function CustodianFields({
  picker,
  label,
  fieldErrors,
  clearFieldError,
}: {
  readonly picker: ReturnType<typeof useManualCustodianPicker>;
  readonly label: string;
  readonly fieldErrors: Record<string, string>;
  readonly clearFieldError: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {picker.listed.length > 0 && (
        <SelectField
          label={t("addAssets.custodian.choose", { label: label.toLocaleLowerCase() })}
          options={picker.custodianOptions}
          value={picker.custodianChoice}
          onChange={picker.setCustodianChoice}
        />
      )}
      {picker.creatingCustodian && (
        <Field
          label={
            picker.listed.length === 0 ? label : t("addAssets.custodian.nameWithList", { label })
          }
          invalid={fieldErrors.custodianName !== undefined}
          errorText={fieldErrors.custodianName}
        >
          <Input
            name="custodianName"
            value={picker.custodianName}
            onChange={(event) => {
              picker.setCustodianName(event.target.value);
              clearFieldError("custodianName");
            }}
          />
        </Field>
      )}
    </>
  );
}

function useHoldingAccountPicker(custodianId: string, accountType: "brokerage" | "crypto_wallet") {
  const { t } = useTranslation();
  const accounts = useManualAccounts();
  const { assets, cash } = useCashAssets();
  const [accountChoiceOverride, setAccountChoiceOverride] = useState<string>();
  const [accountName, setAccountName] = useState("");
  const [currencyId, setCurrencyId] = useState("fiat:USD");
  const [scope, setScope] = useState(`${custodianId}:${accountType}`);
  const nextScope = `${custodianId}:${accountType}`;
  if (scope !== nextScope) {
    setScope(nextScope);
    setAccountChoiceOverride(undefined);
  }
  const listed = (accounts.data ?? []).filter(
    (account) => account.custodianId === custodianId && account.accountType === accountType,
  );
  const accountChoice = accountChoiceOverride ?? CREATE_NEW;
  const creatingAccount = listed.length === 0 || accountChoice === CREATE_NEW;
  const accountOptions = [
    ...listed.map((account) => ({
      value: account.id,
      label: `${account.name} · ${account.baseCurrencyIso}`,
    })),
    { value: CREATE_NEW, label: t("addAssets.createOption") },
  ];
  const destination = () =>
    creatingAccount
      ? {
          type: "new" as const,
          name: accountName.trim(),
          accountType,
          baseCurrencyAssetId: currencyId,
        }
      : { type: "existing" as const, id: accountChoice };
  return {
    accounts,
    assets,
    cash,
    listed,
    creatingAccount,
    accountChoice,
    setAccountChoice: setAccountChoiceOverride,
    accountName,
    setAccountName,
    currencyId,
    setCurrencyId,
    accountOptions,
    destination,
  };
}

function HoldingAccountFields({
  picker,
  fieldErrors,
  clearFieldError,
}: {
  readonly picker: ReturnType<typeof useHoldingAccountPicker>;
  readonly fieldErrors: Record<string, string>;
  readonly clearFieldError: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {picker.listed.length > 0 && (
        <SelectField
          label={t("addAssets.account.choose")}
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
          label={t("addAssets.account.nameField")}
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
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
  const meta = categoryMeta(category);
  const custodianPicker = useManualCustodianPicker();
  const accountPicker = useHoldingAccountPicker(
    custodianPicker.selectedId,
    meta.accountType === "crypto_wallet" ? "crypto_wallet" : "brokerage",
  );
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<AssetSearchResult | null>(null);
  const [quantityDraft, setQuantityDraft] = useState<{ key: string; value: string }>();
  const [averagePrice, setAveragePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  const searchCategory: "crypto" | "stocks_etfs" =
    meta.assetCategory === "crypto" ? "crypto" : "stocks_etfs";
  const results = useAssetSearch(debounced, searchCategory);
  const identifier = selected?.identifiers[0];
  const lookup = useManualHoldingLookup(
    accountPicker.creatingAccount ? "" : accountPicker.accountChoice,
    identifier?.type ?? "",
    identifier?.value ?? "",
  );
  const existingQuantity = lookup.data?.quantity;
  const holdingKey = JSON.stringify([
    accountPicker.creatingAccount ? "" : accountPicker.accountChoice,
    identifier?.type ?? "",
    identifier?.value ?? "",
  ]);
  const quantity =
    quantityDraft?.key === holdingKey
      ? quantityDraft.value
      : existingQuantity === undefined || existingQuantity === null
        ? ""
        : String(existingQuantity);
  const setQuantity = (value: string) => setQuantityDraft({ key: holdingKey, value });
  const mutation = useAddManualHolding();
  if (
    custodianPicker.custodians.isPending ||
    accountPicker.accounts.isPending ||
    accountPicker.assets.isPending
  )
    return <PageState kind="pending" />;
  if (custodianPicker.custodians.isError)
    return (
      <PageState
        kind="error"
        message={errorMessage(custodianPicker.custodians.error, requestFailed)}
      />
    );
  if (accountPicker.accounts.isError)
    return (
      <PageState kind="error" message={errorMessage(accountPicker.accounts.error, requestFailed)} />
    );
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
      nextFieldErrors.asset = t("addAssets.holdings.selectAssetRequired");
    }
    if (custodianPicker.creatingCustodian && custodianPicker.custodianName.trim() === "") {
      nextFieldErrors.custodianName = t("addAssets.custodian.nameRequired", {
        label: meta.custodianLabel ?? t("addAssets.custodian.fallbackLabel"),
      });
    }
    if (accountPicker.creatingAccount && accountPicker.accountName.trim() === "") {
      nextFieldErrors.accountName = t("addAssets.account.nameRequired");
    }
    const decoded = await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(quantity).catch(
      () => undefined,
    );
    if (decoded === undefined) {
      nextFieldErrors.quantity =
        quantity.trim() === ""
          ? t("addAssets.holdings.quantityRequired")
          : t("addAssets.holdings.quantityInvalid");
    }
    const decodedAverage =
      averagePrice.trim() === ""
        ? undefined
        : await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(averagePrice).catch(
            () => undefined,
          );
    if (averagePrice.trim() !== "" && decodedAverage === undefined) {
      nextFieldErrors.averagePrice = t("addAssets.holdings.averagePriceInvalid");
    } else if (decodedAverage !== undefined && compareDecimal(decodedAverage, "0") <= 0) {
      nextFieldErrors.averagePrice = t("addAssets.holdings.averagePricePositive");
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || selected === null || identifier === undefined) {
      return;
    }
    if (decoded === undefined) return;
    try {
      const input: AddManualHoldingInput = {
        asset: {
          assetCategory: searchCategory,
          name: selected.name,
          symbol: selected.symbol,
          identifiers: [{ type: identifier.type, value: identifier.value }],
        },
        custodian: custodianPicker.destination(),
        account: accountPicker.destination(),
        quantity: decoded,
      };
      if (decodedAverage !== undefined) {
        Object.assign(input, {
          averageUnitPurchasePrice: {
            price: decodedAverage,
            currencyAssetId: accountPicker.currencyId,
          },
        });
      }
      const result = await mutation.mutateAsync(input);
      notify.success(
        result.positionOutcome === "updated"
          ? t("addAssets.holdings.updatedToast", {
              name: selected.name,
              account: result.accountName,
            })
          : t("addAssets.holdings.addedToast", {
              name: selected.name,
              account: result.accountName,
            }),
      );
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };
  return (
    <Stack gap="4">
      <SearchInput
        label={t("addAssets.holdings.assetLabel")}
        value={query}
        onChange={(value) => {
          setQuery(value);
          clearFieldError("asset");
        }}
        name="assetSearch"
        placeholder={t("addAssets.holdings.assetPlaceholder")}
        errorText={fieldErrors.asset}
      />
      {selected !== null && (
        <Text fontWeight="semibold">
          {selected.name} · {selected.symbol}
        </Text>
      )}
      {results.isFetching && (
        <Text color="fg.muted" as="p" role="status">
          {t("addAssets.holdings.searching")}
        </Text>
      )}
      {results.isError && (
        <Text color="fg.muted" as="p" role="alert">
          {t("addAssets.holdings.providerUnavailable")}
        </Text>
      )}
      {results.data && results.data.length > 0 && (
        <Stack gap="1">
          <Text fontWeight="medium">{t("addAssets.holdings.matches")}</Text>
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
          title={t("addAssets.holdings.noMatches.title")}
          description={t("addAssets.holdings.noMatches.description")}
        />
      )}
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="4">
          <CustodianFields
            picker={custodianPicker}
            label={
              meta.custodianLabel === null
                ? t("addAssets.custodian.fallbackLabel")
                : // SAFETY: custodianLabel is one of the engine's Bank/Broker/Exchange literals.
                  t(CUSTODIAN_LABEL_KEYS[meta.custodianLabel as keyof typeof CUSTODIAN_LABEL_KEYS])
            }
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <HoldingAccountFields
            picker={accountPicker}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <Field
            label={t("addAssets.holdings.quantity")}
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
          <Field
            label={t("addAssets.holdings.averagePrice")}
            invalid={fieldErrors.averagePrice !== undefined}
            errorText={fieldErrors.averagePrice}
          >
            <Input
              name="averageUnitPurchasePrice"
              value={averagePrice}
              onChange={(event) => {
                setAveragePrice(event.target.value);
                clearFieldError("averagePrice");
              }}
            />
          </Field>
          <SelectField
            label={t("addAssets.holdings.purchaseCurrency")}
            options={accountPicker.cash.map((asset) => ({
              value: asset.id,
              label: asset.symbol ?? asset.name,
            }))}
            value={accountPicker.currencyId}
            onChange={accountPicker.setCurrencyId}
          />
          <Button
            type="submit"
            colorPalette="blue"
            disabled={mutation.isPending}
            loading={mutation.isPending}
          >
            {existingQuantity === undefined || existingQuantity === null
              ? t("addAssets.holdings.addQuantity")
              : t("addAssets.holdings.updateQuantity")}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}

function CashForm({
  category,
  onComplete,
}: {
  readonly category: AddAssetsCategory;
  readonly onComplete: () => void;
}) {
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
  const meta = categoryMeta(category);
  const custodianPicker = useManualCustodianPicker();
  const { assets, cash: currencies } = useCashAssets();
  const [accountName, setAccountName] = useState("");
  const [currencyId, setCurrencyId] = useState("fiat:USD");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const cash = useAddCashAccount();
  if (custodianPicker.custodians.isPending || assets.isPending) return <PageState kind="pending" />;
  if (custodianPicker.custodians.isError)
    return (
      <PageState
        kind="error"
        message={errorMessage(custodianPicker.custodians.error, requestFailed)}
      />
    );
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
    if (custodianPicker.creatingCustodian && custodianPicker.custodianName.trim() === "") {
      nextFieldErrors.custodianName = t("addAssets.cash.bankNameRequired");
    }
    if (accountName.trim() === "")
      nextFieldErrors.accountName = t("addAssets.account.nameRequired");
    const decoded = await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(balance).catch(
      () => undefined,
    );
    if (decoded === undefined) {
      nextFieldErrors.balance =
        balance.trim() === ""
          ? t("addAssets.cash.balanceRequired")
          : t("addAssets.cash.balanceInvalid");
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || decoded === undefined) return;
    try {
      const result = await cash.mutateAsync({
        accountType: meta.accountType === "savings" ? "savings" : "checking",
        custodian: custodianPicker.destination(),
        name: accountName.trim(),
        currencyAssetId: currencyId,
        balance: decoded,
      });
      notify.success(t("addAssets.cash.addedToast", { name: result.accountName }));
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };
  return (
    <Stack gap="4">
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="4">
          <CustodianFields
            picker={custodianPicker}
            label={t("addAssets.cash.bankLabel")}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />
          <Field
            label={t("addAssets.cash.accountName")}
            invalid={fieldErrors.accountName !== undefined}
            errorText={fieldErrors.accountName}
          >
            <Input
              name="accountName"
              value={accountName}
              onChange={(event) => {
                setAccountName(event.target.value);
                clearFieldError("accountName");
              }}
            />
          </Field>
          <SelectField
            label={t("addAssets.cash.currency")}
            options={currencies.map((asset) => ({
              value: asset.id,
              label: asset.symbol ?? asset.name,
            }))}
            value={currencyId}
            onChange={setCurrencyId}
          />
          <Field
            label={t("addAssets.cash.balance")}
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
            {t("addAssets.cash.save")}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}

function GenericForm({ onComplete }: { readonly onComplete: () => void }) {
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
  const { assets, cash } = useCashAssets();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [valueCurrencyId, setValueCurrencyId] = useState("fiat:USD");
  const [purchaseCurrencyId, setPurchaseCurrencyId] = useState("fiat:USD");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useAddOtherAsset();
  if (assets.isPending) return <PageState kind="pending" />;
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
    if (name.trim() === "") nextFieldErrors.name = t("addAssets.other.nameRequired");
    const decoded = await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(value).catch(
      () => undefined,
    );
    if (decoded === undefined) {
      nextFieldErrors.value =
        value.trim() === ""
          ? t("addAssets.other.valueRequired")
          : t("addAssets.other.valueInvalid");
    }
    const decodedAverage =
      averagePrice.trim() === ""
        ? undefined
        : await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(averagePrice).catch(
            () => undefined,
          );
    if (averagePrice.trim() !== "" && decodedAverage === undefined) {
      nextFieldErrors.averagePrice = t("addAssets.holdings.averagePriceInvalid");
    } else if (decodedAverage !== undefined && compareDecimal(decodedAverage, "0") <= 0) {
      nextFieldErrors.averagePrice = t("addAssets.holdings.averagePricePositive");
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || decoded === undefined) return;
    try {
      const input = {
        name: name.trim(),
        value: decoded,
        currencyAssetId: valueCurrencyId,
      };
      if (decodedAverage !== undefined) {
        Object.assign(input, {
          averageUnitPurchasePrice: {
            price: decodedAverage,
            currencyAssetId: purchaseCurrencyId,
          },
        });
      }
      await mutation.mutateAsync(input);
      notify.success(t("addAssets.other.addedToast", { name: name.trim() }));
      onComplete();
    } catch (cause) {
      setError(errorMessage(cause, requestFailed));
    }
  };
  return (
    <Stack gap="4">
      <FormError message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="4">
          <Field
            label={t("addAssets.other.nameField")}
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
          <Field
            label={t("addAssets.other.valueField")}
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
            label={t("addAssets.other.currency")}
            options={cash.map((asset) => ({
              value: asset.id,
              label: asset.symbol ?? asset.name,
            }))}
            value={valueCurrencyId}
            onChange={setValueCurrencyId}
          />
          <Field
            label={t("addAssets.other.averagePrice")}
            invalid={fieldErrors.averagePrice !== undefined}
            errorText={fieldErrors.averagePrice}
          >
            <Input
              name="averageUnitPurchasePrice"
              value={averagePrice}
              onChange={(event) => {
                setAveragePrice(event.target.value);
                clearFieldError("averagePrice");
              }}
            />
          </Field>
          <SelectField
            label={t("addAssets.other.purchaseCurrency")}
            options={cash.map((asset) => ({
              value: asset.id,
              label: asset.symbol ?? asset.name,
            }))}
            value={purchaseCurrencyId}
            onChange={setPurchaseCurrencyId}
          />
          <Button
            type="submit"
            colorPalette="blue"
            loading={mutation.isPending}
            disabled={mutation.isPending}
          >
            {t("addAssets.other.submit")}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
