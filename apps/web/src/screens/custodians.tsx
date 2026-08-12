import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CreateCustodianInput, UpdateCustodianInput } from "@optimus/engine/api";
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
import { connectorCapabilitiesQuery, custodianQuery, custodiansQuery, queryKeys } from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function CustodianListScreen() {
  const query = useQuery(custodiansQuery);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  return (
    <>
      <PageHeader
        title="Custodians"
        subtitle="Banks, brokers, exchanges, and wallets where assets are held."
        action={<Button as={Link} href="/custodians/new" label="Add custodian" variant="primary" />}
      />
      {query.data.length === 0 ? (
        <EmptyState
          title="No custodians yet"
          description="Add a manual custodian to begin tracking accounts and positions."
          actions={
            <Button as={Link} href="/custodians/new" label="Add custodian" variant="primary" />
          }
        />
      ) : (
        <div {...stylex.props(styles.stack)}>
          {query.data.map((custodian) => (
            <ResourceCard key={custodian.id}>
              <div {...stylex.props(styles.row)}>
                <div>
                  <Link
                    to="/custodians/$custodianId"
                    params={{ custodianId: custodian.id }}
                    {...stylex.props(styles.link)}
                  >
                    <strong>{custodian.name}</strong>
                  </Link>
                  <div {...stylex.props(styles.muted)}>
                    {custodian.managementMode} · {custodian.accounts.length} account(s)
                  </div>
                </div>
                <Button
                  as={Link}
                  href={`/custodians/${custodian.id}`}
                  label="View"
                  variant="secondary"
                />
              </div>
            </ResourceCard>
          ))}
        </div>
      )}
    </>
  );
}

export function CreateCustodianScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const capabilities = useQuery(connectorCapabilitiesQuery);
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
        subtitle="The initial connector registry is empty, so new custodians are manual."
      />
      {capabilities.data?.connectors.length ? null : null}
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
          <form.SubmitButton label="Create custodian" />
        </form>
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
        action={<Button as={Link} href={`/custodians/${id}/edit`} label="Edit" />}
      />
      <div {...stylex.props(styles.row)}>
        <h2>Accounts</h2>
        {custodian.managementMode === "manual" && (
          <Button
            as={Link}
            href={`/custodians/${id}/accounts/new`}
            label="Add account"
            variant="primary"
          />
        )}
      </div>
      {custodian.accounts.length === 0 ? (
        <EmptyState title="No accounts" description="Create an account to hold positions." />
      ) : (
        <div {...stylex.props(styles.stack)}>
          {custodian.accounts.map((account) => (
            <ResourceCard key={account.id}>
              <div {...stylex.props(styles.row)}>
                <div>
                  <strong>{account.name}</strong>
                  <div {...stylex.props(styles.muted)}>
                    {account.baseCurrencyIso} · {account.positionCount} position(s)
                  </div>
                </div>
                <Button as={Link} href={`/accounts/${account.id}`} label="View account" />
              </div>
            </ResourceCard>
          ))}
        </div>
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
    mutationFn: (name: string) => engineApi.updateCustodian(id, name),
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          {...stylex.props(styles.form)}
        >
          <form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
          <form.SubmitButton label="Save changes" />
        </form>
      </form.AppForm>
      <hr />
      <DeleteButton
        entity="custodian"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}
