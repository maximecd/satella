import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { appLanguage, setAppLanguage, type AppLanguage } from "../app-language";
import enAccounts from "./locales/en/accounts.json";
import enAddAssets from "./locales/en/addAssets.json";
import enAssets from "./locales/en/assets.json";
import enCommon from "./locales/en/common.json";
import enCustodians from "./locales/en/custodians.json";
import enDashboard from "./locales/en/dashboard.json";
import enOnboarding from "./locales/en/onboarding.json";
import enPositions from "./locales/en/positions.json";
import enSecurity from "./locales/en/security.json";
import enSettings from "./locales/en/settings.json";
import enShell from "./locales/en/shell.json";
import frAccounts from "./locales/fr/accounts.json";
import frAddAssets from "./locales/fr/addAssets.json";
import frAssets from "./locales/fr/assets.json";
import frCommon from "./locales/fr/common.json";
import frCustodians from "./locales/fr/custodians.json";
import frDashboard from "./locales/fr/dashboard.json";
import frOnboarding from "./locales/fr/onboarding.json";
import frPositions from "./locales/fr/positions.json";
import frSecurity from "./locales/fr/security.json";
import frSettings from "./locales/fr/settings.json";
import frShell from "./locales/fr/shell.json";

const en = {
  ...enCommon,
  onboarding: enOnboarding.onboarding,
  settings: enSettings.settings,
  ...enDashboard,
  ...enAccounts,
  ...enPositions,
  ...enAssets,
  ...enAddAssets,
  ...enCustodians,
  ...enSecurity,
  ...enShell,
};
const fr = {
  ...frCommon,
  onboarding: frOnboarding.onboarding,
  settings: frSettings.settings,
  ...frDashboard,
  ...frAccounts,
  ...frPositions,
  ...frAssets,
  ...frAddAssets,
  ...frCustodians,
  ...frSecurity,
  ...frShell,
};

export const i18n = i18next.createInstance();

document.documentElement.lang = appLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: appLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export const changeAppLanguage = (language: AppLanguage) => {
  setAppLanguage(language);
  void i18n.changeLanguage(language);
  document.documentElement.lang = language;
  // Keep the desktop tray strings in the same language as the app.
  window.satellaRuntime?.reportAppLanguage?.(language);
};

declare module "i18next" {
  interface CustomTypeOptions {
    resources: {
      translation: typeof en;
    };
  }
}
