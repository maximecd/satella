import { Button, Card, Code, Heading, Icon, IconButton, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { engineApi } from "../api";
import { FormError } from "../components";
import { engineUrl } from "../runtime";
import { SecretField } from "./secret-field";

const mcpTokenQueryKey = ["vault", "mcp-token"] as const;

const fallbackMcpUrl = () => {
  const origin = engineUrl();
  if (origin.length > 0) return `${origin.replace(/\/$/u, "")}/mcp`;
  return `${window.location.origin}/mcp`;
};

function CopyButton({ value, label }: { readonly value: string; readonly label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  return (
    <IconButton
      aria-label={label}
      title={label}
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

export function SettingsMcpCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: mcpTokenQueryKey,
    queryFn: engineApi.mcpTokenStatus,
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    readonly token: string;
    readonly url: string;
    readonly authorizationHeader: string;
  } | null>(null);
  const issue = useMutation({
    mutationFn: engineApi.issueMcpToken,
    onSuccess: (result) => {
      setError(null);
      setPassword("");
      setIssued(result);
      queryClient.setQueryData(mcpTokenQueryKey, { configured: true, url: result.url });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : t("errors.requestFailed")),
  });
  const url = issued?.url ?? statusQuery.data?.url ?? fallbackMcpUrl();
  const configured = issued !== null || statusQuery.data?.configured === true;
  const snippet = issued === null ? url : `${issued.url}\n\n${issued.authorizationHeader}`;
  return (
    <Card.Root>
      <Card.Body>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            issue.mutate(password);
          }}
        >
          <Stack gap="4">
            <Heading as="h2" size="md">
              {t("security.settings.mcp.heading")}
            </Heading>
            <Text color="fg.muted" as="p">
              {t("security.settings.mcp.description")}
            </Text>
            <FormError message={error} />
            <Stack gap="1">
              <Text fontWeight="medium">{t("security.settings.mcp.urlLabel")}</Text>
              <Stack direction="row" align="flex-start" gap="2">
                <Code whiteSpace="pre-wrap" wordBreak="break-all" flex="1">
                  {snippet}
                </Code>
                <CopyButton value={snippet} label={t("security.settings.mcp.copy")} />
              </Stack>
            </Stack>
            {issued !== null ? (
              <Text color="fg.muted" as="p">
                {t("security.settings.mcp.shownOnce")}
              </Text>
            ) : configured ? (
              <Text color="fg.muted" as="p">
                {t("security.settings.mcp.configured")}
              </Text>
            ) : null}
            <SecretField
              label={t("security.settings.mcp.passwordLabel")}
              value={password}
              onChange={setPassword}
              htmlName="mcp-token-vault-password"
              autoComplete="current-password"
            />
            <Button
              type="submit"
              colorPalette="blue"
              disabled={password.length === 0 || issue.isPending}
              loading={issue.isPending}
            >
              {configured
                ? t("security.settings.mcp.regenerate")
                : t("security.settings.mcp.create")}
            </Button>
          </Stack>
        </form>
      </Card.Body>
    </Card.Root>
  );
}
