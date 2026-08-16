import {
  Alert,
  Box,
  Button,
  Card,
  Collapsible,
  Flex,
  Heading,
  Input,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { ConnectorCapability, Connection } from "@optimus/engine/api";
import { UpdateConnectionInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState, type FormEvent } from "react";

import {
  DeleteButton,
  FormError,
  FormFrame,
  NavRow,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import { EmptyState } from "../components/ui/empty-state";
import { Field } from "../components/ui/field";
import { PasswordInput } from "../components/ui/password-input";
import { notify } from "../components/ui/toaster";
import { Markdown } from "../markdown";
import {
  useConnection,
  useConnections,
  useConnectorCapabilities,
  useDeleteConnection,
  useUpdateConnection,
} from "../portfolio";
import { RefreshConnectionButton } from "../refresh-connection";
import { SelectField } from "../select-field";
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
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Refresh failed</Alert.Title>
            <Alert.Description>{refreshError}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {query.data.length === 0 ? (
        <EmptyState
          title="No connections"
          description="Connect a service from Add assets to import accounts automatically."
        >
          <AddAssetsButton />
        </EmptyState>
      ) : (
        <Box as="ul" m="0" p="0">
          {query.data.map((connection) => (
            <NavRow
              key={connection.id}
              href={`/settings/connections/${connection.id}`}
              label={connection.name}
              description={accountCount(connection.accounts.length)}
              endContent={
                <Flex gap="2" align="center">
                  <RefreshConnectionButton connectionId={connection.id} onError={setRefreshError} />
                  <Button asChild size="sm" variant="ghost">
                    <RouterLink
                      to="/settings/connections/$connectionId/edit"
                      params={{ connectionId: connection.id }}
                    >
                      Edit
                    </RouterLink>
                  </Button>
                </Flex>
              }
            />
          ))}
        </Box>
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
          <Flex gap="2" align="center">
            <RefreshConnectionButton connectionId={id} onError={setRefreshError} />
            <Button asChild>
              <RouterLink
                to="/settings/connections/$connectionId/edit"
                params={{ connectionId: id }}
              >
                Edit
              </RouterLink>
            </Button>
          </Flex>
        }
      />
      {refreshError !== null && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Refresh failed</Alert.Title>
            <Alert.Description>{refreshError}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Heading as="h2" size="md">
        Accounts
      </Heading>
      {connection.accounts.length === 0 ? (
        <EmptyState title="No accounts" description="Imported accounts will appear here." />
      ) : (
        <Box as="ul" m="0" p="0">
          {connection.accounts.map((account) => (
            <Box
              as="li"
              key={account.id}
              listStyle="none"
              borderBottomWidth="1px"
              borderColor="border"
            >
              <Stack gap="0.5" py="3" px="1">
                <Link asChild fontWeight="semibold">
                  <RouterLink to="/accounts/$accountId" params={{ accountId: account.id }}>
                    {account.name}
                  </RouterLink>
                </Link>
                <Text color="fg.muted" fontSize="sm">
                  {`${account.positionCount} holding${account.positionCount === 1 ? "" : "s"}`}
                </Text>
              </Stack>
            </Box>
          ))}
        </Box>
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
      notify.success("Connection updated.");
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
      <Text as="p" color="fg.muted">
        Prefer read-only credentials with no trading or withdrawal capability whenever the Connector
        allows it.
      </Text>
      <ConnectorInstructions connector={connector} />
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <Field label="Name">
          <Input name="name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        {connector.credentialFields.map((field) =>
          field.kind === "select" ? (
            <SelectField
              key={field.key}
              label={field.label}
              options={[{ value: "", label: "Keep current value" }, ...(field.options ?? [])]}
              value={credentials[field.key] ?? ""}
              onChange={(value) =>
                setCredentials((current) => ({ ...current, [field.key]: value }))
              }
              name={field.key}
              helperText="Choose a value only if you want to change it."
            />
          ) : (
            <Field
              key={field.key}
              label={field.label}
              helperText="Leave blank to keep the current value."
            >
              {field.kind === "password" ? (
                <PasswordInput
                  name={field.key}
                  value={credentials[field.key] ?? ""}
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              ) : (
                <Input
                  name={field.key}
                  value={credentials[field.key] ?? ""}
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              )}
            </Field>
          ),
        )}
        <Button
          type="submit"
          colorPalette="blue"
          disabled={update.isPending}
          loading={update.isPending}
        >
          Save changes
        </Button>
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
    <Card.Root>
      <Card.Body>
        <Collapsible.Root>
          <Collapsible.Trigger asChild>
            <Button variant="ghost">Setup instructions</Button>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <Markdown headingLevelStart={3}>{instructions}</Markdown>
          </Collapsible.Content>
        </Collapsible.Root>
      </Card.Body>
    </Card.Root>
  );
}
