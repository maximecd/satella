import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { useToast } from "@astryxdesign/core/Toast";

export function App() {
  const toast = useToast();

  const handleGetStarted = async () => {
    try {
      const { getHello } = await import("./api");
      const response = await getHello();
      toast({ body: response.message });
    } catch {
      toast({
        body: "The engine could not be reached.",
        isAutoHide: false,
        type: "error",
      });
    }
  };

  return (
    <Stack align="center" justify="center" gap={4} height="100vh">
      <Heading level={1}>Hello world</Heading>
      <Button clickAction={handleGetStarted} label="Get started" variant="primary" />
    </Stack>
  );
}
