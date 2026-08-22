export type AppLanguage = "en" | "fr";

export const APP_LANGUAGES: readonly AppLanguage[] = ["en", "fr"];

const detectAppLanguage = (): AppLanguage =>
  navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";

let currentLanguage: AppLanguage = detectAppLanguage();

export const appLanguage = (): AppLanguage => currentLanguage;

export const setAppLanguage = (language: AppLanguage) => {
  currentLanguage = language;
};
