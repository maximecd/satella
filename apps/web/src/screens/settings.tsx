import { Box, Button, Card, Heading, Input, Stack, Text } from "@chakra-ui/react";
import type { EvmRpcSettings, EvmRpcUrls } from "@satella-app/engine/api";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormError, NavRow, PageHeader, PageState } from "../components";
import { useThemePreference } from "../components/ui/color-mode";
import { Field } from "../components/ui/field";
import { SegmentedControl } from "../components/ui/segmented-control";
import { notify } from "../components/ui/toaster";
import { currencySymbol } from "../financial-number";
import type { AppLanguage } from "../app-language";
import {
  useSaveAppLanguage,
  useSaveEvmRpcSettings,
  useSaveReportingCurrency,
  useSettings,
} from "../portfolio";
import { SelectField } from "../select-field";

export function SettingsScreen() {
  const { t } = useTranslation();
  const query = useSettings();
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveCurrency = useSaveReportingCurrency();
  const saveLanguage = useSaveAppLanguage();
  const requestFailed = t("errors.requestFailed");
  const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : requestFailed);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const settings = query.data;
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <FormError message={saveError} />
      <Stack gap="6">
        <Card.Root>
          <Card.Body>
            <Stack gap="5">
              <SelectField
                label={t("settings.language.label")}
                helperText={t("settings.language.helper")}
                options={[
                  { value: "en", label: t("settings.language.en") },
                  { value: "fr", label: t("settings.language.fr") },
                ]}
                value={settings.language}
                onChange={(value) => {
                  if (value === settings.language) return;
                  const language: AppLanguage = value === "fr" ? "fr" : "en";
                  saveLanguage.mutate(language, {
                    onSuccess: () => {
                      setSaveError(null);
                      notify.success(t("settings.language.saved"));
                    },
                    onError: (cause) => setSaveError(errorMessage(cause)),
                  });
                }}
                disabled={saveLanguage.isPending}
              />
              <SelectField
                label={t("settings.reportingCurrency.label")}
                helperText={t("settings.reportingCurrency.helper")}
                options={settings.currencies.map((currency) => ({
                  value: currency.assetId,
                  label: `${currencySymbol(currency.iso) ?? currency.iso} · ${currency.name}`,
                }))}
                value={settings.reportingCurrency.assetId}
                onChange={(value) => {
                  if (value === settings.reportingCurrency.assetId) return;
                  saveCurrency.mutate(
                    { reportingCurrencyAssetId: value },
                    {
                      onSuccess: () => {
                        setSaveError(null);
                        notify.success(t("settings.reportingCurrency.saved"));
                      },
                      onError: (cause) => setSaveError(errorMessage(cause)),
                    },
                  );
                }}
                disabled={saveCurrency.isPending}
              />
            </Stack>
          </Card.Body>
        </Card.Root>
        <RpcSettingsForm initial={settings.evmRpc} />
        <Card.Root>
          <Card.Body>
            <ThemeField />
          </Card.Body>
        </Card.Root>
        <Box as="ul" m="0" p="0">
          <NavRow
            href="/settings/custodians"
            label={t("settings.custodiansNav.label")}
            description={t("settings.custodiansNav.description")}
          />
          <NavRow
            href="/settings/security"
            label={t("settings.securityNav.label")}
            description={t("settings.securityNav.description")}
          />
        </Box>
      </Stack>
    </>
  );
}

const emptyRpcUrls: EvmRpcUrls = {
  ethereum: "",
  base: "",
  arbitrum: "",
  optimism: "",
};

function RpcSettingsForm({ initial }: { readonly initial: EvmRpcSettings }) {
  const { t } = useTranslation();
  const save = useSaveEvmRpcSettings();
  const [mode, setMode] = useState<EvmRpcSettings["mode"]>(initial.mode);
  const [urls, setUrls] = useState<EvmRpcUrls>(
    initial.mode === "custom" ? initial.urls : emptyRpcUrls,
  );
  const [error, setError] = useState<string | null>(null);
  const chains = ["ethereum", "base", "arbitrum", "optimism"] as const;
  return (
    <Card.Root>
      <Card.Body>
        <Stack gap="5">
          <Stack gap="1">
            <Heading as="h2" size="md">
              {t("settings.rpc.title")}
            </Heading>
            <Text color="fg.muted">{t("settings.rpc.helper")}</Text>
          </Stack>
          <SelectField
            label={t("settings.rpc.modeLabel")}
            value={mode}
            onChange={(value) => {
              if (value === "public" || value === "custom") setMode(value);
            }}
            options={[
              { value: "public", label: t("settings.rpc.public") },
              { value: "custom", label: t("settings.rpc.custom") },
            ]}
          />
          {mode === "custom" && (
            <Stack gap="4">
              {chains.map((chain) => (
                <Field key={chain} label={t(`settings.rpc.chains.${chain}`)} required>
                  <Input
                    aria-label={t(`settings.rpc.chains.${chain}`)}
                    type="url"
                    autoComplete="off"
                    placeholder="https://…"
                    value={urls[chain]}
                    onChange={(event) =>
                      setUrls((current) => ({ ...current, [chain]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </Stack>
          )}
          <FormError message={error} />
          <Button
            alignSelf="flex-start"
            loading={save.isPending}
            onClick={() => {
              const evmRpc: EvmRpcSettings =
                mode === "public" ? { mode: "public" } : { mode: "custom", urls };
              save.mutate(evmRpc, {
                onSuccess: () => {
                  setError(null);
                  notify.success(t("settings.rpc.saved"));
                },
                onError: (cause) =>
                  setError(cause instanceof Error ? cause.message : t("errors.requestFailed")),
              });
            }}
          >
            {t("settings.rpc.save")}
          </Button>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

function ThemeField() {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemePreference();
  return (
    <Field label={t("settings.theme.label")} helperText={t("settings.theme.helper")}>
      <SegmentedControl
        aria-label={t("settings.theme.label")}
        width="full"
        value={theme}
        onValueChange={(details) => {
          if (details.value === "system" || details.value === "light" || details.value === "dark") {
            setTheme(details.value);
          }
        }}
        items={[
          { value: "system", label: t("settings.theme.system") },
          { value: "light", label: t("settings.theme.light") },
          { value: "dark", label: t("settings.theme.dark") },
        ]}
      />
    </Field>
  );
}
