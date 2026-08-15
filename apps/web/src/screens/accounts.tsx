import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Stack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { Account, Position } from "@optimus/engine/api";
import { UpdateAccountInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";

import { engineApi } from "../api";
import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
  ResourceCard,
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { accountQuery, assetsQuery, queryKeys } from "../queries";
import { RefreshConnectionButton } from "../refresh-connection";
import { AddAssetsButton } from "./add-assets";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 });
const marketPrice = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const valuedAmount = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fxRate = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const MANUAL_ASSET_CATEGORIES = new Set(["bonds", "derivatives", "commodities", "other"]);

const formatValuedAmount = (value: number, currencyIso: string) =>
  `${valuedAmount.format(value)} ${currencyIso}`;

const conversionDescription = (position: Position, valuationCurrencyIso: string) => {
  if (
    position.price === null ||
    position.reportingValue === null ||
    position.quantity === 0 ||
    position.price.currencyIso === valuationCurrencyIso
  )
    return undefined;
  const rate = position.reportingValue / (position.quantity * position.price.price);
  return `Converted at 1 ${position.price.currencyIso} = ${fxRate.format(rate)} ${valuationCurrencyIso}`;
};

type PositionTableRow = Record<string, unknown> & {
  id: string;
  assetName: string;
  assetSymbol: string | null;
  quantity: number;
  price: Position["price"];
  reportingValue: number | null;
  position: Position;
};

function PositionTable({
  positions,
  account,
}: {
  readonly positions: ReadonlyArray<Position>;
  readonly account: Account;
}) {
  if (positions.length === 0) return <EmptyState title="No positions" isCompact />;
  const rows: PositionTableRow[] = positions.map((position) => ({
    ...position,
    position,
  }));
  return (
    <Table
      data={rows}
      idKey="id"
      density="compact"
      dividers="rows"
      hasHover
      columns={[
        {
          key: "assetName",
          header: "Asset",
          width: proportional(1.5),
          renderCell: (row) => {
            const name = (
              <Stack gap={0.5}>
                <Text weight="semibold">{row.assetName}</Text>
                {row.assetSymbol && (
                  <Text type="supporting" as="p">
                    {row.assetSymbol}
                  </Text>
                )}
              </Stack>
            );
            return account.connectionId === null &&
              MANUAL_ASSET_CATEGORIES.has(row.position.assetCategory) ? (
              <AstryxLink
                as={RouterLink}
                href={`/assets/${row.position.assetId}/edit`}
                isStandalone
                weight="semibold"
              >
                {row.assetName}
              </AstryxLink>
            ) : (
              name
            );
          },
        },
        {
          key: "quantity",
          header: "Quantity",
          width: proportional(0.8),
          align: "end",
          renderCell: (row) => <Text hasTabularNumbers>{number.format(row.quantity)}</Text>,
        },
        {
          key: "price",
          header: "Market price",
          width: proportional(1.3),
          align: "end",
          renderCell: (row) =>
            row.price === null ? (
              <Text type="supporting">—</Text>
            ) : (
              <Text hasTabularNumbers>
                {marketPrice.format(row.price.price)} {row.price.currencyIso}
              </Text>
            ),
        },
        {
          key: "reportingValue",
          header: `Value (${account.baseCurrencyIso})`,
          width: proportional(1.1),
          align: "end",
          renderCell: (row) => {
            const conversion = conversionDescription(row.position, account.baseCurrencyIso);
            return (
              <Tooltip content={conversion ?? ""} isEnabled={conversion !== undefined}>
                <Text hasTabularNumbers>
                  {row.reportingValue === null
                    ? "Unpriced"
                    : formatValuedAmount(row.reportingValue, account.baseCurrencyIso)}
                </Text>
              </Tooltip>
            );
          },
        },
        {
          key: "actions",
          header: "",
          width: proportional(0.5),
          align: "end",
          renderCell: (row) =>
            account.connectionId === null ? (
              <Button
                as={RouterLink}
                href={`/positions/${row.id}/edit`}
                label="Edit"
                size="sm"
                variant="ghost"
              />
            ) : null,
        },
      ]}
    />
  );
}

