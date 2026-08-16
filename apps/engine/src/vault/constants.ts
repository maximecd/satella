export const SCREEN_LOCK_TIMEOUTS = [5, 15, 30, 60] as const;
export type ScreenLockTimeoutMinutes = (typeof SCREEN_LOCK_TIMEOUTS)[number];
export const DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES: ScreenLockTimeoutMinutes = 15;
export const MAX_PIN_ATTEMPTS = 3;
export const RESET_CONFIRMATION = "Reset Optimus";
export const MIN_VAULT_PASSWORD_LENGTH = 12;
