import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PositionQuantityFormInput } from "@optimus/engine/api";
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
import { positionAccountQuery, queryKeys } from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function EditPositionScreen({ positionId }: { readonly positionId: string }) {
  const query = useQuery(positionAccountQuery(positionId));
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const position = query.data.positions.find((item) => item.id === positionId);
  if (position === undefined) return <PageState kind="error" message="Position was not found." />;
  return (
    <LoadedEditPosition
      accountId={query.data.id}
      accountName={query.data.name}
      connectionId={query.data.connectionId}
      connectionName={query.data.connectionName}
      positionId={positionId}
      assetName={position.assetName}
      quantity={position.quantity}
    />
  );
}

function LoadedEditPosition({
  accountId,
  accountName,
  connectionId,
  connectionName,
  positionId,
  assetName,
  quantity,
}: {
  readonly accountId: string;
  readonly accountName: string;
  readonly connectionId: string | null;
  readonly connectionName: string | null;
  readonly positionId: string;
  readonly assetName: string;
  readonly quantity: number;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (next: number) => engineApi.updatePosition(positionId, next),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(accountId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.positions.account(positionId) }),
      ]);
      await navigate({ to: "/accounts/$accountId", params: { accountId } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => engineApi.deletePosition(positionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(accountId) });
      await navigate({ to: "/accounts/$accountId", params: { accountId } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const form = useAppForm({
    defaultValues: { quantity: String(quantity) },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(PositionQuantityFormInput) },
    onSubmit: async ({ value }) => {
      const decoded = await Schema.decodeUnknownPromise(PositionQuantityFormInput)(value);
      await update.mutateAsync(decoded.quantity);
    },
  });

  return (
    <>
      <PageBreadcrumbs
        items={
          connectionId === null
            ? [
                { label: "Dashboard", href: "/" },
                { label: accountName, href: `/accounts/${accountId}` },
                { label: "Edit" },
              ]
            : [
                { label: "Settings", href: "/settings" },
                { label: "Connections", href: "/settings/connections" },
                {
                  label: connectionName ?? "Connection",
                  href: `/settings/connections/${connectionId}`,
                },
                { label: accountName, href: `/accounts/${accountId}` },
                { label: "Edit" },
              ]
        }
      />
      <PageHeader
        title={`Edit ${assetName}`}
        subtitle="Set quantity to zero to preserve the position and its history."
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
            children={(field) => <field.TextField label="Quantity" number />}
          />
          <form.SubmitButton label="Save quantity" />
        </FormFrame>
      </form.AppForm>
      <DeleteButton
        entity="position"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}
