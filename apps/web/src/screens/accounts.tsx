import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Stack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { Account, Position } from "@optimus/engine/api";
import { CreateAccountInput, UpdateAccountInput } from "@optimus/engine/api";
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
import { accountQuery, assetsQuery, custodianQuery, queryKeys } from "../queries";
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
const quoteTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const sourceName = (source: string) =>
  source === "yahoo-finance"
    ? "Yahoo Finance"
    : source === "coingecko"
      ? "CoinGecko"
      : source === "manual"
        ? "Manual"
        : source;

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
          renderCell: (row) => (
            <Stack gap={0.5}>
              <Text weight="semibold">{row.assetName}</Text>
              {row.assetSymbol && (
                <Text type="supporting" as="p">
                  {row.assetSymbol}
                </Text>
              )}
            </Stack>
          ),
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
              <Stack gap={0.5} align="end">
                <Text hasTabularNumbers>
                  {marketPrice.format(row.price.price)} {row.price.currencyIso}
                </Text>
                <Text type="supporting" as="p">
                  {row.price.isStale ? "Delayed · " : ""}
                  {sourceName(row.price.source)} ·{" "}
                  {quoteTime.format(new Date(row.price.observedAt))}
                </Text>
              </Stack>
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
            account.managementMode === "manual" && account.presentationRole === null ? (
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
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: engineApi.refreshPrices,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }),
      ]);
    },
  });
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
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: account.custodianName, href: `/custodians/${account.custodianId}` },
          { label: account.name },
        ]}
      />
      <PageHeader
        title={account.name}
        subtitle={`${account.custodianName} · Valuation currency ${account.baseCurrencyIso}`}
        action={
          <>
            <Button
              label="Refresh prices"
              isLoading={refresh.isPending}
              clickAction={async () => {
                await refresh.mutateAsync();
              }}
            />
            {account.managementMode === "manual" && account.presentationRole === null && (
              <Button as={RouterLink} href={`/accounts/${id}/edit`} label="Edit account" />
            )}
          </>
        }
      />
      {account.managementMode === "synced" && (
        <Banner
          status="info"
          title="Connector-managed account"
          description="Account and position fields are read-only."
        />
      )}
      {account.totalIncomplete && (
        <Banner
          status="warning"
          title="Total is incomplete"
          description="Unpriced positions are excluded from this total."
        />
      )}
      {refresh.isError && (
        <Banner
          status="warning"
          title="Price refresh failed"
          description={errorMessage(refresh.error)}
        />
      )}
      {refresh.data !== undefined && refresh.data.failures.length > 0 && (
        <Banner
          status="warning"
          title="Some prices could not be refreshed"
          description={`${refresh.data.failures.length} quote${refresh.data.failures.length === 1 ? "" : "s"} kept their last-known values.`}
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
        {account.managementMode === "manual" && account.presentationRole === null && (
          <AddAssetsButton />
        )}
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

export function CreateAccountScreen({ custodianId }: { readonly custodianId: string }) {
  const custodian = useQuery(custodianQuery(custodianId));
  const assets = useQuery(assetsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: engineApi.createAccount,
    onSuccess: async (account) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.detail(custodianId) });
      await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const fiat = assets.data?.filter((asset) => asset.assetClass === "fiat") ?? [];
  const defaultValues: typeof CreateAccountInput.Encoded = {
    custodianId,
    name: "",
    baseCurrencyAssetId: "fiat:USD",
  };
  const form = useAppForm({
    defaultValues,
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(CreateAccountInput) },
    onSubmit: async ({ value }) =>
      mutation.mutateAsync(await Schema.decodeUnknownPromise(CreateAccountInput)(value)),
  });
  if (custodian.isPending || assets.isPending) return <PageState kind="pending" />;
  if (custodian.isError || assets.isError) return <PageState kind="error" />;
  if (custodian.data.managementMode !== "manual")
    return <PageState kind="error" message="Connector-managed custodians are read-only." />;
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: custodian.data.name, href: `/custodians/${custodianId}` },
          { label: "Add account" },
        ]}
      />
      <PageHeader title="Add account" subtitle={`Under ${custodian.data.name}`} />
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
          <form.SubmitButton label="Create account" />
        </FormFrame>
      </form.AppForm>
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(account.id) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.custodians.detail(account.custodianId),
        }),
      ]);
      await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deleteAccount(account.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.custodians.detail(account.custodianId),
      });
      await navigate({
        to: "/custodians/$custodianId",
        params: { custodianId: account.custodianId },
      });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const form = useAppForm({
    defaultValues: { name: account.name, baseCurrencyAssetId: account.baseCurrencyAssetId },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(UpdateAccountInput) },
    onSubmit: async ({ value }) =>
      update.mutateAsync(await Schema.decodeUnknownPromise(UpdateAccountInput)(value)),
  });
  if (assets.isPending) return <PageState kind="pending" />;
  const fiat = assets.data?.filter((asset) => asset.assetClass === "fiat") ?? [];
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Custodians", href: "/custodians" },
          { label: account.custodianName, href: `/custodians/${account.custodianId}` },
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
  if (query.data.managementMode !== "manual" || query.data.presentationRole !== null)
    return <PageState kind="error" message="Connector-managed accounts are read-only." />;
  return <LoadedEditAccount account={query.data} />;
}
