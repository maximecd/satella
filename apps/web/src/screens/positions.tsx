import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PositionQuantityFormInput } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";

import { engineApi } from "../api";
import { DeleteButton, FormError, FormFrame, PageHeader, PageState } from "../components";
import { submitThenChangeValidation, useAppForm } from "../form";
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
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(CreatePositionForm) },
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
      <Section variant="muted" padding={4}>
        <Stack gap={4}>
          <Stack gap={1}>
            <Text type="heading-2">Find an automatic asset</Text>
            <Text type="supporting" as="p">
              Search a provider and add its identifiers to the shared asset catalog.
            </Text>
          </Stack>
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
          {searchResults.isFetching && (
            <Text type="supporting" as="p" role="status">
              Searching…
            </Text>
          )}
          {searchResults.isError && (
            <Text type="supporting" as="p" role="alert">
              Provider search is temporarily unavailable.
            </Text>
          )}
          {searchResults.data && searchResults.data.length > 0 && (
            <List density="compact" hasDividers>
              {searchResults.data.map((result) => (
                <ListItem
                  key={`${result.provider}:${result.identifiers[0]?.value}`}
                  label={
                    <Text weight="semibold">
                      {result.name} · {result.symbol}
                    </Text>
                  }
                  description={`${result.provider} · ${result.assetClass}`}
                  endContent={
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
                  }
                />
              ))}
            </List>
          )}
          {debouncedSearch.length > 0 &&
            !searchResults.isFetching &&
            searchResults.data?.length === 0 && (
              <Text type="supporting" as="p">
                No provider matches found.
              </Text>
            )}
        </Stack>
      </Section>
      {available.length === 0 ? (
        <Text type="supporting" as="p">
          No unused assets are available. Create a custom asset first.
        </Text>
      ) : (
        <form.AppForm>
          <FormFrame
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
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
          </FormFrame>
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
    validationLogic: submitThenChangeValidation,
    validators: { onDynamic: Schema.standardSchemaV1(PositionQuantityFormInput) },
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
