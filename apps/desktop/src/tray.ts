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
