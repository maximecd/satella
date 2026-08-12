import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, Outlet, useNavigate } from "@tanstack/react-router";
import {
  ConnectCustodianInput,
  ConnectorCapability,
  CreateCustodianInput,
  Custodian,
  UpdateCustodianInput,
} from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState, type CSSProperties, type FormEvent } from "react";

import { engineApi } from "../api";
import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { connectorCapabilitiesQuery, custodianQuery, custodiansQuery, queryKeys } from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const managementBadge = (mode: "manual" | "synced") => (
  <Badge
    label={mode === "manual" ? "Manual" : "Synced"}
    variant={mode === "manual" ? "success" : "neutral"}
  />
);

export function CustodianListScreen() {
  const query = useQuery(custodiansQuery);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  return (
    <>
      <PageHeader
        title="Custodians"
        subtitle="Banks, brokers, exchanges, and wallets where assets are held."
        action={
          <Button as={RouterLink} href="/custodians/new" label="Add custodian" variant="primary" />
        }
      />
      {query.data.length === 0 ? (
        <EmptyState
          title="No custodians yet"
          description="Add a manual custodian or connect a supported service to begin tracking accounts and positions."
          actions={
            <Button
              as={RouterLink}
              href="/custodians/new"
              label="Add custodian"
              variant="primary"
            />
          }
        />
      ) : (
        <List density="balanced" hasDividers>
          {query.data.map((custodian) => (
            <ListItem
              key={custodian.id}
              label={
                <AstryxLink
                  as={RouterLink}
                  href={`/custodians/${custodian.id}`}
                  isStandalone
                  weight="semibold"
                >
                  {custodian.name}
                </AstryxLink>
              }
              description={`${custodian.accounts.length} account${custodian.accounts.length === 1 ? "" : "s"}`}
              endContent={
                <Stack direction="horizontal" align="center" gap={2}>
                  {managementBadge(custodian.managementMode)}
                  <Button
                    as={RouterLink}
                    href={`/custodians/${custodian.id}`}
                    label="View"
                    size="sm"
                    variant="secondary"
                  />
                </Stack>
              }
            />
          ))}
        </List>
      )}
    </>
  );
}

export function CreateCustodianScreen() {
  const capabilities = useQuery(connectorCapabilitiesQuery);
  if (capabilities.isPending) return <PageState kind="pending" />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  return (
    <>
      <PageBreadcrumbs
        items={[{ label: "Custodians", href: "/custodians" }, { label: "Add custodian" }]}
      />
      <PageHeader
        title="Add custodian"
        subtitle="Choose how Optimus should keep the accounts up to date."
      />
      <List density="balanced" hasDividers>
        <ListItem
          label="Manual custodian"
          description="Enter accounts and positions yourself."
          endContent={
            <Button
              as={RouterLink}
              href="/custodians/new/manual"
              label="Set up manually"
              variant="primary"
            />
          }
        />
        <ListItem
          label="Connect a service"
          description="Import accounts and positions from a supported provider."
          endContent={
            capabilities.data.connectors.length > 0 ? (
              <Button
                as={RouterLink}
                href="/custodians/new/connector"
                label="Connect an account"
                variant="primary"
              />
            ) : (
              <Badge label="No connectors available" variant="neutral" />
            )
          }
        />
      </List>
    </>
  );
}

export function CustodianCreationLayout() {
  return <Outlet />;
}

export function CreateManualCustodianScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: engineApi.createCustodian,
    onSuccess: async (custodian) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all });
      await navigate({ to: "/custodians/$custodianId", params: { custodianId: custodian.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const defaultValues: typeof CreateCustodianInput.Encoded = {
    name: "",
    managementMode: "manual",
  };
  const form = useAppForm({
    defaultValues,
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(CreateCustodianInput) },
    onSubmit: async ({ value }) => {
      setError(null);
      const decoded = await Schema.decodeUnknownPromise(CreateCustodianInput)(value);
      await mutation.mutateAsync(decoded);
    },
  });
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: "Add custodian", href: "/custodians/new" },
          { label: "Manual setup" },
        ]}
      />
      <PageHeader title="Add manual custodian" subtitle="Create accounts and positions yourself." />
      <FormError message={error} />
      <form.AppForm>
        <FormFrame
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.SubmitButton label="Create custodian" />
        </FormFrame>
      </form.AppForm>
    </>
  );
}

