import {
  Button,
  Card,
  Checkbox,
  Heading,
  Link,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { DecimalFromNonEmptyString, type Goal } from "@satella-app/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import {
  DeleteButton,
  FormError,
  FormFrame,
  PageBreadcrumbs,
  PageHeader,
  PageState,
} from "../components";
import { EmptyState } from "../components/ui/empty-state";
import { Field } from "../components/ui/field";
import { notify } from "../components/ui/toaster";
import { submitThenChangeValidation, useAppForm } from "../form";
import { compareDecimal, divideDecimal, formatAmount, multiplyDecimal } from "../financial-number";
import {
  useAccountGroups,
  useAssets,
  useCreateGoal,
  useDeleteGoal,
  useGoal,
  useGoals,
  useSettings,
  useUpdateGoal,
} from "../portfolio";

const GoalFormValues = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  amount: DecimalFromNonEmptyString,
  currencyAssetId: Schema.String,
  targetDate: Schema.String.check(Schema.isPattern(/^(?:\d{4}-\d{2}-\d{2})?$/)),
  accountIds: Schema.mutable(Schema.Array(Schema.String)),
});

const daysUntil = (targetDate: string) => {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueUtc = Date.parse(`${targetDate}T00:00:00.000Z`);
  return Math.round((dueUtc - todayUtc) / 86_400_000);
};

const targetLabel = (targetDate: string | null, t: TFunction) => {
  if (targetDate === null) return undefined;
  const days = daysUntil(targetDate);
  if (days === 0) return t("goals.targetToday");
  return days > 0
    ? t("goals.targetInDays", { count: days })
    : t("goals.targetAgoDays", { count: -days });
};

const progressValue = (currentAmount: string, amount: string) => {
  if (compareDecimal(amount, "0") <= 0) return 0;
  const percent = Number(divideDecimal(multiplyDecimal(currentAmount, "100"), amount));
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
};

export function GoalsScreen() {
  const { t } = useTranslation();
  const query = useGoals();
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={describeError(query.error)} />;
  const goals = query.data;
  return (
    <>
      <PageHeader
        title={t("goals.title")}
        action={
          <Button asChild colorPalette="blue">
            <RouterLink to="/goals/new">{t("goals.add")}</RouterLink>
          </Button>
        }
      />
      {goals.length === 0 ? (
        <EmptyState title={t("goals.empty.title")} description={t("goals.empty.description")} />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
          {goals.map((goal) => {
            const date = targetLabel(goal.targetDate, t);
            const accounts = goal.contributingAccounts.map((account) => account.name).join(", ");
            return (
              <Link key={goal.id} asChild _hover={{ textDecoration: "none" }}>
                <RouterLink to="/goals/$goalId/edit" params={{ goalId: goal.id }}>
                  <Card.Root h="full">
                    <Card.Body>
                      <Stack gap="3">
                        <Heading size="md">{goal.name}</Heading>
                        {date === undefined ? null : (
                          <Text color="fg.muted" fontSize="sm">
                            {date}
                          </Text>
                        )}
                        <Progress.Root
                          value={progressValue(goal.currentAmount, goal.amount)}
                          max={100}
                          colorPalette="blue"
                        >
                          <Progress.Track>
                            <Progress.Range />
                          </Progress.Track>
                        </Progress.Root>
                        <Text fontVariantNumeric="tabular-nums">
                          {t("goals.progress", {
                            current: formatAmount(goal.currentAmount, goal.currencyIso),
                            target: formatAmount(goal.amount, goal.currencyIso),
                          })}
                        </Text>
                        {accounts.length === 0 ? null : (
                          <Text color="fg.muted" fontSize="sm">
                            {accounts}
                          </Text>
                        )}
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                </RouterLink>
              </Link>
            );
          })}
        </SimpleGrid>
      )}
    </>
  );
}

function GoalForm({ goal }: { readonly goal: Goal | null }) {
  const assets = useAssets();
  const settings = useSettings();
  const accountGroups = useAccountGroups();
  const goals = useGoals();
  if (assets.isPending || settings.isPending || accountGroups.isPending || goals.isPending) {
    return <PageState kind="pending" />;
  }
  return (
    <GoalFormFields
      goal={goal}
      reportingCurrencyAssetId={settings.data?.reportingCurrency.assetId ?? ""}
      fiat={(assets.data ?? []).filter((asset) => asset.assetCategory === "cash")}
      groups={accountGroups.data ?? []}
      goals={goals.data ?? []}
    />
  );
}

