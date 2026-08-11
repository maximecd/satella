import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PositionQuantityFormInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";
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
import { useAppForm } from "../form";
import {
  accountQuery,
  assetSearchQuery,
  assetsQuery,
  positionAccountQuery,
  queryKeys,
} from "../queries";

const CreatePositionForm = Schema.Struct({
  assetId: Schema.NonEmptyTrimmedString,
  quantity: Schema.NumberFromString,
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function CreatePositionScreen({ accountId }: { readonly accountId: string }) {
  const account = useQuery(accountQuery(accountId));
  const assets = useQuery(assetsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchClass, setSearchClass] = useState<"security" | "crypto">("security");
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const searchResults = useQuery(assetSearchQuery(debouncedSearch, searchClass));
  const mutation = useMutation({
    mutationFn: engineApi.createPosition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(accountId) });
      await navigate({ to: "/accounts/$accountId", params: { accountId } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const available =
    assets.data?.filter(
      (asset) => !account.data?.positions.some((position) => position.assetId === asset.id),
    ) ?? [];
  const form = useAppForm({
    defaultValues: { assetId: "", quantity: "" },
    validators: { onChange: Schema.standardSchemaV1(CreatePositionForm) },
    onSubmit: async ({ value }) => {
      const decoded = await Schema.decodeUnknownPromise(CreatePositionForm)(value);
      await mutation.mutateAsync({
        accountId,
        assetId: decoded.assetId,
        quantity: decoded.quantity,
      });
    },
  });
  const addFromSearch = useMutation({
    mutationFn: engineApi.createAsset,
    onSuccess: async (asset) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
      form.setFieldValue("assetId", asset.id);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  if (account.isPending || assets.isPending) return <PageState kind="pending" />;
  if (account.isError || assets.isError) return <PageState kind="error" />;
  if (account.data.managementMode !== "manual")
    return <PageState kind="error" message="Connector-managed positions are read-only." />;
  return (
    <>
      <PageHeader
        title="Add position"
        subtitle={`To ${account.data.name}`}
        action={<Button as={Link} href="/assets/custom/new" label="Create custom asset" />}
      />
      <FormError message={error} />
      <ResourceCard>
        <div {...stylex.props(styles.stack)}>
          <h2>Find an automatic asset</h2>
          <Selector
            label="Asset class"
            options={[
              { value: "security", label: "Stocks & ETFs" },
              { value: "crypto", label: "Crypto" },
            ]}
            value={searchClass}
            onChange={(value) => setSearchClass(value === "crypto" ? "crypto" : "security")}
            width="100%"
          />
          <TextInput
            label="Provider search"
            value={search}
            onChange={setSearch}
            placeholder="Search by name or exact symbol"
            width="100%"
          />
          {searchResults.isFetching && <p role="status">Searching…</p>}
          {searchResults.isError && <p role="alert">Provider search is temporarily unavailable.</p>}
          {searchResults.data?.map((result) => (
            <div
              key={`${result.provider}:${result.identifiers[0]?.value}`}
              {...stylex.props(styles.row)}
            >
              <span>
                <strong>{result.name}</strong> · {result.symbol}
              </span>
              <Button
                label="Use asset"
                size="sm"
                isLoading={addFromSearch.isPending}
                clickAction={async () => {
                  await addFromSearch.mutateAsync({
                    assetClass: result.assetClass,
                    name: result.name,
                    symbol: result.symbol,
                    identifiers: [...result.identifiers],
                  });
                }}
              />
            </div>
          ))}
        </div>
      </ResourceCard>
      {available.length === 0 ? (
        <p>No unused assets are available. Create a custom asset first.</p>
      ) : (
        <form.AppForm>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            {...stylex.props(styles.form)}
          >
            <form.AppField
              name="assetId"
              children={(field) => (
                <field.SelectField
                  label="Asset"
                  options={available.map((asset) => ({
                    value: asset.id,
                    label: `${asset.name}${asset.symbol ? ` (${asset.symbol})` : ""}`,
                  }))}
                />
              )}
            />
            <form.AppField
              name="quantity"
              children={(field) => <field.TextField label="Quantity" number />}
            />
            <form.SubmitButton label="Add position" />
          </form>
        </form.AppForm>
      )}
    </>
  );
}

export function EditPositionScreen({ positionId }: { readonly positionId: string }) {
  const query = useQuery(positionAccountQuery(positionId));
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const position = query.data.positions.find((item) => item.id === positionId);
  if (position === undefined) return <PageState kind="error" message="Position was not found." />;
  return (
    <LoadedEditPosition
      accountId={query.data.id}
      positionId={positionId}
      assetName={position.assetName}
      quantity={position.quantity}
    />
  );
}

function LoadedEditPosition({
  accountId,
  positionId,
  assetName,
  quantity,
}: {
  readonly accountId: string;
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
    validators: { onChange: Schema.standardSchemaV1(PositionQuantityFormInput) },
    onSubmit: async ({ value }) => {
      // Standard Schema reports issues but intentionally preserves encoded HTML values.
      const decoded = await Schema.decodeUnknownPromise(PositionQuantityFormInput)(value);
      await update.mutateAsync(decoded.quantity);
    },
  });
  return (
    <>
      <PageHeader
        title={`Edit ${assetName}`}
        subtitle="Set quantity to zero to preserve the position and its history."
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
          <form.AppField
            name="quantity"
            children={(field) => <field.TextField label="Quantity" number />}
          />
          <form.SubmitButton label="Save quantity" />
        </form>
      </form.AppForm>
      <hr />
      <DeleteButton
        entity="position"
        isPending={remove.isPending}
        onDelete={() => remove.mutateAsync()}
      />
    </>
  );
}
