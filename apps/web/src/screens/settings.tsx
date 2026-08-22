import { Box, Card, Stack } from "@chakra-ui/react";
import { useState } from "react";

import { FormError, NavRow, PageHeader, PageState } from "../components";
import { useThemePreference } from "../components/ui/color-mode";
import { Field } from "../components/ui/field";
import { SegmentedControl } from "../components/ui/segmented-control";
import { notify } from "../components/ui/toaster";
import { currencySymbol } from "../financial-number";
import { useSaveReportingCurrency, useSettings } from "../portfolio";
import { SelectField } from "../select-field";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

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
                label: `${currencySymbol(currency.iso) ?? currency.iso} · ${currency.name}`,
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
        <Card.Root>
          <Card.Body>
            <ThemeField />
          </Card.Body>
        </Card.Root>
        <Box as="ul" m="0" p="0">
          <NavRow
            href="/settings/custodians"
            label="Custodians"
            description="Manage banks, brokers, and linked services."
          />
          <NavRow
            href="/settings/security"
            label="Security"
            description="Vault password, Screen lock, and Reset Satella."
          />
        </Box>
      </Stack>
    </>
  );
}

function ThemeField() {
  const { theme, setTheme } = useThemePreference();
  return (
    <Field label="Theme" helperText="System follows this device and is the default.">
      <SegmentedControl
        aria-label="Theme"
        width="full"
        value={theme}
        onValueChange={(details) => {
          if (details.value === "system" || details.value === "light" || details.value === "dark") {
            setTheme(details.value);
          }
        }}
        items={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </Field>
  );
}
