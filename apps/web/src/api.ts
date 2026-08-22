import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { EngineApi } from "@satella-app/engine/api";
import * as Effect from "effect/Effect";

import { engineFetch } from "./engine-fetch";
import { engineUrl } from "./runtime";

const clientEffect = HttpApiClient.make(EngineApi, { baseUrl: engineUrl() });
type EngineClient = Effect.Success<typeof clientEffect>;

const request = <A, E>(operation: (client: EngineClient) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    clientEffect.pipe(
      Effect.flatMap(operation),
      Effect.provideService(FetchHttpClient.Fetch, engineFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

export const getHello = () => request((client) => client.system.hello({}));

export const engineApi = {
  vaultStatus: () => request((client) => client.vault.status({})),
  initializeVault: (payload: { password: string; pin: string }) =>
    request((client) => client.vault.initialize({ payload })),
  unlockVault: (password: string) =>
    request((client) => client.vault.unlock({ payload: { password } })),
  closeVault: () => request((client) => client.vault.close({})),
  lockScreen: () => request((client) => client.vault.lockScreen({})),
  unlockScreen: (pin: string) =>
    request((client) => client.vault.unlockScreen({ payload: { pin } })),
  unlockScreenWithPassword: (password: string) =>
    request((client) => client.vault.unlockScreenWithPassword({ payload: { password } })),
  changeVaultPassword: (payload: { currentPassword: string; nextPassword: string }) =>
    request((client) => client.vault.changePassword({ payload })),
  changeScreenLockPin: (payload: { password: string; pin: string }) =>
    request((client) => client.vault.changePin({ payload })),
  setScreenLockTimeout: (minutes: 5 | 15 | 30 | 60) =>
    request((client) => client.vault.setScreenLockTimeout({ payload: { minutes } })),
  reportVaultActivity: (activityAt: number) =>
    request((client) => client.vault.reportActivity({ payload: { activityAt } })),
  resetVault: (confirmation: string) =>
    request((client) => client.vault.reset({ payload: { confirmation } })),
  exportVault: (password: string, destinationPath: string) =>
    request((client) => client.vault.exportVault({ payload: { password, destinationPath } })),
  restoreVault: (sourcePath: string, password: string) =>
    request((client) => client.vault.restoreVault({ payload: { sourcePath, password } })),
};
