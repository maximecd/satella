import { Card } from "@astryxdesign/core/Card";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { invalidateFinanceQueries } from "../add-assets";
import { engineApi } from "../api";
import { FormError, PageHeader, PageState } from "../components";
import { settingsQuery } from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function SettingsScreen() {
  const query = useQuery(settingsQuery);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: engineApi.updateSettings,
    onSuccess: async (settings) => {
      setSaveError(null);
      queryClient.setQueryData(settingsQuery.queryKey, settings);
      await invalidateFinanceQueries(queryClient);
      toast({ body: "Reporting currency saved." });
    },
    onError: (cause) => setSaveError(errorMessage(cause)),
  });
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const settings = query.data;
  return (
    <>
      <PageHeader title="Settings" />
      <FormError message={saveError} />
      <Stack gap={6}>
        <Card padding={4}>
          <Selector
            label="Reporting currency"
            description="Portfolio totals, history, and allocation use this currency."
            options={settings.currencies.map((currency) => ({
              value: currency.assetId,
              label: `${currency.iso} · ${currency.name}`,
            }))}
            value={settings.reportingCurrency.assetId}
            onChange={(value) => {
              if (value === settings.reportingCurrency.assetId) return;
              save.mutate({ reportingCurrencyAssetId: value });
            }}
            width="100%"
            isDisabled={save.isPending}
          />
        </Card>
        <List density="balanced" hasDividers>
          <ListItem
            label="Connections"
            description="Manage linked financial services."
            href="/settings/connections"
          />
        </List>
      </Stack>
    </>
  );
}
