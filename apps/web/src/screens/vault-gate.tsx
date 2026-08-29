import { Text } from "@chakra-ui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { createActivityReporter } from "../activity-reporter";
import { engineApi } from "../api";
import { vaultStatusQuery } from "../queries";
import { OnboardingScreen } from "./onboarding";
import { ScreenLockScreen } from "./screen-lock";
import { UnlockScreen } from "./unlock";

const FIRST_ASSET_KEY = "satella.onboarding.first-asset";
export const firstAssetListeners = new Set<() => void>();

export const isFirstAssetPending = () => sessionStorage.getItem(FIRST_ASSET_KEY) === "1";

export const markFirstAssetPending = () => {
  sessionStorage.setItem(FIRST_ASSET_KEY, "1");
  firstAssetListeners.forEach((listener) => listener());
};

export const clearFirstAssetPending = () => {
  sessionStorage.removeItem(FIRST_ASSET_KEY);
  firstAssetListeners.forEach((listener) => listener());
};

export function VaultGate({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  const statusQuery = useQuery(vaultStatusQuery);
  const queryClient = useQueryClient();
  const [firstAssetPending, setFirstAssetPending] = useState(
    () => sessionStorage.getItem(FIRST_ASSET_KEY) === "1",
  );
  const status = statusQuery.data;

  useEffect(() => {
    const listener = () => setFirstAssetPending(sessionStorage.getItem(FIRST_ASSET_KEY) === "1");
    firstAssetListeners.add(listener);
    return () => {
      firstAssetListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (status?.state !== "open" || status.screenLock) return;
    let latestActivityAt = Date.now();
    let lockTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleStatusCheck = (activityAt: number) => {
      latestActivityAt = activityAt;
      if (lockTimer !== undefined) clearTimeout(lockTimer);
      const deadlineAt = activityAt + status.screenLockTimeoutMinutes * 60_000;
      lockTimer = setTimeout(
        () => {
          lockTimer = undefined;
          void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
        },
        Math.max(0, deadlineAt - Date.now()),
      );
    };
    const reporter = createActivityReporter({
      send: (activityAt) => {
        void Promise.resolve(engineApi.reportVaultActivity(activityAt)).catch(() => undefined);
      },
    });
    const bump = () => {
      scheduleStatusCheck(Date.now());
      reporter.report();
    };
    scheduleStatusCheck(latestActivityAt);
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      reporter.dispose();
      if (lockTimer !== undefined) clearTimeout(lockTimer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [queryClient, status]);

  if (statusQuery.isPending) {
    return (
      <Text color="fg.muted" as="p" role="status">
        {t("security.loading")}
      </Text>
    );
  }
  if (statusQuery.isError || status === undefined) {
    return <UnlockScreen />;
  }
  if (status.state === "absent" || firstAssetPending) {
    return <OnboardingScreen />;
  }
  if (status.state === "locked") {
    return <UnlockScreen />;
  }
  if (status.screenLock) {
    return <ScreenLockScreen status={status} />;
  }
  return children;
}
