import { describe, expect, it } from "vite-plus/test";

import { createTrayState, setTrayLanguage } from "./tray.js";

describe("tray state projection", () => {
  it("projects exactly three localized actions and updates only vault state", () => {
    const recorded: Array<ReadonlyArray<{ label: string; enabled: boolean }>> = [];
    const calls: string[] = [];
    const controller = createTrayState({
      adapter: {
        replaceMenu: (items) => {
          recorded.push(items.map(({ label, enabled }) => ({ label, enabled })));
        },
      },
      actions: {
        open: () => calls.push("open"),
        lockNow: () => calls.push("lock"),
        quit: () => calls.push("quit"),
      },
    });

    expect(recorded[0]?.map(({ label }) => label)).toEqual(["Open Satella", "Lock now", "Quit"]);
    expect(recorded[0]?.[1]?.enabled).toBe(false);
    controller.setVaultOpen(true);
    expect(recorded).toHaveLength(2);
    expect(recorded[1]?.[1]?.enabled).toBe(true);
    controller.setVaultOpen(true);
    expect(recorded).toHaveLength(2);

    controller.setLanguage("fr");
    expect(recorded[2]?.map(({ label }) => label)).toEqual([
      "Ouvrir Satella",
      "Verrouiller maintenant",
      "Quitter",
    ]);
    controller.setLanguage("fr");
    expect(recorded).toHaveLength(3);

    controller.dispose();
    controller.setVaultOpen(false);
    expect(recorded).toHaveLength(3);
    setTrayLanguage("en");
  });

  it("binds each visible item to the corresponding action", () => {
    const calls: string[] = [];
    const recorded: Array<ReadonlyArray<{ click?: () => void }>> = [];
    createTrayState({
      initialVaultOpen: true,
      adapter: { replaceMenu: (items) => recorded.push(items) },
      actions: {
        open: () => calls.push("open"),
        lockNow: () => calls.push("lock"),
        quit: () => calls.push("quit"),
      },
    });
    for (const item of recorded[0] ?? []) item.click?.();
    expect(calls).toEqual(["open", "lock", "quit"]);
  });
});
