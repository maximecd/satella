import { useNavigate } from "@tanstack/react-router";
import type { Asset } from "@satella-app/engine/api";
import { DecimalFromNonEmptyString } from "@satella-app/engine/api";
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
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { useAsset, useAssets, useDeleteAsset, useMaintainAsset } from "../portfolio";

const MANUAL_ASSET_CATEGORIES = new Set(["other"]);

const EditAssetForm = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.String,
  price: Schema.String,
  currencyAssetId: Schema.String,
});

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

function LoadedAssetScreen({
  asset,
  allAssets,
}: {
  readonly asset: Asset;
  readonly allAssets: ReadonlyArray<Asset>;
}) {
  const { t } = useTranslation();
  const requestFailed = t("errors.requestFailed");
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
              price: await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(decoded.price),
              currencyAssetId: decoded.currencyAssetId,
            }
          : undefined;
        const input = {
          name: decoded.name,
          symbol: decoded.symbol,
        };
        if (manualPrice !== undefined) Object.assign(input, { manualPrice });
        await save.mutateAsync(input);
      } catch (cause) {
        setError(errorMessage(cause, requestFailed));
      }
    },
  });
  if (!MANUAL_ASSET_CATEGORIES.has(asset.assetCategory)) {
    return (
      <>
        <PageBreadcrumbs
          items={[{ label: t("assets.breadcrumbs.dashboard"), href: "/" }, { label: asset.name }]}
        />
        <PageHeader title={asset.name} />
        <PageState kind="error" message={t("assets.notEditable")} />
      </>
    );
  }
  const fiat = allAssets.filter((candidate) => candidate.assetCategory === "cash");
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("assets.breadcrumbs.dashboard"), href: "/" },
          { label: t("assets.editTitle", { name: asset.name }) },
        ]}
      />
      <PageHeader title={t("assets.editTitle", { name: asset.name })} />
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
            children={(field) => <field.TextField label={t("assets.form.name")} />}
          />
          <form.AppField
            name="symbol"
            children={(field) => <field.TextField label={t("assets.form.symbol")} />}
          />
          <form.AppField
            name="price"
            children={(field) => <field.TextField label={t("assets.form.price")} number />}
          />
          <form.AppField
            name="currencyAssetId"
            children={(field) => (
              <field.SelectField
                label={t("assets.form.priceCurrency")}
                options={fiat.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.symbol ?? candidate.name,
                }))}
              />
            )}
          />
          <form.SubmitButton label={t("assets.form.save")} />
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
            setError(errorMessage(cause, requestFailed));
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
