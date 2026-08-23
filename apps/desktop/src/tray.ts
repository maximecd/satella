export type TrayLanguage = "en" | "fr";

type TrayMessageKey = "open" | "lockNow" | "quit";

const TRAY_MESSAGES = {
  en: {
    open: "Open Satella",
    lockNow: "Lock now",
    quit: "Quit",
  },
  fr: {
    open: "Ouvrir Satella",
    lockNow: "Verrouiller maintenant",
    quit: "Quitter",
  },
} satisfies Record<TrayLanguage, Record<TrayMessageKey, string>>;

let trayLanguage: TrayLanguage = "en";

export const setTrayLanguage = (language: string | undefined) => {
  trayLanguage = language === "fr" ? "fr" : "en";
};

const trayText = (key: TrayMessageKey) => TRAY_MESSAGES[trayLanguage][key];

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

export interface TrayStateController {
  readonly setState: (state: { readonly vaultOpen: boolean }) => void;
  readonly setVaultOpen: (open: boolean) => void;
  readonly setLanguage: (language: string | undefined) => void;
  readonly dispose: () => void;
}

export const trayMenuItems = (vaultOpen: boolean, actions: TrayActions): Array<TrayMenuItem> => [
  { label: trayText("open"), enabled: true, click: actions.open },
  { label: trayText("lockNow"), enabled: vaultOpen, click: actions.lockNow },
  { label: trayText("quit"), enabled: true, click: actions.quit },
];

/** Projects only the three user actions required by the native tray. */
export const createTrayState = (options: {
  readonly adapter: TrayStateAdapter;
  readonly actions: TrayActions;
  readonly initialVaultOpen?: boolean;
}): TrayStateController => {
  let vaultOpen = options.initialVaultOpen ?? false;
  let disposed = false;
  let lastProjection: string | undefined;

  const rebuild = () => {
    if (disposed) return;
    const items = trayMenuItems(vaultOpen, options.actions);
    const projection = JSON.stringify(items.map(({ label, enabled }) => ({ label, enabled })));
    if (projection === lastProjection) return;
    lastProjection = projection;
    options.adapter.replaceMenu(items);
  };

  rebuild();
  return {
    setState: (state) => {
      vaultOpen = state.vaultOpen;
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
    },
  };
};
