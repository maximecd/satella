/** Minimal mirror of the engine's auto-refresh status payload; no financial data. */
export interface RefreshStatus {
  readonly lastCycleAt: string | null;
  readonly lastCycleOutcome: "success" | "partial" | "failed" | null;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

export type TrayLanguage = "en" | "fr";

type TrayMessageKey =
  | "open"
  | "lockNow"
  | "quit"
  | "notRefreshedYet"
  | "lastRefreshedTodayAt"
  | "lastRefreshedOnAt";

const TRAY_MESSAGES = {
  en: {
    open: "Open Satella",
    lockNow: "Lock Now",
    quit: "Quit",
    notRefreshedYet: "Not refreshed yet",
    lastRefreshedTodayAt: "Last refreshed today at {time}",
    lastRefreshedOnAt: "Last refreshed {date} at {time}",
  },
  fr: {
    open: "Ouvrir Satella",
    lockNow: "Verrouiller maintenant",
    quit: "Quitter",
    notRefreshedYet: "Pas encore actualisé",
    lastRefreshedTodayAt: "Dernière actualisation aujourd'hui à {time}",
    lastRefreshedOnAt: "Dernière actualisation le {date} à {time}",
  },
} satisfies Record<TrayLanguage, Record<TrayMessageKey, string>>;

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  fr: [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ],
} satisfies Record<TrayLanguage, readonly string[]>;

let trayLanguage: TrayLanguage = "en";

export const setTrayLanguage = (language: string | undefined) => {
  trayLanguage = language === "fr" ? "fr" : "en";
};

const trayText = (key: TrayMessageKey, vars: Record<string, string> = {}) =>
  Object.entries(vars).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    TRAY_MESSAGES[trayLanguage][key],
  );

/** Tray line describing the last completed auto-refresh cycle; no financial data. */
export const formatLastRefresh = (lastCycleAt: string | null, now = new Date()): string => {
  if (lastCycleAt === null) return trayText("notRefreshedYet");
  const at = new Date(lastCycleAt);
  if (Number.isNaN(at.getTime())) return trayText("notRefreshedYet");
  const time = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return trayText("lastRefreshedTodayAt", { time });
  const date =
    trayLanguage === "fr"
      ? `${at.getDate()} ${MONTHS.fr[at.getMonth()]}`
      : `${MONTHS.en[at.getMonth()]} ${at.getDate()}`;
  return trayText("lastRefreshedOnAt", { date, time });
};

export interface TrayActions {
  readonly open: () => void;
  readonly lockNow: () => void;
  readonly quit: () => void;
}

export interface TrayMenuItem {
  readonly label: string;
  readonly enabled: boolean;
  readonly click?: () => void;
}

export interface TrayStateAdapter {
  readonly replaceMenu: (items: ReadonlyArray<TrayMenuItem>) => void;
}

export type TrayTimerHandle = ReturnType<typeof setTimeout> | number;

export interface TrayStateController {
  readonly setState: (state: {
    readonly status: RefreshStatus | null;
    readonly vaultOpen: boolean;
  }) => void;
  readonly setRefreshStatus: (status: RefreshStatus | null) => void;
  readonly setVaultOpen: (open: boolean) => void;
  readonly setLanguage: (language: string | undefined) => void;
  readonly dispose: () => void;
}

export const trayMenuItems = (
  status: RefreshStatus | null,
  vaultOpen: boolean,
  actions: TrayActions,
  now = new Date(),
): Array<TrayMenuItem> => [
  { label: trayText("open"), enabled: true, click: actions.open },
  { label: trayText("lockNow"), enabled: vaultOpen, click: actions.lockNow },
  {
    label: formatLastRefresh(status?.lastCycleAt ?? null, now),
    enabled: false,
  },
  { label: trayText("quit"), enabled: true, click: actions.quit },
];

/**
 * Keeps one operational projection and replaces the native menu only when a
 * label or enabled action changes. The adapter is intentionally tiny so this
 * seam can be tested without importing Electron.
 */
export const createTrayState = (options: {
  readonly adapter: TrayStateAdapter;
  readonly actions: TrayActions;
  readonly now?: () => Date;
  readonly schedule?: (callback: () => void, delayMs: number) => TrayTimerHandle;
  readonly cancel?: (handle: TrayTimerHandle) => void;
  readonly initialStatus?: RefreshStatus | null;
  readonly initialVaultOpen?: boolean;
}): TrayStateController => {
  let refreshStatus = options.initialStatus ?? null;
  let vaultOpen = options.initialVaultOpen ?? false;
  let disposed = false;
  let lastProjection: string | undefined;
  let calendarTimer: TrayTimerHandle | undefined;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));

  const rebuild = () => {
    if (disposed) return;
    const items = trayMenuItems(
      refreshStatus,
      vaultOpen,
      options.actions,
      options.now?.() ?? new Date(),
    );
    const projection = JSON.stringify(items.map(({ label, enabled }) => ({ label, enabled })));
    if (projection === lastProjection) return;
    lastProjection = projection;
    options.adapter.replaceMenu(items);
  };

  const cancelCalendarRefresh = () => {
    if (calendarTimer === undefined) return;
    cancel(calendarTimer);
    calendarTimer = undefined;
  };

  const scheduleCalendarRefresh = () => {
    cancelCalendarRefresh();
    const now = options.now?.() ?? new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    calendarTimer = schedule(
      () => {
        calendarTimer = undefined;
        rebuild();
        scheduleCalendarRefresh();
      },
      Math.max(1, tomorrow.getTime() - now.getTime()),
    );
  };

  rebuild();
  scheduleCalendarRefresh();
  return {
    setState: (state) => {
      refreshStatus = state.status;
      vaultOpen = state.vaultOpen;
      rebuild();
    },
    setRefreshStatus: (status) => {
      refreshStatus = status;
      rebuild();
    },
    setVaultOpen: (open) => {
      vaultOpen = open;
      rebuild();
    },
    setLanguage: (language) => {
      setTrayLanguage(language);
      rebuild();
    },
    dispose: () => {
      disposed = true;
      cancelCalendarRefresh();
    },
  };
};
