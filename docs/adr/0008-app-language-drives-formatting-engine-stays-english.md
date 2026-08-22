# App language drives formatting; the engine stays English-only

Satella supports English and French. The App language is a per-Vault setting (`app_settings.app_language`) chosen at onboarding and changeable in Settings, and it drives **all** locale-dependent presentation: UI strings (react-i18next) and number/date formatting (formatters default to the active app language rather than the OS locale). We considered keeping OS-driven formatting with a separate region setting, but a French UI rendering `1,234.56` amounts felt broken, and a second "region" knob was unjustified for two languages.

The engine deliberately stays English-only, including error messages: they surface verbatim in the UI without translation at any layer. Localizing engine responses would mean either translating inside the engine (mixing presentation into the domain) or mapping every message to a code at the web boundary — neither justified while the engine's messages are treated as diagnostic output.

Translation uses react-i18next with type-checked keys generated from the English catalog; catalogs live per screen area under `apps/web/src/i18n/locales/`.