function GoalFormFields({
  goal,
  reportingCurrencyAssetId,
  fiat,
  groups,
  goals,
}: {
  readonly goal: Goal | null;
  readonly reportingCurrencyAssetId: string;
  readonly fiat: ReadonlyArray<{
    readonly id: string;
    readonly symbol: string | null;
    readonly name: string;
  }>;
  readonly groups: NonNullable<ReturnType<typeof useAccountGroups>["data"]>;
  readonly goals: ReadonlyArray<Goal>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const create = useCreateGoal();
  const update = useUpdateGoal(goal?.id ?? "");
  const remove = useDeleteGoal(goal?.id ?? "");
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  const form = useAppForm({
    defaultValues: {
      name: goal?.name ?? "",
      amount: goal?.amount ?? "",
      currencyAssetId: goal?.currencyAssetId ?? reportingCurrencyAssetId,
      targetDate: goal?.targetDate ?? "",
      accountIds: goal?.contributingAccounts.map((account) => account.id) ?? [],
    },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(GoalFormValues) },
    onSubmit: async ({ value }) => {
      const values = await Schema.decodeUnknownPromise(GoalFormValues)(value);
      const input = { ...values, targetDate: values.targetDate === "" ? null : values.targetDate };
      try {
        if (goal === null) {
          await create.mutateAsync(input);
        } else {
          await update.mutateAsync(input);
        }
        notify.success(t("goals.saved"));
        await navigate({ to: "/goals" });
      } catch (cause) {
        setError(describeError(cause));
      }
    },
  });
  const takenByGoal = new Map<string, string>();
  for (const other of goals) {
    if (other.id === goal?.id) continue;
    for (const account of other.contributingAccounts) {
      takenByGoal.set(account.id, other.name);
    }
  }
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("goals.breadcrumbs.goals"), href: "/goals" },
          goal === null ? { label: t("goals.add") } : { label: t("goals.breadcrumbs.edit") },
        ]}
      />
      <PageHeader
        title={goal === null ? t("goals.add") : t("goals.editTitle", { name: goal.name })}
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
            children={(field) => <field.TextField label={t("goals.form.name")} />}
          />
          <form.AppField
            name="amount"
            children={(field) => <field.TextField label={t("goals.form.amount")} number />}
          />
          <form.AppField
            name="currencyAssetId"
            children={(field) => (
              <field.SelectField
                label={t("goals.form.currency")}
                options={fiat.map((asset) => ({
                  value: asset.id,
                  label: asset.symbol ?? asset.name,
                }))}
              />
            )}
          />
          <form.AppField
            name="targetDate"
            children={(field) => <field.DateField label={t("goals.form.targetDate")} />}
          />
          <form.Field
            name="accountIds"
            children={(field) => (
              <Stack gap="4">
                <Text fontWeight="medium">
                  {t("goals.form.accounts")}{" "}
                  <Text as="span" color="fg.muted" fontWeight="normal">
                    {t("goals.form.accountsOptional")}
                  </Text>
                </Text>
                {groups.map((group) => (
                  <Stack key={group.custodianId} gap="2">
                    <Text color="fg.muted">{group.name}</Text>
                    {group.accounts.map((row) => {
                      const takenBy = takenByGoal.get(row.accountId);
                      const checked = field.state.value.includes(row.accountId);
                      const label =
                        takenBy === undefined
                          ? row.accountName
                          : t("goals.form.accountTaken", {
                              name: row.accountName,
                              goal: takenBy,
                            });
                      return (
                        <Field key={row.accountId}>
                          <Checkbox.Root
                            checked={checked}
                            disabled={takenBy !== undefined}
                            onCheckedChange={(details) => {
                              const selected = details.checked === true;
                              field.handleChange(
                                selected
                                  ? [...field.state.value, row.accountId]
                                  : field.state.value.filter((id) => id !== row.accountId),
                              );
                            }}
                          >
                            <Checkbox.HiddenInput />
                            <Checkbox.Control />
                            <Checkbox.Label>{label}</Checkbox.Label>
                          </Checkbox.Root>
                        </Field>
                      );
                    })}
                  </Stack>
                ))}
              </Stack>
            )}
          />
          <form.SubmitButton label={goal === null ? t("goals.add") : t("accounts.saveChanges")} />
        </FormFrame>
      </form.AppForm>
      {goal === null ? null : (
        <DeleteButton
          entity="goal"
          isPending={remove.isPending}
          onDelete={async () => {
            try {
              await remove.mutateAsync();
              await navigate({ to: "/goals" });
            } catch (cause) {
              setError(describeError(cause));
            }
          }}
        />
      )}
    </>
  );
}

export function GoalFormScreen({ id }: { readonly id?: string }) {
  const { t } = useTranslation();
  const query = useGoal(id ?? "");
  const requestFailed = t("errors.requestFailed");
  const describeError = (cause: unknown) =>
    cause instanceof Error ? cause.message : requestFailed;
  if (id === undefined) return <GoalForm goal={null} />;
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={describeError(query.error)} />;
  return <GoalForm goal={query.data} />;
}
