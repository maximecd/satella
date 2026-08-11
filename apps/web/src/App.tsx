import { Button } from "@astryxdesign/core/Button";
import { useToast } from "@astryxdesign/core/Toast";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  page: {
    alignItems: "center",
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
  },
  content: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: 28,
    textAlign: "center",
  },
  heading: {
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: "clamp(3rem, 10vw, 6rem)",
    fontWeight: 600,
    letterSpacing: "-0.065em",
    lineHeight: 0.95,
    margin: 0,
  },
});

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
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.content)}>
        <h1 {...stylex.props(styles.heading)}>Hello world</h1>
        <Button clickAction={handleGetStarted} label="Get started" variant="primary" />
      </div>
    </main>
  );
}
