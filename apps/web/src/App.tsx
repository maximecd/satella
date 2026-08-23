import { Button, Center, Heading, Stack } from "@chakra-ui/react";

import { notify } from "./components/ui/toaster";
import { errorDetail } from "./components/ui/copy-error";

export function App() {
  const handleGetStarted = async () => {
    try {
      const { getHello } = await import("./api");
      const response = await getHello();
      notify.success(response.message);
    } catch (cause) {
      notify.error("The engine could not be reached.", undefined, true, errorDetail(cause));
    }
  };

  return (
    <Center h="100vh">
      <Stack align="center" gap="4">
        <Heading as="h1" size="2xl">
          Hello world
        </Heading>
        <Button colorPalette="blue" onClick={() => void handleGetStarted()}>
          Get started
        </Button>
      </Stack>
    </Center>
  );
}
