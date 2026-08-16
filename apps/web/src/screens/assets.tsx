import { useNavigate } from "@tanstack/react-router";
import type { Asset } from "@optimus/engine/api";
import { NumberFromNonEmptyString } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";

import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { useAsset, useAssets, useDeleteAsset, useMaintainAsset } from "../portfolio";

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
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const save = useMaintainAsset(asset.id);
  const remove = useDeleteAsset(asset.id);
  const form = useAppForm({
    defaultValues: {
      name: asset.name,
      symbol: asset.symbol ?? "",
      price: asset.price === null ? "" : String(asset.price.price),
      currencyAssetId: asset.price?.currencyAssetId ?? "fiat:USD",
    },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(EditAssetForm) },
    onSubmit: async ({ value }) => {
      try {
        const decoded = await Schema.decodeUnknownPromise(EditAssetForm)(value);
        const manualPrice = decoded.price.trim()
          ? {
              price: await Schema.decodeUnknownPromise(NumberFromNonEmptyString)(decoded.price),
              currencyAssetId: decoded.currencyAssetId,
            }
          : undefined;
        await save.mutateAsync({
          name: decoded.name,
          symbol: decoded.symbol,
          ...(manualPrice === undefined ? {} : { manualPrice }),
        });
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
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

export function AssetDetailScreen({ id }: { readonly id: string }) {
  const query = useAsset(id);
  const all = useAssets();
  if (query.isPending || all.isPending) return <PageState kind="pending" />;
  if (query.isError || all.isError) return <PageState kind="error" />;
  return <LoadedAssetScreen key={query.data.updatedAt} asset={query.data} allAssets={all.data} />;
}
