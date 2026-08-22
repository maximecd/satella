import { Button, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import type { PositionEdit, UpdatePositionInput } from "@satella-app/engine/api";
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
import {
  compareDecimal,
  formatAmount,
  formatDecimal,
  formatSignedAmount,
  multiplyDecimal,
} from "../financial-number";
import { submitThenChangeValidation, useAppForm } from "../form";
import { useAssets, useDeletePosition, usePositionEdit, useUpdatePosition } from "../portfolio";

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

const PositionFormInput = Schema.Struct({
  quantity: DecimalFromNonEmptyString,
  averageUnitPurchasePrice: Schema.String,
  purchaseCurrencyAssetId: Schema.String,
});

type PositionUpdatePayload = {
  quantity?: UpdatePositionInput["quantity"];
  averageUnitPurchasePrice?: UpdatePositionInput["averageUnitPurchasePrice"];
};

export function EditPositionScreen({ positionId }: { readonly positionId: string }) {
  const { t } = useTranslation();
  const query = usePositionEdit(positionId);
  const assets = useAssets();
  if (query.isPending || assets.isPending) return <PageState kind="pending" />;
  if (query.isError)
    return (
      <PageState kind="error" message={errorMessage(query.error, t("errors.requestFailed"))} />
    );
  if (assets.isError)
    return (
      <PageState kind="error" message={errorMessage(assets.error, t("errors.requestFailed"))} />
    );
  return <LoadedEditPosition edit={query.data} cashAssets={assets.data} />;
}

function LoadedEditPosition({
  edit,
  cashAssets,
}: {
  readonly edit: PositionEdit;
  readonly cashAssets: ReadonlyArray<{
    readonly id: string;
    readonly symbol: string | null;
    readonly name: string;
  }>;
}) {
  const { position, account } = edit;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);
  const update = useUpdatePosition(position.id, account.id);
  const remove = useDeletePosition(position.id, account.id);
  const initialAverage = position.averageUnitPurchasePrice;
  const canEditPurchasePrice = position.assetCategory !== "cash";
  const isManual = account.connectorAccountId === null;
  const requestFailed = t("errors.requestFailed");
  const accountLabel = account.isDefaultCustodian ? t("positions.otherHoldings") : account.name;
  const form = useAppForm({
    defaultValues: {
      quantity: position.quantity,
      averageUnitPurchasePrice: initialAverage?.price ?? "",
      purchaseCurrencyAssetId: initialAverage?.currencyAssetId ?? account.baseCurrencyAssetId,
    },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(PositionFormInput) },
    onSubmit: async ({ value }) => {
      setError(null);
      const averageText = value.averageUnitPurchasePrice.trim();
      let quantity: string;
      try {
        quantity = await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(value.quantity);
      } catch (cause) {
        setError(errorMessage(cause, requestFailed));
        return;
      }
      const payload: PositionUpdatePayload = {};
      if (isManual) Object.assign(payload, { quantity });
      if (canEditPurchasePrice) {
        if (resetRequested || averageText === "") {
          if (resetRequested || initialAverage?.source === "manual") {
            Object.assign(payload, { averageUnitPurchasePrice: null });
          }
        } else {
          let price: string;
          try {
            price = await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(averageText);
          } catch {
            setError(t("positions.invalidAveragePrice"));
            return;
          }
          if (compareDecimal(price, "0") <= 0) {
            setError(t("positions.averagePriceNotPositive"));
            return;
          }
          const unchangedSyncedValue =
            initialAverage?.source === "synced" &&
            initialAverage.price === price &&
            initialAverage.currencyAssetId === value.purchaseCurrencyAssetId;
          if (!unchangedSyncedValue) {
            Object.assign(payload, {
              averageUnitPurchasePrice: {
                price,
                currencyAssetId: value.purchaseCurrencyAssetId,
              },
            });
          }
        }
      }
      try {
        await update.mutateAsync(payload);
        await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
      } catch (cause) {
        setError(errorMessage(cause, requestFailed));
      }
    },
  });

  const currencyOptions = cashAssets.map((asset) => ({
    value: asset.id,
    label: asset.symbol ?? asset.name,
  }));
  const title = t("positions.editTitle", { name: position.assetName });
  return (
    <>
      <PageBreadcrumbs
        items={
          account.connectorAccountId === null
            ? [
                { label: t("positions.breadcrumbs.dashboard"), href: "/" },
                { label: accountLabel, href: `/accounts/${account.id}` },
                { label: t("positions.breadcrumbs.edit") },
              ]
            : [
                { label: t("positions.breadcrumbs.settings"), href: "/settings" },
                { label: t("positions.breadcrumbs.custodians"), href: "/settings/custodians" },
                {
                  label: account.custodianName,
                  href: `/settings/custodians/${account.custodianId}`,
                },
                { label: accountLabel, href: `/accounts/${account.id}` },
                { label: t("positions.breadcrumbs.edit") },
              ]
        }
      />
      <PageHeader
        title={title}
        subtitle={
          !canEditPurchasePrice
            ? t("positions.cashSubtitle")
            : isManual
              ? t("positions.manualSubtitle")
              : t("positions.syncedSubtitle", { custodian: account.custodianName })
        }
      />
      <FormError message={error} />
      <form.AppForm>
        <FormFrame
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField
            name="quantity"
            children={(field) => (
              <field.TextField label={t("positions.quantityLabel")} number disabled={!isManual} />
            )}
          />
          {canEditPurchasePrice ? (
            <>
              <form.AppField
                name="averageUnitPurchasePrice"
                children={(field) => (
                  <field.TextField
                    label={t("positions.averageUnitPurchasePriceLabel")}
                    number
                    optional
                    onValueChange={() => setResetRequested(false)}
                  />
                )}
              />
              <form.AppField
                name="purchaseCurrencyAssetId"
                children={(field) => (
                  <field.SelectField
                    label={t("positions.purchaseCurrencyLabel")}
                    options={currencyOptions}
                  />
                )}
              />
              {initialAverage?.source === "synced" ? (
                <Text color="fg.muted" fontSize="sm">
                  {t("positions.syncedOverrideNote", { custodian: account.custodianName })}
                </Text>
              ) : null}
              {position.acquisitionCost !== null ? (
                <Stack gap="0">
                  <Text color="fg.muted" fontSize="sm">
                    {t("positions.acquisitionCost")}
                  </Text>
                  <Text fontVariantNumeric="tabular-nums">
                    {formatAmount(
                      position.acquisitionCost,
                      position.averageUnitPurchasePrice?.currencyIso ?? account.baseCurrencyIso,
                    )}
                  </Text>
                </Stack>
              ) : null}
              <Text
                fontVariantNumeric="tabular-nums"
                color={
                  position.unrealizedPnl === null
                    ? "fg.muted"
                    : compareDecimal(position.unrealizedPnl, "0") > 0
                      ? "green.fg"
                      : compareDecimal(position.unrealizedPnl, "0") < 0
                        ? "red.fg"
                        : "fg.muted"
                }
              >
                {t("positions.unrealizedPnlLabel")}{" "}
                {position.unrealizedPnl === null
                  ? "—"
                  : `${formatSignedAmount(position.unrealizedPnl, account.baseCurrencyIso)}${
                      position.unrealizedPnlPercent === null
                        ? ""
                        : ` (${formatDecimal(
                            multiplyDecimal(position.unrealizedPnlPercent, "100"),
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}%)`
                    }`}
              </Text>
            </>
          ) : null}
          <Stack direction="row" gap="2" wrap="wrap">
            <form.SubmitButton label={t("positions.saveChanges")} />
            {canEditPurchasePrice ? (
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending || initialAverage === null}
                onClick={() => {
                  setResetRequested(true);
                  form.setFieldValue("averageUnitPurchasePrice", "");
                }}
              >
                {t("positions.resetPurchasePrice")}
              </Button>
            ) : null}
          </Stack>
        </FormFrame>
      </form.AppForm>
      {isManual ? (
        <DeleteButton
          entity="position"
          isPending={remove.isPending}
          onDelete={async () => {
            try {
              await remove.mutateAsync();
              await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
            } catch (cause) {
              setError(errorMessage(cause, requestFailed));
            }
          }}
        />
      ) : null}
    </>
  );
}
