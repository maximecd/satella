import { Alert, Box, Button, Flex, Heading, Input, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { ConnectorCapability, Custodian } from "@optimus/engine/api";
import { UpdateCustodianInput } from "@optimus/engine/api";
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
import {
  useCustodian,
  useCustodians,
  useConnectorCapabilities,
  useDeleteCustodian,
  useUpdateCustodian,
} from "../portfolio";
import { RefreshCustodianButton } from "../refresh-custodian";
import { SelectField } from "../select-field";
import { AddAssetsButton } from "./add-assets";
import { SetupInstructions } from "./setup-instructions";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

const accountCount = (count: number) => `${count} account${count === 1 ? "" : "s"}`;

const listedCustodians = (custodians: ReadonlyArray<Custodian>) =>
  custodians.filter((custodian) => !custodian.isDefault);

export function CustodiansListScreen() {
  const query = useCustodians();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const custodians = listedCustodians(query.data);
  return (
    <>
      <PageBreadcrumbs
        items={[{ label: "Settings", href: "/settings" }, { label: "Custodians" }]}
      />
      <PageHeader title="Custodians" />
      {refreshError !== null && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Refresh failed</Alert.Title>
            <Alert.Description>{refreshError}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {custodians.length === 0 ? (
        <EmptyState
          title="No custodians"
          description="Add a bank or broker from Add assets, or connect a service to import accounts."
        >
          <AddAssetsButton />
        </EmptyState>
      ) : (
        <Box as="ul" m="0" p="0">
          {custodians.map((custodian) => (
            <NavRow
              key={custodian.id}
              href={`/settings/custodians/${custodian.id}`}
              label={custodian.name}
              description={accountCount(custodian.accounts.length)}
              endContent={
                <Flex gap="2" align="center">
                  {custodian.connectorId !== null ? (
                    <RefreshCustodianButton custodianId={custodian.id} onError={setRefreshError} />
                  ) : null}
                  <Button asChild size="sm" variant="ghost">
                    <RouterLink
                      to="/settings/custodians/$custodianId/edit"
                      params={{ custodianId: custodian.id }}
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

export function CustodianDetailScreen({ id }: { readonly id: string }) {
  const query = useCustodian(id);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const custodian = query.data;
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Custodians", href: "/settings/custodians" },
          { label: custodian.name },
        ]}
      />
      <PageHeader
        title={custodian.name}
        action={
          <Flex gap="2" align="center">
            {custodian.connectorId !== null ? (
              <RefreshCustodianButton custodianId={id} onError={setRefreshError} />
            ) : null}
            <Button asChild>
              <RouterLink to="/settings/custodians/$custodianId/edit" params={{ custodianId: id }}>
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
      {custodian.accounts.length === 0 ? (
        <EmptyState
          title="No accounts"
          description="Accounts at this custodian will appear here."
        />
      ) : (
        <Box as="ul" m="0" p="0">
          {custodian.accounts.map((account) => (
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

export function EditCustodianScreen({ id }: { readonly id: string }) {
  const query = useCustodian(id);
  const capabilities = useConnectorCapabilities();
  if (query.isPending || capabilities.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  if (capabilities.isError)
    return <PageState kind="error" message={errorMessage(capabilities.error)} />;
  const connector =
    query.data.connectorId === null
      ? undefined
      : capabilities.data.connectors.find(
          ({ id: connectorKey }) => connectorKey === query.data.connectorId,
        );
  if (query.data.connectorId !== null && connector === undefined) {
    return <PageState kind="error" message="This custodian can no longer be edited." />;
  }
  return <LoadedEditCustodian custodian={query.data} connector={connector} />;
}

function LoadedEditCustodian({
  custodian,
  connector,
}: {
  readonly custodian: Custodian;
  readonly connector: ConnectorCapability | undefined;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(custodian.name);
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries((connector?.credentialFields ?? []).map((field) => [field.key, ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateCustodian(custodian.id);
  const remove = useDeleteCustodian(custodian.id);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const changedCredentials = Object.fromEntries(
      Object.entries(credentials).filter(([, value]) => value !== ""),
    );
    const input = { name: name.trim() };
    if (Object.keys(changedCredentials).length > 0) {
      Object.assign(input, { credentials: changedCredentials });
    }
    const payload = await Schema.decodeUnknownPromise(UpdateCustodianInput)(input);
    try {
      await update.mutateAsync(payload);
      notify.success("Custodian updated.");
      await navigate({
        to: "/settings/custodians/$custodianId",
        params: { custodianId: custodian.id },
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
          { label: "Custodians", href: "/settings/custodians" },
          { label: custodian.name, href: `/settings/custodians/${custodian.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${custodian.name}`}
        action={
          custodian.connectorId !== null ? (
            <RefreshCustodianButton custodianId={custodian.id} />
          ) : undefined
        }
      />
      {connector !== undefined ? (
        <>
          <Text as="p" color="fg.muted">
            Prefer read-only credentials with no trading or withdrawal capability whenever the
            connector allows it.
          </Text>
          <SetupInstructions source={connector.instructions} />
        </>
      ) : null}
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <Field label="Name">
          <Input name="name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        {connector?.credentialFields.map((field) =>
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
        entity="custodian"
        isPending={remove.isPending}
        onDelete={async () => {
          try {
            await remove.mutateAsync();
            await navigate({ to: "/settings/custodians" });
          } catch (cause) {
            setError(errorMessage(cause));
          }
        }}
      />
    </>
  );
}
