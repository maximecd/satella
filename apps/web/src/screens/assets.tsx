import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Asset } from "@optimus/engine/api";
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
import { assetQuery, assetsQuery, queryKeys } from "../queries";

const CustomAssetForm = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  symbol: Schema.String,
  price: Schema.String,
  currencyAssetId: Schema.String,
});

const EditAssetForm = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  symbol: Schema.String,
  price: Schema.String,
  currencyAssetId: Schema.String,
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function AssetListScreen() {
  const query = useQuery(assetsQuery);
  const [search, setSearch] = useState("");
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const needle = search.trim().toLocaleLowerCase();
  const assets = query.data.filter(
    (asset) =>
      needle.length === 0 ||
      asset.name.toLocaleLowerCase().includes(needle) ||
      asset.symbol?.toLocaleLowerCase().includes(needle),
  );
  return (
    <>
      <PageHeader
        title="Assets"
        subtitle="The shared catalog used by positions in every custodian."
        action={
          <Button
            as={Link}
            href="/assets/custom/new"
            label="Create manual asset"
            variant="primary"
          />
        }
      />
      <TextInput
        label="Search assets"
        isLabelHidden
        placeholder="Search by name or symbol"
        value={search}
        onChange={setSearch}
        hasClear
        width="100%"
      />
      {assets.length === 0 ? (
        <EmptyState title="No matching assets" />
      ) : (
        <div {...stylex.props(styles.stack)}>
          {assets.map((asset) => (
            <ResourceCard key={asset.id}>
              <div {...stylex.props(styles.row)}>
                <div>
                  <strong>{asset.name}</strong>
                  <div {...stylex.props(styles.muted)}>
                    {asset.symbol ?? "No symbol"} · {asset.assetClass} ·{" "}
                    {asset.price === null
                      ? "Unpriced"
                      : `${asset.price.price} ${asset.price.currencyIso} (${asset.price.source})`}
                  </div>
                </div>
                <Button
                  as={Link}
                  href={`/assets/${asset.id}/edit`}
                  label={asset.assetClass === "custom" ? "Edit" : "Inspect"}
                />
              </div>
            </ResourceCard>
          ))}
        </div>
      )}
    </>
  );
}

export function CreateCustomAssetScreen() {
  const assets = useQuery(assetsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (value: typeof CustomAssetForm.Type) => {
      const asset = await engineApi.createAsset({
        assetClass: "custom",
        name: value.name,
        ...(value.symbol.trim() ? { symbol: value.symbol.trim() } : {}),
        identifiers: [],
      });
      if (value.price.trim()) {
        const price = await Schema.decodeUnknownPromise(Schema.NumberFromString)(value.price);
        return engineApi.setManualPrice(asset.id, {
          price,
          currencyAssetId: value.currencyAssetId,
        });
      }
      return asset;
    },
    onSuccess: async (asset) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
      await navigate({ to: "/assets/$assetId/edit", params: { assetId: asset.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const fiat = assets.data?.filter((asset) => asset.assetClass === "fiat") ?? [];
  const form = useAppForm({
    defaultValues: { name: "", symbol: "", price: "", currencyAssetId: "fiat:USD" },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(CustomAssetForm) },
    onSubmit: async ({ value }) =>
      mutation.mutateAsync(await Schema.decodeUnknownPromise(CustomAssetForm)(value)),
  });
  if (assets.isPending) return <PageState kind="pending" />;
  return (
    <>
      <PageHeader
        title="Create manual asset"
        subtitle="Custom assets can be left unpriced and priced later."
      />
      <FormError message={error} />
      <form.AppForm>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          {...stylex.props(styles.form)}
        >
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.AppField
            name="symbol"
            children={(field) => <field.TextField label="Symbol (optional)" />}
          />
          <form.AppField
            name="price"
            children={(field) => <field.TextField label="Initial price (optional)" number />}
          />
          <form.AppField
            name="currencyAssetId"
            children={(field) => (
              <field.SelectField
                label="Price currency"
                options={fiat.map((asset) => ({
                  value: asset.id,
                  label: asset.symbol ?? asset.name,
                }))}
              />
            )}
          />
          <form.SubmitButton label="Create asset" />
        </form>
      </form.AppForm>
    </>
  );
}

function LoadedAssetScreen({
  asset,
  allAssets,
}: {
  readonly asset: Asset;
  readonly allAssets: ReadonlyArray<Asset>;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: typeof EditAssetForm.Type) => {
      const updated = await engineApi.updateAsset(asset.id, {
        name: value.name,
        ...(value.symbol.trim() ? { symbol: value.symbol.trim() } : {}),
      });
      if (value.price.trim()) {
        const price = await Schema.decodeUnknownPromise(Schema.NumberFromString)(value.price);
        return engineApi.setManualPrice(asset.id, {
          price,
          currencyAssetId: value.currencyAssetId,
        });
      }
      return updated;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail(asset.id) }),
      ]);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deleteAsset(asset.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
      await navigate({ to: "/assets" });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const form = useAppForm({
    defaultValues: {
      name: asset.name,
      symbol: asset.symbol ?? "",
      price: asset.price === null ? "" : String(asset.price.price),
      currencyAssetId: asset.price?.currencyAssetId ?? "fiat:USD",
    },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(EditAssetForm) },
    onSubmit: async ({ value }) =>
      save.mutateAsync(await Schema.decodeUnknownPromise(EditAssetForm)(value)),
  });
  if (asset.assetClass !== "custom") {
    return (
      <>
        <PageHeader
          title={asset.name}
          subtitle={`${asset.assetClass} · read-only provider metadata`}
        />
        <Banner
          status="info"
          title="Automatically managed asset"
          description="Provider identifiers and automatic prices cannot be edited manually."
        />
        <ResourceCard>
          <dl>
            {asset.identifiers.map((identifier) => (
              <div key={`${identifier.type}:${identifier.value}`}>
                <dt>{identifier.type}</dt>
                <dd>{identifier.value}</dd>
              </div>
            ))}
          </dl>
          {asset.price && (
            <p>
              Latest: {asset.price.price} {asset.price.currencyIso} · {asset.price.source} ·{" "}
              {new Date(asset.price.observedAt).toLocaleString()}
              {asset.price.isStale ? " · Delayed" : ""}
            </p>
          )}
        </ResourceCard>
      </>
    );
  }
  const fiat = allAssets.filter((candidate) => candidate.assetClass === "fiat");
  return (
    <>
      <PageHeader title={`Edit ${asset.name}`} />
      <FormError message={error} />
      <form.AppForm>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          {...stylex.props(styles.form)}
        >
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.AppField
            name="symbol"
            children={(field) => <field.TextField label="Symbol (optional)" />}
          />
          <form.AppField
            name="price"
            children={(field) => <field.TextField label="Manual price (optional)" number />}
          />
          <form.AppField
            name="currencyAssetId"
            children={(field) => (
              <field.SelectField
                label="Price currency"
                options={fiat.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.symbol ?? candidate.name,
                }))}
              />
            )}
          />
          <form.SubmitButton label="Save asset" />
        </form>
      </form.AppForm>
      <hr />
      <DeleteButton
        entity="asset"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}

export function AssetDetailScreen({ id }: { readonly id: string }) {
  const query = useQuery(assetQuery(id));
  const all = useQuery(assetsQuery);
  if (query.isPending || all.isPending) return <PageState kind="pending" />;
  if (query.isError || all.isError) return <PageState kind="error" />;
  return <LoadedAssetScreen asset={query.data} allAssets={all.data} />;
}