export function CreateConnectorCustodianScreen() {
  const capabilities = useQuery(connectorCapabilitiesQuery);
  if (capabilities.isPending) return <PageState kind="pending" />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  if (capabilities.data.connectors.length === 0) {
    return (
      <PageState
        kind="error"
        message="No connector is currently available. Choose manual setup instead."
      />
    );
  }
  return <ConnectorSetupForm connectors={capabilities.data.connectors} />;
}

function ConnectorSetupForm({
  connectors,
}: {
  readonly connectors: ReadonlyArray<ConnectorCapability>;
}) {
  const [search, setSearch] = useState("");
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const connector = connectors.find(({ id }) => id === connectorId);
  const filteredConnectors = connectors.filter((candidate) =>
    `${candidate.name} ${candidate.id} ${candidate.instructions ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: "Add custodian", href: "/custodians/new" },
          { label: "Connect a service" },
        ]}
      />
      <PageHeader
        title="Connect a service"
        subtitle="Choose a connector, then enter the details needed to import your accounts."
      />
      <Card padding={4}>
        {connector === undefined ? (
          <Stack gap={4}>
            <TextInput
              label="Search connectors"
              value={search}
              onChange={setSearch}
              htmlName="connectorSearch"
              startIcon="search"
              hasClear
              width="100%"
            />
            {filteredConnectors.length === 0 ? (
              <EmptyState
                title="No connectors found"
                description="Try a different connector name."
              />
            ) : (
              <section aria-label="Available connectors">
                <Grid columns={3} gap={3}>
                  {filteredConnectors.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-label={`Connect ${candidate.name}`}
                      style={connectorButtonStyle}
                      onClick={() => setConnectorId(candidate.id)}
                    >
                      <Stack align="center" gap={3}>
                        {candidate.icon === undefined ? (
                          <Heading level={2}>{candidate.name.slice(0, 1)}</Heading>
                        ) : (
                          <img
                            src={candidate.icon}
                            alt=""
                            aria-hidden="true"
                            style={connectorIconStyle}
                          />
                        )}
                        <Text weight="semibold">{candidate.name}</Text>
                      </Stack>
                    </button>
                  ))}
                </Grid>
              </section>
            )}
          </Stack>
        ) : (
          <ConnectorCredentialsForm connector={connector} />
        )}
      </Card>
      {connector !== undefined && (
        <Stack align="start">
          <Button
            label="Choose another connector"
            variant="ghost"
            size="sm"
            icon={<Icon icon="chevronLeft" />}
            onClick={() => setConnectorId(null)}
          />
        </Stack>
      )}
    </>
  );
}

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

function ConnectorCredentialsForm({ connector }: { readonly connector: ConnectorCapability }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(connector.name);
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
    mutationFn: engineApi.connectCustodian,
    onSuccess: async (custodian) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all });
      await navigate({ to: "/custodians/$custodianId", params: { custodianId: custodian.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (name.trim() === "") {
      nextFieldErrors.name = "Custodian name is required.";
    }
    for (const field of connector.credentialFields) {
      if (field.required && (credentials[field.key] ?? "").trim() === "") {
        nextFieldErrors[field.key] = `${field.label} is required.`;
      }
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }
    const payload = await Schema.decodeUnknownPromise(ConnectCustodianInput)({
      name: name.trim(),
      connectorId: connector.id,
      credentials,
    });
    await connect.mutateAsync(payload);
  };

  return (
    <Stack gap={4}>
      <Heading level={2}>{`Connect ${connector.name}`}</Heading>
      <ConnectorInstructions connector={connector} />
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <TextInput
          label="Custodian name"
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
                : {
                    status: {
                      type: "error" as const,
                      message: fieldError,
                    },
                  })}
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
                : {
                    status: {
                      type: "error" as const,
                      message: fieldError,
                    },
                  })}
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

function ConnectorInstructions({ connector }: { readonly connector: ConnectorCapability }) {
  if (connector.instructions === undefined) return null;
  const instructions = connector.instructions.replace(/^#\s+.*$/m, "").trim();
  return (
    <Card padding={3}>
      <Collapsible trigger="Setup instructions" defaultIsOpen={false}>
        <Markdown headingLevelStart={3} contentWidth="100%" autolink="gfm">
          {instructions}
        </Markdown>
      </Collapsible>
    </Card>
  );
}

export function CustodianDetailScreen({ id }: { readonly id: string }) {
  const query = useQuery(custodianQuery(id));
  const queryClient = useQueryClient();
  const toast = useToast();
  const [syncError, setSyncError] = useState<string | null>(null);
  const resync = useMutation({
    mutationFn: () => engineApi.resyncCustodian(id),
    onSuccess: async () => {
      setSyncError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }),
      ]);
      toast({ body: "Custodian resynced." });
    },
    onError: (cause) => setSyncError(errorMessage(cause)),
  });
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const custodian = query.data;
  return (
    <>
      <PageBreadcrumbs
        items={[{ label: "Custodians", href: "/custodians" }, { label: custodian.name }]}
      />
      <PageHeader
        title={custodian.name}
        subtitle={`${custodian.managementMode} custodian`}
        action={
          <Stack direction="horizontal" gap={2} align="center">
            {custodian.managementMode === "synced" && (
              <Button
                label="Resync"
                variant="primary"
                onClick={() => resync.mutate()}
                isDisabled={resync.isPending}
                isLoading={resync.isPending}
              />
            )}
            <Button as={RouterLink} href={`/custodians/${id}/edit`} label="Edit" />
          </Stack>
        }
      />
      <FormError message={syncError} />
      <Stack direction="horizontal" justify="between" align="center" gap={3} wrap="wrap">
        <Stack direction="horizontal" align="center" gap={2}>
          <Heading level={2}>Accounts</Heading>
          {managementBadge(custodian.managementMode)}
        </Stack>
        {custodian.managementMode === "manual" && (
          <Button
            as={RouterLink}
            href={`/custodians/${id}/accounts/new`}
            label="Add account"
            variant="primary"
          />
        )}
      </Stack>
      {custodian.accounts.length === 0 ? (
        <EmptyState title="No accounts" description="Create an account to hold positions." />
      ) : (
        <List density="balanced" hasDividers>
          {custodian.accounts.map((account) => (
            <ListItem
              key={account.id}
              label={
                <AstryxLink
                  as={RouterLink}
                  href={`/accounts/${account.id}`}
                  isStandalone
                  weight="semibold"
                >
                  {account.name}
                </AstryxLink>
              }
              description={`${account.baseCurrencyIso} · ${account.positionCount} position${account.positionCount === 1 ? "" : "s"}`}
              endContent={
                <Button
                  as={RouterLink}
                  href={`/accounts/${account.id}`}
                  label="View account"
                  size="sm"
                />
              }
            />
          ))}
        </List>
      )}
    </>
  );
}

export function EditCustodianScreen({ id }: { readonly id: string }) {
  const query = useQuery(custodianQuery(id));
  const capabilities = useQuery(connectorCapabilitiesQuery);
  if (query.isPending || capabilities.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  const connector = capabilities.data.connectors.find(
    ({ id: connectorId }) => connectorId === query.data.connectorId,
  );
  return (
    <LoadedEditCustodian
      custodian={query.data}
      {...(connector === undefined ? {} : { connector })}
    />
  );
}

function LoadedEditCustodian({
  custodian,
  connector,
}: {
  readonly custodian: Custodian;
  readonly connector?: ConnectorCapability;
}) {
  if (custodian.managementMode === "synced" && connector !== undefined) {
    return <LoadedEditConnectorCustodian custodian={custodian} connector={connector} />;
  }
  return <LoadedEditManualCustodian custodian={custodian} />;
}

function LoadedEditManualCustodian({ custodian }: { readonly custodian: Custodian }) {
  const { id, name } = custodian;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (payload: UpdateCustodianInput) => engineApi.updateCustodian(id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.detail(id) }),
      ]);
      toast({ body: "Custodian updated." });
      await navigate({ to: "/custodians/$custodianId", params: { custodianId: id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deleteCustodian(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all });
      await navigate({ to: "/custodians" });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const form = useAppForm({
    defaultValues: { name },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(UpdateCustodianInput) },
    onSubmit: async ({ value }) => {
      const decoded = await Schema.decodeUnknownPromise(UpdateCustodianInput)(value);
      await update.mutateAsync(decoded);
    },
  });
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: name, href: `/custodians/${id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${name}`}
        subtitle="Management mode is permanent and cannot be changed."
      />
      <FormError message={error} />
      <form.AppForm>
        <FormFrame
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.SubmitButton label="Save changes" />
        </FormFrame>
      </form.AppForm>
      <DeleteButton
        entity="custodian"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}

function LoadedEditConnectorCustodian({
  custodian,
  connector,
}: {
  readonly custodian: Custodian;
  readonly connector: ConnectorCapability;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(custodian.name);
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(connector.credentialFields.map((field) => [field.key, ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (payload: UpdateCustodianInput) => engineApi.updateCustodian(custodian.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.detail(custodian.id) }),
      ]);
      toast({ body: "Connection updated." });
      await navigate({
        to: "/custodians/$custodianId",
        params: { custodianId: custodian.id },
      });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deleteCustodian(custodian.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all });
      await navigate({ to: "/custodians" });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const changedCredentials = Object.fromEntries(
      Object.entries(credentials).filter(([, value]) => value !== ""),
    );
    const payload = await Schema.decodeUnknownPromise(UpdateCustodianInput)({
      name: name.trim(),
      ...(Object.keys(changedCredentials).length === 0 ? {} : { credentials: changedCredentials }),
    });
    await update.mutateAsync(payload);
  };

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: custodian.name, href: `/custodians/${custodian.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${custodian.name}`}
        subtitle={`Update the name or ${connector.name} connection credentials.`}
      />
      <ConnectorInstructions connector={connector} />
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          htmlName="name"
          width="100%"
          isRequired
        />
        {connector.credentialFields.map((field) =>
          field.kind === "select" ? (
            <Selector
              key={field.key}
              label={field.label}
              options={[{ value: "", label: "Keep current value" }, ...(field.options ?? [])]}
              value={credentials[field.key] ?? ""}
              onChange={(value) =>
                setCredentials((current) => ({ ...current, [field.key]: value }))
              }
              htmlName={field.key}
              description="Choose a value only if you want to change it."
              width="100%"
            />
          ) : (
            <TextInput
              key={field.key}
              label={field.label}
              type={field.kind === "password" ? "password" : "text"}
              value={credentials[field.key] ?? ""}
              onChange={(value) =>
                setCredentials((current) => ({ ...current, [field.key]: value }))
              }
              htmlName={field.key}
              description="Leave blank to keep the current value."
              width="100%"
            />
          ),
        )}
        <Button
          label="Save changes"
          type="submit"
          variant="primary"
          isDisabled={update.isPending}
          isLoading={update.isPending}
        />
      </FormFrame>
      <DeleteButton
        entity="custodian"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}
