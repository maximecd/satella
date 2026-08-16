import { Box, Center, HStack, Input } from "@chakra-ui/react";

import { Field } from "../components/ui/field";

export function PinField({
  label,
  value,
  onChange,
  htmlName,
  invalid,
  errorText,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly htmlName: string;
  readonly invalid?: boolean;
  readonly errorText?: string | undefined;
}) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return (
    <Field label={label} invalid={invalid} errorText={errorText}>
      <Box position="relative">
        <Input
          name={htmlName}
          value={digits}
          maxLength={4}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
          position="absolute"
          inset="0"
          opacity="0"
          zIndex="1"
          letterSpacing="2.4em"
        />
        <HStack gap="2">
          {[0, 1, 2, 3].map((index) => (
            <Center
              key={index}
              w="12"
              h="12"
              borderWidth="1px"
              rounded="md"
              borderColor={digits.length === index ? "blue.solid" : "border"}
              bg="bg.panel"
              fontSize="xl"
              fontFamily="mono"
            >
              {digits[index] ?? ""}
            </Center>
          ))}
        </HStack>
      </Box>
    </Field>
  );
}
