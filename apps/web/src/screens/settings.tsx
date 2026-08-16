import { Box, Card, Stack } from "@chakra-ui/react";
import { useState } from "react";

import { FormError, NavRow, PageHeader, PageState } from "../components";
import { notify } from "../components/ui/toaster";
import { useSaveReportingCurrency, useSettings } from "../portfolio";
import { SelectField } from "../select-field";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function SettingsScreen() {
  const query = useSettings();
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useSaveReportingCurrency();
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const settings = query.data;
  return (
    <>
      <PageHeader title="Settings" />
      <FormError message={saveError} />
      <Stack gap="6">
        <Card.Root>
          <Card.Body>
            <SelectField
              label="Reporting currency"
              helperText="Portfolio totals, history, and allocation use this currency."
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
                      notify.success("Reporting currency saved.");
                    },
                    onError: (cause) => setSaveError(errorMessage(cause)),
                  },
                );
              }}
              disabled={save.isPending}
            />
          </Card.Body>
        </Card.Root>
        <Box as="ul" m="0" p="0">
          <NavRow
            href="/settings/connections"
            label="Connections"
            description="Manage linked financial services."
          />
          <NavRow
            href="/settings/security"
            label="Security"
            description="Vault password, Screen lock, and Reset Optimus."
          />
        </Box>
      </Stack>
    </>
  );
}
