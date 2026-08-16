import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { ConnectorCapability, Connection } from "@optimus/engine/api";
import { UpdateConnectionInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState, type FormEvent } from "react";

import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import {
  useConnection,
  useConnections,
  useConnectorCapabilities,
  useDeleteConnection,
  useUpdateConnection,
} from "../portfolio";
import { RefreshConnectionButton } from "../refresh-connection";
import { AddAssetsButton } from "./add-assets";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const accountCount = (count: number) => `${count} account${count === 1 ? "" : "s"}`;

export function ConnectionsListScreen() {
  const query = useConnections();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  return (
    <>
      <PageBreadcrumbs
        items={[{ label: "Settings", href: "/settings" }, { label: "Connections" }]}
      />
      <PageHeader title="Connections" />
      {refreshError !== null && (
        <Banner status="error" title="Refresh failed" description={refreshError} />
      )}
      {query.data.length === 0 ? (
        <EmptyState
          title="No connections"
          description="Connect a service from Add assets to import accounts automatically."
          actions={<AddAssetsButton />}
        />
      ) : (
        <List density="balanced" hasDividers>
          {query.data.map((connection) => (
            <ListItem
              key={connection.id}
              href={`/settings/connections/${connection.id}`}
              label={connection.name}
              description={accountCount(connection.accounts.length)}
              endContent={
                <Stack direction="horizontal" gap={2} align="center">
                  <RefreshConnectionButton connectionId={connection.id} onError={setRefreshError} />
                  <Button
                    as={RouterLink}
                    href={`/settings/connections/${connection.id}/edit`}
                    label="Edit"
                    size="sm"
                    variant="ghost"
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

export function ConnectionDetailScreen({ id }: { readonly id: string }) {
  const query = useConnection(id);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const connection = query.data;
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Connections", href: "/settings/connections" },
          { label: connection.name },
        ]}
      />
      <PageHeader
        title={connection.name}
        action={
          <Stack direction="horizontal" gap={2} align="center">
            <RefreshConnectionButton connectionId={id} onError={setRefreshError} />
            <Button as={RouterLink} href={`/settings/connections/${id}/edit`} label="Edit" />
          </Stack>
        }
      />
      {refreshError !== null && (
        <Banner status="error" title="Refresh failed" description={refreshError} />
      )}
      <Heading level={2}>Accounts</Heading>
      {connection.accounts.length === 0 ? (
        <EmptyState title="No accounts" description="Imported accounts will appear here." />
      ) : (
        <List density="balanced" hasDividers>
          {connection.accounts.map((account) => (
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
              description={`${account.positionCount} holding${account.positionCount === 1 ? "" : "s"}`}
            />
          ))}
        </List>
      )}
    </>
  );
}

export function EditConnectionScreen({ id }: { readonly id: string }) {
  const query = useConnection(id);
  const capabilities = useConnectorCapabilities();
  if (query.isPending || capabilities.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  const connector = capabilities.data.connectors.find(
    ({ id: connectorId }) => connectorId === query.data.connectorId,
  );
  if (connector === undefined) {
    return <PageState kind="error" message="This Connection can no longer be edited." />;
  }
  return <LoadedEditConnection connection={query.data} connector={connector} />;
}

function LoadedEditConnection({
  connection,
  connector,
}: {
  readonly connection: Connection;
  readonly connector: ConnectorCapability;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(connection.name);
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(connector.credentialFields.map((field) => [field.key, ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateConnection(connection.id);
  const remove = useDeleteConnection(connection.id);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const changedCredentials = Object.fromEntries(
      Object.entries(credentials).filter(([, value]) => value !== ""),
    );
    const payload = await Schema.decodeUnknownPromise(UpdateConnectionInput)({
      name: name.trim(),
      ...(Object.keys(changedCredentials).length === 0 ? {} : { credentials: changedCredentials }),
    });
    try {
      await update.mutateAsync(payload);
      toast({ body: "Connection updated." });
      await navigate({
        to: "/settings/connections/$connectionId",
        params: { connectionId: connection.id },
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Connections", href: "/settings/connections" },
          { label: connection.name, href: `/settings/connections/${connection.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${connection.name}`}
        action={<RefreshConnectionButton connectionId={connection.id} />}
      />
      <Text as="p" type="supporting">
        Prefer read-only credentials with no trading or withdrawal capability whenever the
        Connector allows it.
      </Text>
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
        entity="connection"
        isPending={remove.isPending}
        onDelete={async () => {
          try {
            await remove.mutateAsync();
            await navigate({ to: "/settings/connections" });
          } catch (cause) {
            setError(errorMessage(cause));
          }
        }}
      />
    </>
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
