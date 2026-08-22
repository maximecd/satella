import { Button, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { MIN_VAULT_PASSWORD_LENGTH } from "@satella-app/engine/api";

import { engineApi } from "../api";
import { FormError } from "../components";
import { appLanguage, type AppLanguage } from "../app-language";
import { changeAppLanguage } from "../i18n";
import { vaultStatusQuery } from "../queries";
import { useSaveReportingCurrency, useSettings } from "../portfolio";
import { SelectField } from "../select-field";
import { passwordGuidance, SecretField } from "./secret-field";
import { PinField } from "./pin-field";
import { GateLayout } from "./gate-layout";
import { RestoreVaultControl } from "./restore-vault";
import { useAddAssets } from "./add-assets";
import { clearFirstAssetPending, markFirstAssetPending } from "./vault-gate";

type Step = "welcome" | "password" | "pin" | "pin-confirm" | "preferences" | "first-asset";

export function OnboardingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const addAssets = useAddAssets();
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: engineApi.initializeVault,
    onSuccess: async (status) => {
      markFirstAssetPending();
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
      setStep("preferences");
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : t("errors.requestFailed")),
  });

  if (step === "welcome") {
    return (
      <GateLayout title={t("onboarding.welcome.title")}>
        <Stack gap="4">
          <Text as="p">{t("onboarding.welcome.intro")}</Text>
          <Text as="p">{t("onboarding.welcome.encryptionNote")}</Text>
        </Stack>
        <Button colorPalette="blue" onClick={() => setStep("password")}>
          {t("onboarding.welcome.createNewVault")}
        </Button>
        <RestoreVaultControl requiresConfirmation={false} />
      </GateLayout>
    );
  }

  if (step === "password") {
    const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
    return (
      <GateLayout
        title={t("onboarding.password.title")}
        description={passwordGuidance(password, t)}
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
              setError(t("onboarding.password.minLengthError", { min: MIN_VAULT_PASSWORD_LENGTH }));
              return;
            }
            if (password !== confirmPassword) {
              setError(t("onboarding.password.mismatchError"));
              return;
            }
            setError(null);
            setStep("pin");
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <SecretField
              label={t("onboarding.password.vaultPassword")}
              value={password}
              onChange={setPassword}
              htmlName="vault-password"
              autoComplete="new-password"
            />
            <SecretField
              label={t("onboarding.password.confirmVaultPassword")}
              value={confirmPassword}
              onChange={setConfirmPassword}
              htmlName="vault-password-confirm"
              autoComplete="new-password"
              {...(mismatch
                ? {
                    status: {
                      type: "error" as const,
                      message: t("onboarding.password.fieldMismatchError"),
                    },
                  }
                : {})}
            />
            <Button type="submit" colorPalette="blue">
              {t("onboarding.password.continue")}
            </Button>
          </Stack>
        </form>
      </GateLayout>
    );
  }

  if (step === "pin") {
    return (
      <GateLayout title={t("onboarding.pin.title")} description={t("onboarding.pin.description")}>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!/^\d{4}$/.test(pin)) {
              setError(t("onboarding.pin.formatError"));
              return;
            }
            setError(null);
            setStep("pin-confirm");
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <PinField
              label={t("onboarding.pin.screenLockPin")}
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
              autoFocus
            />
            <Button type="submit" colorPalette="blue">
              {t("onboarding.password.continue")}
            </Button>
          </Stack>
        </form>
      </GateLayout>
    );
  }

  if (step === "pin-confirm") {
    return (
      <GateLayout
        title={t("onboarding.pinConfirm.title")}
        description={t("onboarding.pinConfirm.description")}
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (pin !== confirmPin) {
              setError(t("onboarding.pinConfirm.mismatchError"));
              setConfirmPin("");
              setStep("pin");
              return;
            }
            setError(null);
            create.mutate({ password, pin });
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <PinField
              label={t("onboarding.pin.confirmScreenLockPin")}
              value={confirmPin}
              onChange={setConfirmPin}
              htmlName="screen-lock-pin-confirm"
              autoFocus
            />
            <Button
              type="submit"
              colorPalette="blue"
              disabled={create.isPending}
              loading={create.isPending}
            >
              {t("onboarding.pin.createVault")}
            </Button>
          </Stack>
        </form>
      </GateLayout>
    );
  }

  if (step === "preferences") {
    return <PreferencesStep onDone={() => setStep("first-asset")} />;
  }

  return (
    <GateLayout
      title={t("onboarding.firstAsset.title")}
      description={t("onboarding.firstAsset.description")}
    >
      <Stack direction="row" gap="3">
        <Button
          colorPalette="blue"
          onClick={() => {
            addAssets.open();
          }}
        >
          {t("onboarding.firstAsset.addFirstAsset")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            clearFirstAssetPending();
            void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
          }}
        >
          {t("onboarding.firstAsset.goToDashboard")}
        </Button>
      </Stack>
    </GateLayout>
  );
}

