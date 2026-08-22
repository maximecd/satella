import { MIN_VAULT_PASSWORD_LENGTH } from "@satella-app/engine/api";

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

export const passwordGuidance = (password: string) => {
  if (password.length === 0) {
    return `Choose at least ${MIN_VAULT_PASSWORD_LENGTH} characters. A password manager can create a long secret. Satella cannot recover a forgotten Vault password.`;
  }
  if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
    return `Vault password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters. Satella cannot recover it.`;
  }
  if (password.length < 16) {
    return "Consider a longer password or a password manager. Forgotten Vault passwords cannot be recovered.";
  }
  return "Strong length. Satella cannot recover this Vault password.";
};
