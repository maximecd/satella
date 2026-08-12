import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { CreateCustodianInput, UpdateCustodianInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useState } from "react";

import { engineApi } from "../api";
import {
  DeleteButton,
  FormError,
  FormFrame,
  PageHeader,
  PageState,
} from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
import { custodianQuery, custodiansQuery, queryKeys } from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const managementBadge = (mode: "manual" | "synced") => (
  <Badge label={mode === "manual" ? "Manual" : "Synced"} variant={mode === "manual" ? "success" : "neutral"} />
);

export function CustodianListScreen() {
  const query = useQuery(custodiansQuery);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  return (
    <>
      <PageHeader
        title="Custodians"
        subtitle="Banks, brokers, exchanges, and wallets where assets are held."
        action={<Button as={RouterLink} href="/custodians/new" label="Add custodian" variant="primary" />}
      />
      {query.data.length === 0 ? (
        <EmptyState
          title="No custodians yet"
          description="Add a manual custodian to begin tracking accounts and positions."
          actions={
            <Button as={RouterLink} href="/custodians/new" label="Add custodian" variant="primary" />
          }
        />
      ) : (
        <List density="balanced" hasDividers>
          {query.data.map((custodian) => (
            <ListItem
              key={custodian.id}
              label={
                <AstryxLink
                  as={RouterLink}
                  href={`/custodians/${custodian.id}`}
                  isStandalone
                  weight="semibold"
                >
                  {custodian.name}
                </AstryxLink>
              }
              description={`${custodian.accounts.length} account${custodian.accounts.length === 1 ? "" : "s"}`}
              endContent={
                <Stack direction="horizontal" align="center" gap={2}>
                  {managementBadge(custodian.managementMode)}
                  <Button
                    as={RouterLink}
                    href={`/custodians/${custodian.id}`}
                    label="View"
                    size="sm"
                    variant="secondary"
                  />
                </Stack>
              }
            />
          ))}
        </List>
      )}
    </>
  );
}

export function CreateCustodianScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: engineApi.createCustodian,
    onSuccess: async (custodian) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all });
      await navigate({ to: "/custodians/$custodianId", params: { custodianId: custodian.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const defaultValues: typeof CreateCustodianInput.Encoded = {
    name: "",
    managementMode: "manual",
  };
  const form = useAppForm({
    defaultValues,
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(CreateCustodianInput) },
    onSubmit: async ({ value }) => {
      setError(null);
      const decoded = await Schema.decodeUnknownPromise(CreateCustodianInput)(value);
      await mutation.mutateAsync(decoded);
    },
  });
  return (
    <>
      <PageHeader
        title="Add custodian"
        subtitle={
          capabilities.data?.connectors.length
            ? "OKX is registered. Secure connector credential setup is not available yet."
            : "No custodian connectors are configured, so new custodians are manual."
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
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.SubmitButton label="Create custodian" />
        </FormFrame>
      </form.AppForm>
    </>
  );
}

export function CustodianDetailScreen({ id }: { readonly id: string }) {
  const query = useQuery(custodianQuery(id));
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const custodian = query.data;
  return (
    <>
      <PageHeader
        title={custodian.name}
        subtitle={`${custodian.managementMode} custodian`}
        action={<Button as={RouterLink} href={`/custodians/${id}/edit`} label="Edit" />}
      />
      <Stack direction="horizontal" justify="between" align="center" gap={3} wrap="wrap">
        <Stack direction="horizontal" align="center" gap={2}>
          <Heading level={2}>Accounts</Heading>
          {managementBadge(custodian.managementMode)}
        </Stack>
        {custodian.managementMode === "manual" && (
          <Button
            as={RouterLink}
            href={`/custodians/${id}/accounts/new`}
            label="Add account"
            variant="primary"
          />
        )}
      </Stack>
      {custodian.accounts.length === 0 ? (
        <EmptyState title="No accounts" description="Create an account to hold positions." />
      ) : (
        <List density="balanced" hasDividers>
          {custodian.accounts.map((account) => (
            <ListItem
              key={account.id}
              label={<AstryxLink as={RouterLink} href={`/accounts/${account.id}`} isStandalone weight="semibold">{account.name}</AstryxLink>}
              description={`${account.baseCurrencyIso} · ${account.positionCount} position${account.positionCount === 1 ? "" : "s"}`}
              endContent={
                <Button
                  as={RouterLink}
                  href={`/accounts/${account.id}`}
                  label="View account"
                  size="sm"
                />
              }
            />
          ))}
        </List>
      )}
    </>
  );
}

export function EditCustodianScreen({ id }: { readonly id: string }) {
  const query = useQuery(custodianQuery(id));
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  return <LoadedEditCustodian id={id} name={query.data.name} />;
}

function LoadedEditCustodian({ id, name }: { readonly id: string; readonly name: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (nextName: string) => engineApi.updateCustodian(id, nextName),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.custodians.detail(id) }),
      ]);
      toast({ body: "Custodian updated." });
      await navigate({ to: "/custodians/$custodianId", params: { custodianId: id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deleteCustodian(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.custodians.all });
      await navigate({ to: "/custodians" });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const form = useAppForm({
    defaultValues: { name },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(UpdateCustodianInput) },
    onSubmit: async ({ value }) => {
      const decoded = await Schema.decodeUnknownPromise(UpdateCustodianInput)(value);
      await update.mutateAsync(decoded.name);
    },
  });
  return (
    <>
      <PageHeader
        title={`Edit ${name}`}
        subtitle="Management mode is permanent and cannot be changed."
      />
      <FormError message={error} />
      <form.AppForm>
        <FormFrame
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.SubmitButton label="Save changes" />
        </FormFrame>
      </form.AppForm>
      <DeleteButton
        entity="custodian"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}