const REGION_CURRENCY = new Map(
  Object.entries({
    AU: "AUD",
    CA: "CAD",
    CH: "CHF",
    CN: "CNH",
    GB: "GBP",
    HK: "HKD",
    JP: "JPY",
    NZ: "NZD",
    US: "USD",
  }),
);

const EUROZONE_REGIONS = new Set([
  "AT",
  "BE",
  "HR",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
]);

const navigatorRegion = (): string | undefined => {
  try {
    return new Intl.Locale(navigator.language).region?.toUpperCase();
  } catch {
    return undefined;
  }
};

const suggestedCurrencyIso = (availableIso: readonly string[]): string | null => {
  if (availableIso.length === 0) return null;
  const region = navigatorRegion();
  if (region !== undefined) {
    const mapped = EUROZONE_REGIONS.has(region) ? "EUR" : REGION_CURRENCY.get(region);
    const match = mapped !== undefined ? availableIso.find((iso) => iso === mapped) : undefined;
    if (match !== undefined) return match;
  }
  return availableIso.find((iso) => iso === "EUR") ?? availableIso[0]!;
};

function PreferencesStep({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const query = useSettings();
  const save = useSaveReportingCurrency();
  const [suggestedLanguage] = useState<AppLanguage>(appLanguage());
  const [language, setLanguage] = useState<AppLanguage>(appLanguage());
  const [currencyAssetId, setCurrencyAssetId] = useState<string | null>(null);
  const currencies = query.data?.currencies ?? [];
  const suggestedCurrency =
    suggestedCurrencyIso(currencies.map((currency) => currency.assetId)) ??
    query.data?.reportingCurrency.assetId;
  const selectedCurrency = currencyAssetId ?? suggestedCurrency ?? "";
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");
  const persist = (next: { readonly language: AppLanguage; readonly currency: string }) => {
    changeAppLanguage(next.language);
    save.mutate(
      { reportingCurrencyAssetId: next.currency, language: next.language },
      { onSuccess: onDone },
    );
  };
  const submit = () => persist({ language, currency: selectedCurrency });
  const keepSuggested = () => {
    setLanguage(suggestedLanguage);
    persist({
      language: suggestedLanguage,
      currency: suggestedCurrency ?? "",
    });
  };
  return (
    <GateLayout
      title={t("onboarding.preferences.title")}
      description={t("onboarding.preferences.description")}
    >
      {query.isError ? (
        <>
          <FormError message={errorMessage(query.error)} />
          <Button colorPalette="blue" variant="outline" onClick={onDone}>
            {t("onboarding.preferences.keepSuggested")}
          </Button>
        </>
      ) : (
        <Stack gap="4">
          <SelectField
            label={t("onboarding.preferences.language")}
            helperText={t("onboarding.preferences.languageHelper")}
            options={[
              { value: "en", label: t("settings.language.en") },
              { value: "fr", label: t("settings.language.fr") },
            ]}
            value={language}
            onChange={(value) => {
              const next: AppLanguage = value === "fr" ? "fr" : "en";
              setLanguage(next);
              changeAppLanguage(next);
            }}
          />
          <SelectField
            label={t("onboarding.preferences.reportingCurrency")}
            helperText={t("onboarding.preferences.reportingCurrencyHelper")}
            options={currencies.map((currency) => ({
              value: currency.assetId,
              label: `${currency.name} (${currency.iso})`,
            }))}
            value={selectedCurrency}
            onChange={setCurrencyAssetId}
          />
          <Stack direction="row" gap="3">
            <Button colorPalette="blue" disabled={save.isPending} onClick={submit}>
              {t("onboarding.preferences.saveAndContinue")}
            </Button>
            <Button variant="outline" disabled={save.isPending} onClick={keepSuggested}>
              {t("onboarding.preferences.keepSuggested")}
            </Button>
          </Stack>
          <FormError message={save.error === null ? null : errorMessage(save.error)} />
        </Stack>
      )}
    </GateLayout>
  );
}
