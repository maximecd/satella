import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { useToast } from "@astryxdesign/core/Toast";
import { useState } from "react";

import { engineApi } from "../api";
import { FormError, PageHeader, PageState } from "../components";
import { invalidateFinanceQueries } from "../add-assets";
import { connectorCapabilitiesQuery, connectionsQuery, manualAccountsQuery } from "../queries";
import { AddAssetsButton } from "./add-assets";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function SettingsScreen() {
  const query = useQuery(connectionsQuery);
  const accounts = useQuery(manualAccountsQuery);
  const capabilities = useQuery(connectorCapabilitiesQuery);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [syncError, setSyncError] = useState<string | null>(null);
  const refresh = useMutation({
    mutationFn: engineApi.refreshConnection,
    onSuccess: async () => {
      setSyncError(null);
      await invalidateFinanceQueries(queryClient);
      toast({ body: "Connection refreshed." });
    },
    onError: (cause) => setSyncError(errorMessage(cause)),
  });
  if (query.isPending || capabilities.isPending || accounts.isPending)
    return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const connected = query.data;
  const institutions = accounts.data ?? [];
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage connections, institutions, and diagnostic data."
      />
      <FormError message={syncError} />
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={2}>Connections</Heading>
          {connected.length === 0 ? (
            <EmptyState
              title="No connections"
              description="Connect a provider from Add assets to import accounts automatically."
              isCompact
              actions={<AddAssetsButton />}
            />
          ) : (
            <List density="balanced" hasDividers>
              {connected.map((connection) => (
                <ListItem
                  key={connection.id}
                  label={connection.name}
                  description={`${connection.accounts.length} account${connection.accounts.length === 1 ? "" : "s"}`}
                  endContent={
                    <Stack direction="horizontal" gap={2} align="center">
                      <Token label="Connected" size="sm" color="blue" />
                      <Button
                        label="Resync"
                        size="sm"
                        isLoading={refresh.isPending}
                        onClick={() => refresh.mutate(connection.id)}
                      />
                      <Button
                        as={RouterLink}
                        href={`/custodians/${connection.id}/edit`}
                        label="Edit"
                        size="sm"
                      />
                    </Stack>
                  }
                />
              ))}
            </List>
          )}
        </Stack>
        <Stack gap={3}>
          <Heading level={2}>Institutions & wallets</Heading>
          {institutions.length === 0 ? (
            <EmptyState
              title="No institutions yet"
              description="Manual banks, brokers, platforms, and wallets created while adding assets appear here."
              isCompact
            />
          ) : (
            <List density="balanced" hasDividers>
              {institutions.map((account) => (
                <ListItem
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  label={account.name}
                  description={`${account.positions.length} holding${account.positions.length === 1 ? "" : "s"}`}
                  endContent={<Token label="Manual" size="sm" color="gray" />}
                />
              ))}
            </List>
          )}
        </Stack>
        <Stack gap={3}>
          <Heading level={2}>Advanced data</Heading>
          <Text type="supporting" as="p">
            Raw catalog views for diagnostics. Everyday adding happens from Add assets.
          </Text>
          <List density="balanced" hasDividers>
            <ListItem
              label="Custodians"
              description="Inspect every institution record."
              href="/custodians"
            />
            <ListItem
              label="Assets"
              description="Inspect the shared asset catalog."
              href="/assets"
            />
          </List>
        </Stack>
      </Stack>
    </>
  );
}
