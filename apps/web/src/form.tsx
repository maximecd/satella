import { Button, Input } from "@chakra-ui/react";
import { createFormHook, createFormHookContexts, revalidateLogic } from "@tanstack/react-form";

import { Field } from "./components/ui/field";
import { SelectField } from "./select-field";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

type MessageLike = {
  readonly message: unknown;
};

const isObjectLike = (cause: unknown): cause is object =>
  cause !== null &&
  cause !== undefined &&
  Object.prototype.toString.call(cause) === "[object Object]";

const hasMessage = (cause: unknown): cause is MessageLike =>
  isObjectLike(cause) && "message" in cause;

const message = (errors: ReadonlyArray<unknown>, label: string, value: string) => {
  const first = errors[0];
  if (first === undefined) return undefined;
  const raw = hasMessage(first) ? String(first.message) : String(first);
  if (raw.includes("Expected a non empty string") || raw.includes("a length of at least 1"))
    return value.trim() === "" ? `${label} is required.` : undefined;
  if (
    raw.includes('Unable to decode "" into a number') ||
    (value.trim() === "" && raw.includes("decoded as a number"))
  )
    return value.trim() === "" ? `${label} is required.` : undefined;
  if (
    raw.includes("into a number") ||
    raw.includes("decoded as a number") ||
    raw.includes("Expected a finite number")
  )
    return `Enter a valid ${label.toLocaleLowerCase()}.`;
  if (raw.includes("Expected a string with no leading or trailing whitespace")) return undefined;
  return raw;
};

function TextField({
  label,
  number,
  disabled,
  optional,
  onValueChange,
}: {
  readonly label: string;
  readonly number?: boolean;
  readonly disabled?: boolean;
  readonly optional?: boolean;
  readonly onValueChange?: (value: string) => void;
}) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const error = message(field.state.meta.errors, label, field.state.value);
  const isOptional = optional ?? label.toLocaleLowerCase().includes("optional");
  return (
    <form.Subscribe selector={(state) => state.submissionAttempts}>
      {(submissionAttempts) => {
        const invalid = submissionAttempts > 0 && error !== undefined;
        return (
          <Field
            label={label}
            invalid={invalid}
            errorText={invalid ? error : undefined}
            optionalText={isOptional ? "optional" : undefined}
          >
            <Input
              name={field.name}
              value={field.state.value}
              disabled={disabled}
              inputMode={number ? "decimal" : undefined}
              onChange={(event) => {
                const value = event.target.value;
                field.handleChange(value);
                onValueChange?.(value);
              }}
              onBlur={() => {
                const normalized = field.state.value.trim();
                if (normalized !== field.state.value) field.handleChange(normalized);
                field.handleBlur();
              }}
            />
          </Field>
        );
      }}
    </form.Subscribe>
  );
}

function SelectFormField({
  label,
  options,
}: {
  readonly label: string;
  readonly options: Array<{ readonly label: string; readonly value: string }>;
}) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const error = message(field.state.meta.errors, label, field.state.value);
  return (
    <form.Subscribe selector={(state) => state.submissionAttempts}>
      {(submissionAttempts) => {
        const invalid = submissionAttempts > 0 && error !== undefined;
        return (
          <SelectField
            label={label}
            options={options}
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
            invalid={invalid}
            errorText={invalid ? error : undefined}
          />
        );
      }}
    </form.Subscribe>
  );
}

function SubmitButton({ label }: { readonly label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" colorPalette="blue" disabled={isSubmitting} loading={isSubmitting}>
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  fieldComponents: { TextField, SelectField: SelectFormField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});

export const submitThenChangeValidation = revalidateLogic();
