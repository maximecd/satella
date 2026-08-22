import { Card, Center, Heading, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export function GateLayout({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <Center minH="100dvh" p={{ base: 4, md: 8 }} bg="bg.subtle">
      <Card.Root w="full" maxW="md">
        <Card.Body>
          <Stack gap="6" align="stretch">
            <Stack gap="2">
              <Heading as="h1" size="xl">
                {title}
              </Heading>
              {description ? <Text color="fg.muted">{description}</Text> : null}
            </Stack>
            {children}
          </Stack>
        </Card.Body>
      </Card.Root>
    </Center>
  );
}
