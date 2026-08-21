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
import type { Account, Position } from "@optimus/engine/api";
import { UpdateAccountInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";

import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
  ResourceCard,
} from "../components";
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
  formatMarketPrice,
  formatQuantity,
  formatSignedAmount,
  multiplyDecimal,
} from "../financial-number";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";
const MANUAL_ASSET_CATEGORIES = new Set(["other"]);
const accountTitle = (account: Account) =>
  account.isDefaultCustodian ? "Other holdings" : account.name;

const pnlPercent = (value: string | null) =>
  value === null
    ? "—"
    : `${formatDecimal(multiplyDecimal(value, "100"), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`;

const conversionDescription = (position: Position, valuationCurrencyIso: string) => {
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
  return `Converted at 1 ${position.price.currencyIso} = ${formatDecimal(rate, {
    maximumFractionDigits: 6,
  })} ${valuationCurrencyIso}`;
};

function PositionTable({
  positions,
  account,
}: {
  readonly positions: ReadonlyArray<Position>;
  readonly account: Account;
}) {
  if (positions.length === 0) return <EmptyState title="No positions" size="sm" />;
  return (
    <Table.ScrollArea>
      <Table.Root size="sm" variant="line" interactive>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Asset</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Quantity</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Market price</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              Value ({account.baseCurrencyIso})
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Unrealized P&amp;L</Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {positions.map((position) => {
            const conversion = conversionDescription(position, account.baseCurrencyIso);
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
                      {formatMarketPrice(position.price.price)} {position.price.currencyIso}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <Tooltip content={conversion ?? ""} disabled={conversion === undefined}>
                    <Text fontVariantNumeric="tabular-nums">
                      {position.reportingValue === null
                        ? "Unpriced"
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
                      Edit
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
  const query = useAccount(id);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const account = query.data;
  const title = accountTitle(account);
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
            ? [{ label: "Dashboard", href: "/" }, { label: title }]
            : [
                { label: "Settings", href: "/settings" },
                { label: "Custodians", href: "/settings/custodians" },
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
        subtitle={`Valuation currency ${account.baseCurrencyIso}`}
        action={
          account.connectorAccountId !== null ? (
            <RefreshCustodianButton custodianId={account.custodianId} onError={setRefreshError} />
          ) : account.isDefaultCustodian ? undefined : (
            <Button asChild>
              <RouterLink to="/accounts/$accountId/edit" params={{ accountId: id }}>
                Edit account
              </RouterLink>
            </Button>
          )
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
      {account.totalIncomplete && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Total is incomplete</Alert.Title>
            <Alert.Description>Unpriced positions are excluded from this total.</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <ResourceCard>
        <Flex justify="space-between" align="center" gap="4" wrap="wrap">
          <Text fontWeight="medium">Valued total</Text>
          <Text fontSize="2xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">
            {formatAmount(account.total, account.baseCurrencyIso)}
          </Text>
          <Stack align="flex-end" gap="0">
            <Text fontWeight="medium">Unrealized P&amp;L</Text>
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
          Positions
        </Heading>
        {account.connectorAccountId === null && <AddAssetsButton />}
      </Flex>
      <PositionTable positions={active} account={account} />
      {zero.length > 0 && (
        <Box bg="bg.subtle" rounded="md" p="3">
          <Collapsible.Root>
            <Collapsible.Trigger asChild>
              <Button variant="ghost">{`Zero positions (${zero.length})`}</Button>
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
              <Button variant="ghost">{`Unpriced positions (${unpriced.length})`}</Button>
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
  const assets = useAssets();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateAccount(account.id);
  const remove = useDeleteAccount(account.id);
  const form = useAppForm({
    defaultValues: { name: account.name, baseCurrencyAssetId: account.baseCurrencyAssetId },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(UpdateAccountInput) },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync(await Schema.decodeUnknownPromise(UpdateAccountInput)(value));
        await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
  });
  if (assets.isPending) return <PageState kind="pending" />;
  const fiat = assets.data?.filter((asset) => asset.assetCategory === "cash") ?? [];
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: account.name, href: `/accounts/${account.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader title={`Edit ${account.name}`} />
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
            children={(field) => <field.TextField label="Account name" />}
          />
          <form.AppField
            name="baseCurrencyAssetId"
            children={(field) => (
              <field.SelectField
                label="Valuation currency"
                options={fiat.map((asset) => ({
                  value: asset.id,
                  label: asset.symbol ?? asset.name,
                }))}
              />
            )}
          />
          <form.SubmitButton label="Save changes" />
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
            setError(errorMessage(cause));
          }
        }}
      />
    </>
  );
}

export function EditAccountScreen({ id }: { readonly id: string }) {
  const query = useAccount(id);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  if (query.data.connectorAccountId !== null)
    return (
      <PageState
        kind="error"
        message="This account is managed by a synced custodian and cannot be edited."
      />
    );
  return <LoadedEditAccount account={query.data} />;
}
