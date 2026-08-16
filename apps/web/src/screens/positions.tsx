import { useNavigate } from "@tanstack/react-router";
import { PositionQuantityFormInput } from "@optimus/engine/api";
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
import { useDeletePosition, usePositionEdit, useUpdatePosition } from "../portfolio";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function EditPositionScreen({ positionId }: { readonly positionId: string }) {
  const query = usePositionEdit(positionId);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const { position, account } = query.data;
  return (
    <LoadedEditPosition
      accountId={account.id}
      accountName={account.name}
      connectionId={account.connectionId}
      connectionName={account.connectionName}
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
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const update = useUpdatePosition(positionId, accountId);
  const remove = useDeletePosition(positionId, accountId);
  const form = useAppForm({
    defaultValues: { quantity: String(quantity) },
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.toStandardSchemaV1(PositionQuantityFormInput) },
    onSubmit: async ({ value }) => {
      try {
        const decoded = await Schema.decodeUnknownPromise(PositionQuantityFormInput)(value);
        await update.mutateAsync(decoded.quantity);
        await navigate({ to: "/accounts/$accountId", params: { accountId } });
      } catch (cause) {
        setError(errorMessage(cause));
      }
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
        onDelete={async () => {
          try {
            await remove.mutateAsync();
            await navigate({ to: "/accounts/$accountId", params: { accountId } });
          } catch (cause) {
            setError(errorMessage(cause));
          }
        }}
      />
    </>
  );
}
