/** Minimal mirror of the engine's auto-refresh status payload; no financial data. */
export interface RefreshStatus {
  readonly lastCycleAt: string | null;
  readonly lastCycleOutcome: "success" | "partial" | "failed" | null;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Tray line describing the last completed auto-refresh cycle; no financial data. */
export const formatLastRefresh = (lastCycleAt: string | null, now = new Date()): string => {
  if (lastCycleAt === null) return "Not refreshed yet";
  const at = new Date(lastCycleAt);
  if (Number.isNaN(at.getTime())) return "Not refreshed yet";
  const time = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return `Last refreshed today at ${time}`;
  return `Last refreshed ${MONTHS[at.getMonth()]} ${at.getDate()} at ${time}`;
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
  actions: TrayActions,
  now = new Date(),
): Array<TrayMenuItem> => [
  { label: "Open Satella", enabled: true, click: actions.open },
  { label: "Lock Now", enabled: true, click: actions.lockNow },
  {
    label: formatLastRefresh(status?.lastCycleAt ?? null, now),
    enabled: false,
  },
  { label: "Quit", enabled: true, click: actions.quit },
];
