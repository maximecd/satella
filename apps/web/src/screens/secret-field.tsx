import { Button } from "@astryxdesign/core/Button";
import { Stack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";

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
  const [visible, setVisible] = useState(false);
  return (
    <Stack gap={2}>
      <TextInput
        label={label}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        htmlName={htmlName}
        width="100%"
        statusVariant="detached"
        {...(description === undefined ? {} : { description })}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(status === undefined ? {} : { status })}
      />
      <Button
        label={visible ? "Hide" : "Show"}
        variant="ghost"
        onClick={() => setVisible((current) => !current)}
      />
    </Stack>
  );
}

export const passwordGuidance = (password: string) => {
  if (password.length === 0) {
    return "Choose at least 12 characters. A password manager can create a long secret. Optimus cannot recover a forgotten Vault password.";
  }
  if (password.length < 12) {
    return "Vault password must be at least 12 characters. Optimus cannot recover it.";
  }
  if (password.length < 16) {
    return "Consider a longer password or a password manager. Forgotten Vault passwords cannot be recovered.";
  }
  return "Strong length. Optimus cannot recover this Vault password.";
};
