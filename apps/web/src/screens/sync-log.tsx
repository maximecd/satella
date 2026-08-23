import { Badge, Button, Card, Flex, Stack, Text } from "@chakra-ui/react";
import type { SyncLogEntry } from "@satella-app/engine/api";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/ui/empty-state";
import { PageBreadcrumbs, PageHeader, PageState } from "../components";
import { useSyncLog } from "../portfolio";

const entryDate = (completedAt: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(completedAt));

function SyncLogRow({ entry }: { readonly entry: SyncLogEntry }) {
  const { t, i18n } = useTranslation();
  const outcomeLabel = t(`settings.syncLog.outcomes.${entry.outcome}`);
  return (
    <Card.Root variant="outline">
      <Card.Body>
        <Stack gap="2">
          <Flex direction={{ base: "column", md: "row" }} justify="space-between" gap="3">
            <Stack gap="1" minW="0">
              <Text fontWeight="medium" overflowWrap="anywhere">
                {entry.subjectName}
              </Text>
              <Text color="fg.muted" fontSize="sm" overflowWrap="anywhere">
                {t(`settings.syncLog.subjects.${entry.subjectKind}`)} ·{" "}
                {t(`settings.syncLog.actions.${entry.action}`)}
              </Text>
            </Stack>
            <Stack gap="1" align={{ base: "flex-start", md: "flex-end" }} flexShrink="0">
              <Badge
                colorPalette={entry.outcome === "success" ? "green" : "red"}
                aria-label={outcomeLabel}
              >
                {outcomeLabel}
              </Badge>
              <Text color="fg.muted" fontSize="sm">
                {entryDate(entry.completedAt, i18n.language)}
              </Text>
            </Stack>
          </Flex>
          {entry.failureReason !== null ? (
            <Text color="fg.muted" fontSize="sm" overflowWrap="anywhere">
              <Text as="span" fontWeight="medium" color="fg.default">
                {t("settings.syncLog.failureReason")}:
              </Text>{" "}
              {entry.failureReason}
            </Text>
          ) : null}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

export function SyncLogScreen() {
  const { t } = useTranslation();
  const query = useSyncLog();
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");

  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;

  const entries = query.data.pages.flatMap((page) => page.entries);
  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: t("settings.title"), href: "/settings" },
          { label: t("settings.syncLog.title") },
        ]}
      />
      <PageHeader title={t("settings.syncLog.title")} />
      {entries.length === 0 ? (
        <EmptyState
          title={t("settings.syncLog.empty.title")}
          description={t("settings.syncLog.empty.description")}
        />
      ) : (
        <Stack as="section" aria-label={t("settings.syncLog.title")} gap="3">
          {entries.map((entry) => (
            <SyncLogRow key={entry.id} entry={entry} />
          ))}
          {query.hasNextPage ? (
            <Button
              alignSelf="center"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage
                ? t("settings.syncLog.loadingMore")
                : t("settings.syncLog.loadMore")}
            </Button>
          ) : null}
        </Stack>
      )}
    </>
  );
}
