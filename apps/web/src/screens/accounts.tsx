import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Account, Position } from "@optimus/engine/api";
import { CreateAccountInput, UpdateAccountInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { engineApi } from "../api";
import {
  DeleteButton,
  FormError,
  PageHeader,
  PageState,
  ResourceCard,
  styles,
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { accountQuery, assetsQuery, custodianQuery, queryKeys } from "../queries";

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

function PositionTable({
  positions,
  account,
}: {
  readonly positions: ReadonlyArray<Position>;
  readonly account: Account;
}) {
  if (positions.length === 0) return <EmptyState title="No positions" isCompact />;
  return (
    <table {...stylex.props(styles.table)}>
      <thead>
        <tr>
          <th {...stylex.props(styles.cell)}>Asset</th>
          <th {...stylex.props(styles.cell, styles.numeric)}>Quantity</th>
          <th {...stylex.props(styles.cell, styles.numeric)}>Market price</th>
          <th {...stylex.props(styles.cell, styles.numeric)}>Value ({account.baseCurrencyIso})</th>
          <th {...stylex.props(styles.cell)} />
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={position.id}>
            <td {...stylex.props(styles.cell)}>
              <strong>{position.assetName}</strong>
              {position.assetSymbol && (
                <div {...stylex.props(styles.muted)}>{position.assetSymbol}</div>
              )}
            </td>
            <td {...stylex.props(styles.cell, styles.numeric)}>
              {number.format(position.quantity)}
            </td>
            <td {...stylex.props(styles.cell, styles.numeric)}>
              {position.price === null ? (
                "—"
              ) : (
                <>
                  <span>
                    {marketPrice.format(position.price.price)} {position.price.currencyIso}
                  </span>
                  <div {...stylex.props(styles.muted)}>
                    {position.price.isStale ? "Delayed · " : ""}
                    {sourceName(position.price.source)} ·{" "}
                    {quoteTime.format(new Date(position.price.observedAt))}
                  </div>
                </>
              )}
            </td>
            <td
              title={conversionDescription(position, account.baseCurrencyIso)}
              {...stylex.props(styles.cell, styles.numeric)}
            >
              {position.reportingValue === null
                ? "Unpriced"
                : formatValuedAmount(position.reportingValue, account.baseCurrencyIso)}
            </td>
            <td {...stylex.props(styles.cell)}>
              {account.managementMode === "manual" && (
                <Button
                  as={Link}
                  href={`/positions/${position.id}/edit`}
                  label="Edit"
                  size="sm"
                  variant="ghost"
                />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AccountDetailScreen({ id }: { readonly id: string }) {
  const query = useQuery(accountQuery(id));
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: engineApi.refreshPrices,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(id) });
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
      <PageHeader
        title={account.name}
        subtitle={`${account.custodianName} · Valuation currency ${account.baseCurrencyIso}`}
        action={
          <div {...stylex.props(styles.row)}>
            <Button
              label="Refresh prices"
              isLoading={refresh.isPending}
              clickAction={async () => {
                await refresh.mutateAsync();
              }}
            />
            {account.managementMode === "manual" && (
              <Button as={Link} href={`/accounts/${id}/edit`} label="Edit account" />
            )}
          </div>
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
        <div {...stylex.props(styles.row)}>
          <strong>Valued total</strong>
          <strong>{formatValuedAmount(account.total, account.baseCurrencyIso)}</strong>
        </div>
      </ResourceCard>
      <div {...stylex.props(styles.row)}>
        <h2>Positions</h2>
        {account.managementMode === "manual" && (
          <Button
            as={Link}
            href={`/accounts/${id}/positions/new`}
            label="Add position"
            variant="primary"
          />
        )}
      </div>
      <PositionTable positions={active} account={account} />
      {zero.length > 0 && (
        <ResourceCard>
          <Collapsible trigger={`Zero positions (${zero.length})`} defaultIsOpen={false}>
            <PositionTable positions={zero} account={account} />
          </Collapsible>
        </ResourceCard>
      )}
      {unpriced.length > 0 && (
        <ResourceCard>
          <Collapsible trigger={`Unpriced positions (${unpriced.length})`} defaultIsOpen={false}>
            <PositionTable positions={unpriced} account={account} />
          </Collapsible>
        </ResourceCard>
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
      <PageHeader title="Add account" subtitle={`Under ${custodian.data.name}`} />
      <FormError message={error} />
      <form.AppForm>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          {...stylex.props(styles.form)}
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
        </form>
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
      <PageHeader title={`Edit ${account.name}`} />
      <FormError message={error} />
      <form.AppForm>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          {...stylex.props(styles.form)}
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
        </form>
      </form.AppForm>
      <hr />
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
  if (query.data.managementMode !== "manual")
    return <PageState kind="error" message="Connector-managed accounts are read-only." />;
  return <LoadedEditAccount account={query.data} />;
}