export function AccountDetailScreen({ id }: { readonly id: string }) {
  const query = useQuery(accountQuery(id));
  const [refreshError, setRefreshError] = useState<string | null>(null);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const account = query.data;
  const active = account.positions.filter(
    (position) => position.quantity !== 0 && position.reportingValue !== null,
  );
  const zero = account.positions.filter((position) => position.quantity === 0);
  const unpriced = account.positions.filter(
    (position) => position.quantity !== 0 && position.reportingValue === null,
  );
  return (
    <>
      <PageBreadcrumbs
        items={
          account.connectionId === null
            ? [{ label: "Dashboard", href: "/" }, { label: account.name }]
            : [
                { label: "Settings", href: "/settings" },
                { label: "Connections", href: "/settings/connections" },
                {
                  label: account.connectionName ?? "Connection",
                  href: `/settings/connections/${account.connectionId}`,
                },
                { label: account.name },
              ]
        }
      />
      <PageHeader
        title={account.name}
        subtitle={`Valuation currency ${account.baseCurrencyIso}`}
        action={
          account.connectionId !== null ? (
            <RefreshConnectionButton
              connectionId={account.connectionId}
              onError={setRefreshError}
            />
          ) : (
            <Button as={RouterLink} href={`/accounts/${id}/edit`} label="Edit account" />
          )
        }
      />
      {refreshError !== null && (
        <Banner status="error" title="Refresh failed" description={refreshError} />
      )}
      {account.totalIncomplete && (
        <Banner
          status="warning"
          title="Total is incomplete"
          description="Unpriced positions are excluded from this total."
        />
      )}
      <ResourceCard>
        <Stack direction="horizontal" justify="between" align="center" gap={4} wrap="wrap">
          <Text type="label">Valued total</Text>
          <Text type="display-2" hasTabularNumbers>
            {formatValuedAmount(account.total, account.baseCurrencyIso)}
          </Text>
        </Stack>
      </ResourceCard>
      <Stack direction="horizontal" justify="between" align="center" gap={3} wrap="wrap">
        <Heading level={2}>Positions</Heading>
        {account.connectionId === null && <AddAssetsButton />}
      </Stack>
      <PositionTable positions={active} account={account} />
      {zero.length > 0 && (
        <Section variant="muted" padding={3}>
          <Collapsible trigger={`Zero positions (${zero.length})`} defaultIsOpen={false}>
            <PositionTable positions={zero} account={account} />
          </Collapsible>
        </Section>
      )}
      {unpriced.length > 0 && (
        <Section variant="muted" padding={3}>
          <Collapsible trigger={`Unpriced positions (${unpriced.length})`} defaultIsOpen={false}>
            <PositionTable positions={unpriced} account={account} />
          </Collapsible>
        </Section>
      )}
    </>
  );
}

function LoadedEditAccount({ account }: { readonly account: Account }) {
  const assets = useQuery(assetsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (payload: UpdateAccountInput) => engineApi.updateAccount(account.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(account.id) });
      await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deleteAccount(account.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      await navigate({ to: "/" });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const form = useAppForm({
    defaultValues: { name: account.name, baseCurrencyAssetId: account.baseCurrencyAssetId },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(UpdateAccountInput) },
    onSubmit: async ({ value }) =>
      update.mutateAsync(await Schema.decodeUnknownPromise(UpdateAccountInput)(value)),
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
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}

export function EditAccountScreen({ id }: { readonly id: string }) {
  const query = useQuery(accountQuery(id));
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  if (query.data.connectionId !== null)
    return <PageState kind="error" message="This Account is managed by a Connection and cannot be edited." />;
  return <LoadedEditAccount account={query.data} />;
}
