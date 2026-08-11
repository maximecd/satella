import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

const message = (errors: ReadonlyArray<unknown>) => {
  const first = errors[0];
  if (first === undefined) return undefined;
  if (typeof first === "object" && first !== null && "message" in first)
    return String(first.message);
  return String(first);
};

function TextField({
  label,
  number = false,
}: {
  readonly label: string;
  readonly number?: boolean;
}) {
  const field = useFieldContext<string>();
  const error = message(field.state.meta.errors);
  return (
    <TextInput
      label={label}
      value={field.state.value}
      onChange={(value) => field.handleChange(value)}
      onBlur={field.handleBlur}
      htmlName={field.name}
      width="100%"
      {...(error === undefined ? {} : { status: { type: "error" as const, message: error } })}
      {...(number ? { inputMode: "decimal" } : {})}
    />
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
  const error = message(field.state.meta.errors);
  return (
    <Selector
      label={label}
      options={options}
      value={field.state.value}
      onChange={(value) => field.handleChange(value)}
      width="100%"
      {...(error === undefined ? {} : { status: { type: "error" as const, message: error } })}
    />
  );
}

function SubmitButton({ label }: { readonly label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button
          label={label}
          type="submit"
          variant="primary"
          isDisabled={!canSubmit}
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
