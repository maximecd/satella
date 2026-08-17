import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { EngineApi } from "@optimus/engine/api";
import * as Effect from "effect/Effect";

import { engineUrl } from "./runtime";

const clientEffect = HttpApiClient.make(EngineApi, { baseUrl: engineUrl() });
type EngineClient = Effect.Success<typeof clientEffect>;

const request = <A, E>(operation: (client: EngineClient) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    clientEffect.pipe(Effect.flatMap(operation), Effect.provide(FetchHttpClient.layer)),
  );

export const getHello = () => request((client) => client.system.hello({}));

export const engineApi = {
  vaultStatus: () => request((client) => client.vault.status({})),
  initializeVault: (payload: { password: string; pin: string }) =>
    request((client) => client.vault.initialize({ payload })),
  unlockVault: (password: string) =>
    request((client) => client.vault.unlock({ payload: { password } })),
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
  resetVault: (confirmation: string) =>
    request((client) => client.vault.reset({ payload: { confirmation } })),
};
