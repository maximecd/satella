import { MIN_VAULT_PASSWORD_LENGTH } from "@satella-app/engine/api";
import type { TFunction } from "i18next";

import { Field } from "../components/ui/field";
import { PasswordInput } from "../components/ui/password-input";

export function SecretField({
  label,
  value,
  onChange,
  description,
  htmlName,
  autoComplete,
  status,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly description?: string;
  readonly htmlName: string;
  readonly autoComplete?: string;
  readonly status?: { readonly type: "error"; readonly message: string };
}) {
  return (
    <Field
      label={label}
      helperText={description}
      invalid={status !== undefined}
      errorText={status?.message}
      width="full"
    >
      <PasswordInput
        name={htmlName}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export const passwordGuidance = (password: string, t: TFunction) => {
  if (password.length === 0) {
    return t("security.passwordGuidance.empty", { min: MIN_VAULT_PASSWORD_LENGTH });
  }
  if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
    return t("security.passwordGuidance.tooShort", { min: MIN_VAULT_PASSWORD_LENGTH });
  }
  if (password.length < 16) {
    return t("security.passwordGuidance.considerLonger");
  }
  return t("security.passwordGuidance.strongLength");
};
