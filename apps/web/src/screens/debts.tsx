import { Box, Button, Text } from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { DebtKind, DecimalFromNonEmptyString, type Debt } from "@satella-app/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import {
  DeleteButton,
  FormError,
  FormFrame,
  NavRow,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import { EmptyState } from "../components/ui/empty-state";
import { notify } from "../components/ui/toaster";
import { submitThenChangeValidation, useAppForm } from "../form";
import { formatAmount } from "../financial-number";
import {
  useAssets,
  useCreateDebt,
  useDebt,
  useDebts,
  useDeleteDebt,
  useUpdateDebt,
} from "../portfolio";

const DebtFormValues = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  kind: DebtKind,
  amount: DecimalFromNonEmptyString,
  currencyAssetId: Schema.String,
  dueDate: Schema.String.check(Schema.isPattern(/^(?:\d{4}-\d{2}-\d{2})?$/)),
});

const kindLabel = (kind: Debt["kind"], t: TFunction) =>
  kind === "tax"
    ? t("debts.kinds.tax")
    : kind === "loan"
      ? t("debts.kinds.loan")
      : t("debts.kinds.other");

const daysUntil = (dueDate: string) => {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueUtc = Date.parse(`${dueDate}T00:00:00.000Z`);
  return Math.round((dueUtc - todayUtc) / 86_400_000);
};

const dueLabel = (dueDate: string | null, t: TFunction) => {
  if (dueDate === null) return undefined;
  const days = daysUntil(dueDate);
  if (days === 0) return t("debts.dueToday");
  return days > 0 ? t("debts.dueInDays", { count: days }) : t("debts.dueAgoDays", { count: -days });
};

export function DebtsScreen() {
  const { t } = useTranslation();
  const query = useDebts();
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={describeError(query.error)} />;
  const debts = query.data;
  return (
    <>
      <PageHeader
        title={t("debts.title")}
        action={
          <Button asChild colorPalette="blue">
            <RouterLink to="/debts/new">{t("debts.add")}</RouterLink>
          </Button>
        }
      />
      {debts.length === 0 ? (
        <EmptyState title={t("debts.empty.title")} description={t("debts.empty.description")} />
      ) : (
        <Box as="ul" m="0" p="0">
          {debts.map((debt) => {
            const description = [kindLabel(debt.kind, t), dueLabel(debt.dueDate, t)].filter(
              (part): part is string => part !== undefined,
            );
            return (
              <NavRow
                key={debt.id}
                href={`/debts/${debt.id}/edit`}
                label={debt.name}
                description={description.join(" · ")}
                endContent={
                  <Text fontVariantNumeric="tabular-nums">
                    {formatAmount(debt.amount, debt.currencyIso)}
                  </Text>
                }
              />
            );
          })}
        </Box>
      )}
    </>
  );
}

function DebtForm({ debt }: { readonly debt: Debt | null }) {
  const { t } = useTranslation();
  const assets = useAssets();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const create = useCreateDebt();
  const update = useUpdateDebt(debt?.id ?? "");
  const remove = useDeleteDebt(debt?.id ?? "");
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  const form = useAppForm({
    defaultValues: {
      name: debt?.name ?? "",
      kind: debt?.kind ?? "other",
      amount: debt?.amount ?? "",
      currencyAssetId: debt?.currencyAssetId ?? "",
      dueDate: debt?.dueDate ?? "",
    },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(DebtFormValues) },
    onSubmit: async ({ value }) => {
      const values = await Schema.decodeUnknownPromise(DebtFormValues)(value);
      const input = { ...values, dueDate: values.dueDate === "" ? null : values.dueDate };
      try {
        if (debt === null) {
          await create.mutateAsync(input);
        } else {
          await update.mutateAsync(input);
        }
        notify.success(t("debts.saved"));
        await navigate({ to: "/debts" });
      } catch (cause) {
        setError(describeError(cause));
      }
    },
  });
  if (assets.isPending) return <PageState kind="pending" />;
  const fiat = assets.data?.filter((asset) => asset.assetCategory === "cash") ?? [];
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("debts.breadcrumbs.debts"), href: "/debts" },
          debt === null ? { label: t("debts.add") } : { label: t("debts.breadcrumbs.edit") },
        ]}
      />
      <PageHeader
        title={debt === null ? t("debts.add") : t("debts.editTitle", { name: debt.name })}
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
            name="name"
            children={(field) => <field.TextField label={t("debts.form.name")} />}
          />
          <form.AppField
            name="kind"
            children={(field) => (
              <field.SelectField
                label={t("debts.form.kind")}
                options={[
                  { value: "tax", label: t("debts.kinds.tax") },
                  { value: "loan", label: t("debts.kinds.loan") },
                  { value: "other", label: t("debts.kinds.other") },
                ]}
              />
            )}
          />
          <form.AppField
            name="amount"
            children={(field) => <field.TextField label={t("debts.form.amount")} number />}
          />
          <form.AppField
            name="currencyAssetId"
            children={(field) => (
              <field.SelectField
                label={t("debts.form.currency")}
                options={fiat.map((asset) => ({
                  value: asset.id,
                  label: asset.symbol ?? asset.name,
                }))}
              />
            )}
          />
          <form.AppField
            name="dueDate"
            children={(field) => <field.DateField label={t("debts.form.dueDate")} />}
          />
          <form.SubmitButton label={debt === null ? t("debts.add") : t("accounts.saveChanges")} />
        </FormFrame>
      </form.AppForm>
      {debt === null ? null : (
        <DeleteButton
          entity="debt"
          isPending={remove.isPending}
          onDelete={async () => {
            try {
              await remove.mutateAsync();
              await navigate({ to: "/debts" });
            } catch (cause) {
              setError(describeError(cause));
            }
          }}
        />
      )}
    </>
  );
}

export function DebtFormScreen({ id }: { readonly id?: string }) {
  const { t } = useTranslation();
  const query = useDebt(id ?? "");
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  if (id === undefined) return <DebtForm debt={null} />;
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={describeError(query.error)} />;
  return <DebtForm debt={query.data} />;
}
