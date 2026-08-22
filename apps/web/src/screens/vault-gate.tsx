import { Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  const lock = useMutation({
    mutationFn: engineApi.lockScreen,
    onSuccess: (status) => queryClient.setQueryData(vaultStatusQuery.queryKey, status),
  });
  const status = statusQuery.data;
  const timeoutMinutes = status?.state === "open" ? status.screenLockTimeoutMinutes : 15;

  useEffect(() => {
    const listener = () => setFirstAssetPending(sessionStorage.getItem(FIRST_ASSET_KEY) === "1");
    firstAssetListeners.add(listener);
    return () => {
      firstAssetListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (status?.state !== "open" || status.screenLock) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const timer = window.setInterval(() => {
      if (Date.now() - last >= timeoutMinutes * 60_000) {
        lock.mutate();
      }
    }, 15_000);
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [lock, status, timeoutMinutes]);

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
