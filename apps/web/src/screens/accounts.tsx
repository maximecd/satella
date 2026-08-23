import {
  Alert,
  Box,
  Button,
  Collapsible,
  Flex,
  Heading,
  Link,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { Account, Position } from "@satella-app/engine/api";
import { UpdateAccountInput } from "@satella-app/engine/api";
import type { TFunction } from "i18next";
import * as Schema from "effect/Schema";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
  ResourceCard,
} from "../components";
import { CopyErrorButton } from "../components/ui/copy-error";
import { EmptyState } from "../components/ui/empty-state";
import { Tooltip } from "../components/ui/tooltip";
import { submitThenChangeValidation, useAppForm } from "../form";
import { useAccount, useAssets, useDeleteAccount, useUpdateAccount } from "../portfolio";
import { RefreshCustodianButton } from "../refresh-custodian";
import { AddAssetsButton } from "./add-assets";
import {
  compareDecimal,
  divideDecimal,
  formatAmount,
  formatDecimal,
  formatFxAmount,
  formatMarketPriceAmount,
  formatQuantity,
  formatSignedAmount,
  formatWholeAmount,
  multiplyDecimal,
} from "../financial-number";

const MANUAL_ASSET_CATEGORIES = new Set(["other"]);

const pnlPercent = (value: string | null) =>
  value === null
    ? "—"
    : `${formatDecimal(multiplyDecimal(value, "100"), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`;

const conversionDescription = (position: Position, valuationCurrencyIso: string, t: TFunction) => {
  if (
    position.price === null ||
    position.reportingValue === null ||
    compareDecimal(position.quantity, "0") === 0 ||
    position.price.currencyIso === valuationCurrencyIso
  )
    return undefined;
  const rate = divideDecimal(
    position.reportingValue,
    multiplyDecimal(position.quantity, position.price.price),
  );
  return t("accounts.convertedAt", {
    from: formatWholeAmount("1", position.price.currencyIso),
    to: formatFxAmount(rate, valuationCurrencyIso),
  });
};

