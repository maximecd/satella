import { Button, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import type { PositionEdit } from "@optimus/engine/api";
import { DecimalFromNonEmptyString } from "@optimus/engine/api";
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
import {
  compareDecimal,
  formatAmount,
  formatDecimal,
  formatSignedAmount,
  multiplyDecimal,
} from "../financial-number";
import { submitThenChangeValidation, useAppForm } from "../form";
import { useAssets, useDeletePosition, usePositionEdit, useUpdatePosition } from "../portfolio";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const PositionFormInput = Schema.Struct({
  quantity: DecimalFromNonEmptyString,
  averageUnitPurchasePrice: Schema.String,
  purchaseCurrencyAssetId: Schema.String,
});

export function EditPositionScreen({ positionId }: { readonly positionId: string }) {
  const query = usePositionEdit(positionId);
  const assets = useAssets();
  if (query.isPending || assets.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  if (assets.isError) return <PageState kind="error" message={errorMessage(assets.error)} />;
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
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);
  const update = useUpdatePosition(position.id, account.id);
  const remove = useDeletePosition(position.id, account.id);
  const initialAverage = position.averageUnitPurchasePrice;
  const canEditPurchasePrice = position.assetCategory !== "cash";
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
        setError(errorMessage(cause));
        return;
      }
      const payload: {
        quantity?: string;
        averageUnitPurchasePrice?: {
          price: string;
          currencyAssetId: string;
        } | null;
      } = {};
      if (account.connectionId === null) payload.quantity = quantity;
      if (canEditPurchasePrice) {
        if (resetRequested || averageText === "") {
          if (resetRequested || initialAverage?.source === "manual") {
            payload.averageUnitPurchasePrice = null;
          }
        } else {
          let price: string;
          try {
            price = await Schema.decodeUnknownPromise(DecimalFromNonEmptyString)(averageText);
          } catch {
            setError("Enter a valid average unit purchase price.");
            return;
          }
          if (compareDecimal(price, "0") <= 0) {
            setError("Average unit purchase price must be greater than zero.");
            return;
          }
          const unchangedConnectionValue =
            initialAverage?.source === "connection" &&
            initialAverage.price === price &&
            initialAverage.currencyAssetId === value.purchaseCurrencyAssetId;
          if (!unchangedConnectionValue) {
            payload.averageUnitPurchasePrice = {
              price,
              currencyAssetId: value.purchaseCurrencyAssetId,
            };
          }
        }
      }
      try {
        await update.mutateAsync(payload);
        await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
  });

  const currencyOptions = cashAssets.map((asset) => ({
    value: asset.id,
    label: asset.symbol ?? asset.name,
  }));
  const title = `Edit ${position.assetName}`;
  return (
    <>
      <PageBreadcrumbs
        items={
          account.connectionId === null
            ? [
                { label: "Dashboard", href: "/" },
                { label: account.name, href: `/accounts/${account.id}` },
                { label: "Edit" },
              ]
            : [
                { label: "Settings", href: "/settings" },
                { label: "Connections", href: "/settings/connections" },
                {
                  label: account.connectionName ?? "Connection",
                  href: `/settings/connections/${account.connectionId}`,
                },
                { label: account.name, href: `/accounts/${account.id}` },
                { label: "Edit" },
              ]
        }
      />
      <PageHeader
        title={title}
        subtitle={
          !canEditPurchasePrice
            ? "Cash positions are excluded from Unrealized P&L."
            : account.connectionId === null
              ? "Set quantity to zero to preserve the position and its history."
              : "Quantity is supplied by the Connection; purchase price remains editable."
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
              <field.TextField label="Quantity" number disabled={account.connectionId !== null} />
            )}
          />
          {canEditPurchasePrice ? (
            <>
              <form.AppField
                name="averageUnitPurchasePrice"
                children={(field) => (
                  <field.TextField
                    label="Average unit purchase price"
                    number
                    optional
                    onValueChange={() => setResetRequested(false)}
                  />
                )}
              />
              <form.AppField
                name="purchaseCurrencyAssetId"
                children={(field) => (
                  <field.SelectField label="Purchase currency" options={currencyOptions} />
                )}
              />
              {initialAverage?.source === "connection" ? (
                <Text color="fg.muted" fontSize="sm">
                  Current value supplied by {account.connectionName ?? "the Connection"}; editing it
                  creates a manual override.
                </Text>
              ) : null}
              {position.acquisitionCost !== null ? (
                <Stack gap="0">
                  <Text color="fg.muted" fontSize="sm">
                    Acquisition cost
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
                Unrealized P&amp;L:{" "}
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
            <form.SubmitButton label="Save changes" />
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
                Reset purchase price
              </Button>
            ) : null}
          </Stack>
        </FormFrame>
      </form.AppForm>
      {account.connectionId === null ? (
        <DeleteButton
          entity="position"
          isPending={remove.isPending}
          onDelete={async () => {
            try {
              await remove.mutateAsync();
              await navigate({ to: "/accounts/$accountId", params: { accountId: account.id } });
            } catch (cause) {
              setError(errorMessage(cause));
            }
          }}
        />
      ) : null}
    </>
  );
}
