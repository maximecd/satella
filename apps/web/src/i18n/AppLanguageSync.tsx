import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { vaultStatusQuery } from "../queries";
import { useSettings } from "../portfolio";
import { isFirstAssetPending, firstAssetListeners } from "../screens/vault-gate";
import { changeAppLanguage } from "./index";

export function AppLanguageSync() {
  const { data: settings } = useSettings();
  const { data: status } = useQuery(vaultStatusQuery);
  const [firstAssetPending, setFirstAssetPending] = useState(isFirstAssetPending);
  useEffect(() => {
    const listener = () => setFirstAssetPending(isFirstAssetPending());
    firstAssetListeners.add(listener);
    return () => {
      firstAssetListeners.delete(listener);
    };
  }, []);
  const language = settings?.language;
  // While the Vault is still being created (onboarding), the OS-detected
  // language rules; afterwards the language stored in the Vault wins.
  const onboarding = status === undefined || status.state === "absent" || firstAssetPending;
  useEffect(() => {
    if (language !== undefined && !onboarding) changeAppLanguage(language);
  }, [language, onboarding]);
  return null;
}
