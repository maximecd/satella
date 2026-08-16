import { NativeSelect } from "@chakra-ui/react";

import { Field } from "./components/ui/field";

export type SelectOption = {
  readonly label: string;
  readonly value: string;
};

export function SelectField({
  label,
  options,
  value,
  onChange,
  helperText,
  errorText,
  invalid,
  disabled,
  name,
  placeholder,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<SelectOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly helperText?: string | undefined;
  readonly errorText?: string | undefined;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly placeholder?: string | undefined;
}) {
  return (
    <Field
      label={label}
      helperText={helperText}
      errorText={errorText}
      invalid={invalid}
      width="full"
    >
      <NativeSelect.Root disabled={disabled} width="full">
        <NativeSelect.Field
          name={name}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {placeholder === undefined ? null : <option value="">{placeholder}</option>}
          {options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field>
  );
}
