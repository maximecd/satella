import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Asset } from "@optimus/engine/api";
import { NumberFromNonEmptyString } from "@optimus/engine/api";
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
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { assetQuery, assetsQuery, queryKeys } from "../queries";

const MANUAL_ASSET_CATEGORIES = new Set(["bonds", "derivatives", "commodities", "other"]);

const EditAssetForm = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.String,
  price: Schema.String,
  currencyAssetId: Schema.String,
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

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
        const price = await Schema.decodeUnknownPromise(NumberFromNonEmptyString)(value.price);
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
      await navigate({ to: "/" });
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
    validators: { onDynamic: Schema.toStandardSchemaV1(EditAssetForm) },
    onSubmit: async ({ value }) =>
      save.mutateAsync(await Schema.decodeUnknownPromise(EditAssetForm)(value)),
  });
  if (!MANUAL_ASSET_CATEGORIES.has(asset.assetCategory)) {
    return (
      <>
        <PageBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: asset.name }]} />
        <PageHeader title={asset.name} />
        <PageState
          kind="error"
          message="This asset is maintained by a Connection and cannot be edited."
        />
      </>
    );
  }
  const fiat = allAssets.filter((candidate) => candidate.assetCategory === "cash");
  return (
    <>
      <PageBreadcrumbs
        items={[{ label: "Dashboard", href: "/" }, { label: `Edit ${asset.name}` }]}
      />
      <PageHeader title={`Edit ${asset.name}`} />
      <FormError message={error} />
      <form.AppForm>
        <FormFrame
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
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
        </FormFrame>
      </form.AppForm>
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
