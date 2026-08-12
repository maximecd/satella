import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createFormHook, createFormHookContexts, revalidateLogic } from "@tanstack/react-form";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

const message = (errors: ReadonlyArray<unknown>, label: string, value: string) => {
  const first = errors[0];
  if (first === undefined) return undefined;
  const raw =
    typeof first === "object" && first !== null && "message" in first
      ? String(first.message)
      : String(first);
  if (raw.includes("Expected a non empty string"))
    return value.trim() === "" ? `${label} is required.` : undefined;
  if (raw.includes('Unable to decode "" into a number'))
    return value.trim() === "" ? `${label} is required.` : undefined;
  if (raw.includes("into a number")) return `Enter a valid ${label.toLocaleLowerCase()}.`;
  if (raw.includes("Expected a string with no leading or trailing whitespace")) return undefined;
  return raw;
};

function TextField({
  label,
  number = false,
}: {
  readonly label: string;
  readonly number?: boolean;
}) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const error = message(field.state.meta.errors, label, field.state.value);
  const isOptional = label.toLocaleLowerCase().includes("optional");
  return (
    <form.Subscribe selector={(state) => state.submissionAttempts}>
      {(submissionAttempts) => (
        <TextInput
          label={label}
          isOptional={isOptional}
          value={field.state.value}
          onChange={(value) => field.handleChange(value)}
          onBlur={() => {
            const normalized = field.state.value.trim();
            if (normalized !== field.state.value) field.handleChange(normalized);
            field.handleBlur();
          }}
          htmlName={field.name}
          size="lg"
          statusVariant="detached"
          width="100%"
          {...(submissionAttempts === 0 || error === undefined
            ? {}
            : { status: { type: "error" as const, message: error } })}
          {...(number ? { inputMode: "decimal" } : {})}
        />
      )}
    </form.Subscribe>
  );
}

function SelectField({
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
      {(submissionAttempts) => (
        <Selector
          label={label}
          options={options}
          value={field.state.value}
          onChange={(value) => field.handleChange(value)}
          size="lg"
          statusVariant="detached"
          width="100%"
          {...(submissionAttempts === 0 || error === undefined
            ? {}
            : { status: { type: "error" as const, message: error } })}
        />
      )}
    </form.Subscribe>
  );
}

function SubmitButton({ label }: { readonly label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          label={label}
          type="submit"
          variant="primary"
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
        />
      )}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  fieldComponents: { TextField, SelectField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});

export const submitThenChangeValidation = revalidateLogic();
