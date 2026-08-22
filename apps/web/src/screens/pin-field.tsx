import { PinInput } from "@chakra-ui/react";
import { forwardRef, useImperativeHandle, useRef } from "react";

import { Field } from "../components/ui/field";

export type PinFieldHandle = {
  readonly focus: () => void;
};

export const PinField = forwardRef<PinFieldHandle, PinFieldProps>(function PinField(
  { label, value, onChange, htmlName, invalid, errorText, autoFocus },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      focus: () =>
        rootRef.current?.querySelectorAll<HTMLInputElement>("input[aria-label]")[0]?.focus(),
    }),
    [],
  );

  return (
    <Field label={label} invalid={invalid} errorText={errorText}>
      <PinInput.Root
        ref={rootRef}
        value={value === "" ? [] : [...value]}
        onValueChange={(details) => onChange(details.valueAsString)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.closest("form")?.requestSubmit();
        }}
        count={4}
        otp
        invalid={invalid}
        autoFocus={autoFocus}
        size="lg"
        width="fit-content"
      >
        <PinInput.HiddenInput name={htmlName} autoComplete="one-time-code" />
        <PinInput.Control>
          {[0, 1, 2, 3].map((index) => (
            <PinInput.Input key={index} index={index} aria-label={`${label} digit ${index + 1}`} />
          ))}
        </PinInput.Control>
      </PinInput.Root>
    </Field>
  );
});

interface PinFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly htmlName: string;
  readonly invalid?: boolean;
  readonly errorText?: string | undefined;
  readonly autoFocus?: boolean;
}