function PositionTable({
  positions,
  account,
}: {
  readonly positions: ReadonlyArray<Position>;
  readonly account: Account;
}) {
  const { t } = useTranslation();
  if (positions.length === 0)
    return <EmptyState title={t("accounts.table.noPositions")} size="sm" />;
  return (
    <Table.ScrollArea>
      <Table.Root size="sm" variant="line" interactive>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("accounts.table.asset")}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">{t("accounts.table.quantity")}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              {t("accounts.table.marketPrice")}
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              {t("accounts.table.value", { iso: account.baseCurrencyIso })}
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              {t("accounts.table.unrealizedPnl")}
            </Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {positions.map((position) => {
            const conversion = conversionDescription(position, account.baseCurrencyIso, t);
            const name = (
              <Stack gap="0.5">
                <Text fontWeight="semibold">{position.assetName}</Text>
                {position.assetSymbol ? (
                  <Text color="fg.muted" as="p">
                    {position.assetSymbol}
                  </Text>
                ) : null}
              </Stack>
            );
            return (
              <Table.Row key={position.id}>
                <Table.Cell>
                  {account.connectorAccountId === null &&
                  MANUAL_ASSET_CATEGORIES.has(position.assetCategory) ? (
                    <Link asChild fontWeight="semibold">
                      <RouterLink to="/assets/$assetId/edit" params={{ assetId: position.assetId }}>
                        {position.assetName}
                      </RouterLink>
                    </Link>
                  ) : (
                    name
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
                  {formatQuantity(position.quantity)}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  {position.price === null ? (
                    <Text color="fg.muted">—</Text>
                  ) : (
                    <Text fontVariantNumeric="tabular-nums">
                      {formatMarketPriceAmount(position.price.price, position.price.currencyIso)}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <Tooltip content={conversion ?? ""} disabled={conversion === undefined}>
                    <Text fontVariantNumeric="tabular-nums">
                      {position.reportingValue === null
                        ? t("accounts.table.unpriced")
                        : formatAmount(position.reportingValue, account.baseCurrencyIso)}
                    </Text>
                  </Tooltip>
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <Text
                    fontVariantNumeric="tabular-nums"
                    color={
                      position.unrealizedPnl === null
                        ? "fg.muted"
                        : compareDecimal(position.unrealizedPnl, "0") > 0
                          ? "green.fg"
                          : compareDecimal(position.unrealizedPnl, "0") < 0
                            ? "red.fg"
                            : undefined
                    }
                  >
                    {position.unrealizedPnl === null
                      ? "—"
                      : `${formatSignedAmount(position.unrealizedPnl, account.baseCurrencyIso)} (${pnlPercent(position.unrealizedPnlPercent)})`}
                  </Text>
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <Button asChild size="sm" variant="ghost">
                    <RouterLink
                      to="/positions/$positionId/edit"
                      params={{ positionId: position.id }}
                    >
                      {t("accounts.table.edit")}
                    </RouterLink>
                  </Button>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}

export function AccountDetailScreen({ id }: { readonly id: string }) {
  const { t } = useTranslation();
  const query = useAccount(id);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={describeError(query.error)} />;
  const account = query.data;
  const title = account.isDefaultCustodian ? t("accounts.otherHoldings") : account.name;
  const active = account.positions.filter(
    (position) => compareDecimal(position.quantity, "0") !== 0 && position.reportingValue !== null,
  );
  const zero = account.positions.filter((position) => compareDecimal(position.quantity, "0") === 0);
  const unpriced = account.positions.filter(
    (position) => compareDecimal(position.quantity, "0") !== 0 && position.reportingValue === null,
  );
  return (
    <>
      <PageBreadcrumbs
        items={
          account.connectorAccountId === null
            ? [{ label: t("accounts.breadcrumbs.dashboard"), href: "/" }, { label: title }]
            : [
                { label: t("accounts.breadcrumbs.settings"), href: "/settings" },
                { label: t("accounts.breadcrumbs.custodians"), href: "/settings/custodians" },
                {
                  label: account.custodianName,
                  href: `/settings/custodians/${account.custodianId}`,
                },
                { label: title },
              ]
        }
      />
      <PageHeader
        title={title}
        subtitle={t("accounts.valuationCurrencySubtitle", { iso: account.baseCurrencyIso })}
        action={
          account.connectorAccountId !== null ? (
            <RefreshCustodianButton custodianId={account.custodianId} onError={setRefreshError} />
          ) : account.isDefaultCustodian ? undefined : (
            <Button asChild>
              <RouterLink to="/accounts/$accountId/edit" params={{ accountId: id }}>
                {t("accounts.editAccount")}
              </RouterLink>
            </Button>
          )
        }
      />
      {refreshError !== null && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t("accounts.refreshFailed")}</Alert.Title>
            <Flex align="center" gap="1" wrap="wrap">
              <Alert.Description>{refreshError}</Alert.Description>
              <CopyErrorButton value={refreshError} />
            </Flex>
          </Alert.Content>
        </Alert.Root>
      )}
      {account.totalIncomplete && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t("accounts.incompleteTotalTitle")}</Alert.Title>
            <Alert.Description>{t("accounts.incompleteTotalDescription")}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <ResourceCard>
        <Flex justify="space-between" align="center" gap="4" wrap="wrap">
          <Text fontWeight="medium">{t("accounts.valuedTotal")}</Text>
          <Text fontSize="2xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">
            {formatAmount(account.total, account.baseCurrencyIso)}
          </Text>
          <Stack align="flex-end" gap="0">
            <Text fontWeight="medium">{t("accounts.unrealizedPnl")}</Text>
            <Text
              fontSize="lg"
              fontVariantNumeric="tabular-nums"
              color={
                compareDecimal(account.unrealizedPnl, "0") > 0
                  ? "green.fg"
                  : compareDecimal(account.unrealizedPnl, "0") < 0
                    ? "red.fg"
                    : undefined
              }
            >
              {formatSignedAmount(account.unrealizedPnl, account.baseCurrencyIso)}
              {account.unrealizedPnlPercent === null
                ? ""
                : ` (${pnlPercent(account.unrealizedPnlPercent)})`}
            </Text>
          </Stack>
        </Flex>
      </ResourceCard>
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2" size="md">
          {t("accounts.positionsHeading")}
        </Heading>
        {account.connectorAccountId === null && <AddAssetsButton />}
      </Flex>
      <PositionTable positions={active} account={account} />
      {zero.length > 0 && (
        <Box bg="bg.subtle" rounded="md" p="3">
          <Collapsible.Root>
            <Collapsible.Trigger asChild>
              <Button variant="ghost">{t("accounts.zeroPositions", { total: zero.length })}</Button>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <PositionTable positions={zero} account={account} />
            </Collapsible.Content>
          </Collapsible.Root>
        </Box>
      )}
      {unpriced.length > 0 && (
        <Box bg="bg.subtle" rounded="md" p="3">
          <Collapsible.Root>
            <Collapsible.Trigger asChild>
              <Button variant="ghost">
                {t("accounts.unpricedPositions", { total: unpriced.length })}
              </Button>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <PositionTable positions={unpriced} account={account} />
            </Collapsible.Content>
          </Collapsible.Root>
        </Box>
      )}
    </>
  );
}

function LoadedEditAccount({ account }: { readonly account: Account }) {
  const { t } = useTranslation();
  const assets = useAssets();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateAccount(account.id);
  const remove = useDeleteAccount(account.id);
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  const form = useAppForm({
    defaultValues: { name: account.name, baseCurrencyAssetId: account.baseCurrencyAssetId },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(UpdateAccountInput) },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync(await Schema.decodeUnknownPromise(UpdateAccountInput)(value));
        await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
      } catch (cause) {
        setError(describeError(cause));
      }
    },
  });
  if (assets.isPending) return <PageState kind="pending" />;
  const fiat = assets.data?.filter((asset) => asset.assetCategory === "cash") ?? [];
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("accounts.breadcrumbs.dashboard"), href: "/" },
          { label: account.name, href: `/accounts/${account.id}` },
          { label: t("accounts.breadcrumbs.edit") },
        ]}
      />
      <PageHeader title={t("accounts.editTitle", { name: account.name })} />
      <FormError message={error} />
      <form.AppForm>
        <FormFrame
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField
            name="name"
            children={(field) => <field.TextField label={t("accounts.accountNameLabel")} />}
          />
          <form.AppField
            name="baseCurrencyAssetId"
            children={(field) => (
              <field.SelectField
                label={t("accounts.valuationCurrencyLabel")}
                options={fiat.map((asset) => ({
                  value: asset.id,
                  label: asset.symbol ?? asset.name,
                }))}
              />
            )}
          />
          <form.SubmitButton label={t("accounts.saveChanges")} />
        </FormFrame>
      </form.AppForm>
      <DeleteButton
        entity="account"
        isPending={remove.isPending}
        onDelete={async () => {
          try {
            await remove.mutateAsync();
            await navigate({ to: "/" });
          } catch (cause) {
            setError(describeError(cause));
          }
        }}
      />
    </>
  );
}

export function EditAccountScreen({ id }: { readonly id: string }) {
  const { t } = useTranslation();
  const query = useAccount(id);
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={describeError(query.error)} />;
  if (query.data.connectorAccountId !== null)
    return <PageState kind="error" message={t("accounts.managedAccountError")} />;
  return <LoadedEditAccount account={query.data} />;
}
