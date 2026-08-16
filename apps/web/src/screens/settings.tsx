import { Card } from "@astryxdesign/core/Card";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { useToast } from "@astryxdesign/core/Toast";
import { useState } from "react";

import { FormError, PageHeader, PageState } from "../components";
import { useSaveReportingCurrency, useSettings } from "../portfolio";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function SettingsScreen() {
  const query = useSettings();
  const toast = useToast();
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useSaveReportingCurrency();
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
              save.mutate(
                { reportingCurrencyAssetId: value },
                {
                  onSuccess: () => {
                    setSaveError(null);
                    toast({ body: "Reporting currency saved." });
                  },
                  onError: (cause) => setSaveError(errorMessage(cause)),
                },
              );
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
          <ListItem
            label="Security"
            description="Vault password, Screen lock, and Reset Optimus."
            href="/settings/security"
          />
        </List>
      </Stack>
    </>
  );
}
