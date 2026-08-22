import { describe, expect, it } from "vite-plus/test";

import { createTrayState, setTrayLanguage, type RefreshStatus } from "./tray.js";

describe("tray state projection", () => {
  it("replaces the native menu only when visible state changes", () => {
    const recorded: Array<ReadonlyArray<{ label: string; enabled: boolean }>> = [];
    const status: RefreshStatus = {
      lastCycleAt: "2026-08-22T12:00:00.000Z",
      lastCycleOutcome: "success",
    };
    const controller = createTrayState({
      adapter: {
        replaceMenu: (items) => {
          recorded.push(items.map(({ label, enabled }) => ({ label, enabled })));
        },
      },
      actions: {
        open: () => undefined,
        lockNow: () => undefined,
        quit: () => undefined,
      },
      now: () => new Date("2026-08-22T13:00:00.000Z"),
    });

    expect(recorded).toHaveLength(1);
    controller.setRefreshStatus(status);
    expect(recorded).toHaveLength(2);
    controller.setRefreshStatus(status);
    controller.setVaultOpen(false);
    expect(recorded).toHaveLength(2);
    controller.setVaultOpen(true);
    expect(recorded).toHaveLength(3);
    controller.setLanguage("fr");
    expect(recorded).toHaveLength(4);
    controller.setLanguage("fr");
    expect(recorded).toHaveLength(4);
    controller.dispose();
    controller.setVaultOpen(false);
    expect(recorded).toHaveLength(4);
    setTrayLanguage("en");
  });
});
