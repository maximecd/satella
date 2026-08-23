import { Alert, Box, Button, Flex, Heading, Input, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { ConnectorCapability, Custodian } from "@satella-app/engine/api";
import { UpdateCustodianInput } from "@satella-app/engine/api";
import * as Schema from "effect/Schema";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  DeleteButton,
  FormError,
  FormFrame,
  NavRow,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import { CopyErrorButton } from "../components/ui/copy-error";
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

const listedCustodians = (custodians: ReadonlyArray<Custodian>) =>
  custodians.filter((custodian) => !custodian.isDefault);

export function CustodiansListScreen() {
  const { t } = useTranslation();
  const query = useCustodians();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const custodians = listedCustodians(query.data);
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("settings.title"), href: "/settings" },
          { label: t("custodians.title") },
        ]}
      />
      <PageHeader title={t("custodians.title")} />
      {refreshError !== null && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t("custodians.refreshFailed")}</Alert.Title>
            <Flex align="center" gap="1" wrap="wrap">
              <Alert.Description>{refreshError}</Alert.Description>
              <CopyErrorButton value={refreshError} />
            </Flex>
          </Alert.Content>
        </Alert.Root>
      )}
      {custodians.length === 0 ? (
        <EmptyState
          title={t("custodians.list.empty.title")}
          description={t("custodians.list.empty.description")}
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
              description={t("custodians.list.accountCount", {
                count: custodian.accounts.length,
              })}
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
                      {t("custodians.edit")}
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
  const { t } = useTranslation();
  const query = useCustodian(id);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const custodian = query.data;
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("settings.title"), href: "/settings" },
          { label: t("custodians.title"), href: "/settings/custodians" },
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
                {t("custodians.edit")}
              </RouterLink>
            </Button>
          </Flex>
        }
      />
      {refreshError !== null && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t("custodians.refreshFailed")}</Alert.Title>
            <Flex align="center" gap="1" wrap="wrap">
              <Alert.Description>{refreshError}</Alert.Description>
              <CopyErrorButton value={refreshError} />
            </Flex>
          </Alert.Content>
        </Alert.Root>
      )}
      <Heading as="h2" size="md">
        {t("custodians.detail.accountsHeading")}
      </Heading>
      {custodian.accounts.length === 0 ? (
        <EmptyState
          title={t("custodians.detail.noAccountsTitle")}
          description={t("custodians.detail.noAccountsDescription")}
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
                  {t("custodians.detail.holdingsCount", { count: account.positionCount })}
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
  const { t } = useTranslation();
  const query = useCustodian(id);
  const capabilities = useConnectorCapabilities();
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");
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
    return <PageState kind="error" message={t("custodians.editScreen.noLongerEditable")} />;
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState(custodian.name);
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries((connector?.credentialFields ?? []).map((field) => [field.key, ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateCustodian(custodian.id);
  const remove = useDeleteCustodian(custodian.id);
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");

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
      notify.success(t("custodians.editScreen.updatedToast"));
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
          { label: t("settings.title"), href: "/settings" },
          { label: t("custodians.title"), href: "/settings/custodians" },
          { label: custodian.name, href: `/settings/custodians/${custodian.id}` },
          { label: t("custodians.edit") },
        ]}
      />
      <PageHeader
        title={t("custodians.editScreen.title", { name: custodian.name })}
        action={
          custodian.connectorId !== null ? (
            <RefreshCustodianButton custodianId={custodian.id} />
          ) : undefined
        }
      />
      {connector !== undefined ? (
        <>
          <Text as="p" color="fg.muted">
            {t("custodians.editScreen.readOnlyHint")}
          </Text>
          <SetupInstructions source={connector.instructions} />
        </>
      ) : null}
      <FormError message={error} />
      <FormFrame onSubmit={(event) => void submit(event)}>
        <Field label={t("custodians.editScreen.nameLabel")}>
          <Input name="name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        {connector?.credentialFields.map((field) =>
          field.kind === "select" ? (
            <SelectField
              key={field.key}
              label={field.label}
              options={[
                { value: "", label: t("custodians.editScreen.keepCurrentValue") },
                ...(field.options ?? []),
              ]}
              value={credentials[field.key] ?? ""}
              onChange={(value) =>
                setCredentials((current) => ({ ...current, [field.key]: value }))
              }
              name={field.key}
              helperText={t("custodians.editScreen.selectHelperText")}
            />
          ) : (
            <Field
              key={field.key}
              label={field.label}
              helperText={t("custodians.editScreen.textHelperText")}
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
          {t("custodians.editScreen.saveChanges")}
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
