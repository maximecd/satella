import { Icon, IconButton } from "@chakra-ui/react";
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

export const errorDetail = (cause: unknown): string => {
  if (cause instanceof Error) {
    const nested = cause.cause === undefined ? "" : `\nCaused by: ${errorDetail(cause.cause)}`;
    return `${cause.message}${nested}`;
  }
  const text = String(cause);
  return text.length > 0 ? text : "Unknown error";
};

export function CopyErrorButton({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  return (
    <IconButton
      aria-label="Copy error"
      title="Copy error"
      size="xs"
      variant="ghost"
      flexShrink={0}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1_500);
        });
      }}
    >
      <Icon asChild>{copied ? <Check /> : <Copy />}</Icon>
    </IconButton>
  );
}
