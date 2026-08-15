import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { Stack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useQuery } from "@tanstack/react-query";
import type { DashboardAccountRow } from "@optimus/engine/api";

import { PageHeader, PageState } from "../components";
import { dashboardQuery } from "../queries";
import { AddAssetsButton } from "./add-assets";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

const valuedAmount = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const sourceLabel = (row: DashboardAccountRow) =>
  row.connectionId === null ? "Manual" : "Connected";

const rowDescription = (row: DashboardAccountRow) => {
  const context = row.connectionName ?? "Manual";
  const status = row.totalIncomplete
    ? "Incomplete valuation"
    : row.hasStalePrices
      ? "Delayed prices"
      : `${row.positionCount} holding${row.positionCount === 1 ? "" : "s"}`;
  return `${context} · ${status}`;
};

export function DashboardScreen() {
  const query = useQuery(dashboardQuery);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const accounts = query.data.accounts;
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Accounts across every institution and connection."
        action={<AddAssetsButton />}
      />
      {accounts.length === 0 ? (
        <EmptyState
          title="No assets yet"
          description="Connect a provider or track assets manually. Optimus will show every account here."
          actions={<AddAssetsButton />}
        />
      ) : (
        <List density="balanced" hasDividers header="Accounts">
          {accounts.map((row) => (
            <ListItem
              key={row.accountId}
              href={`/accounts/${row.accountId}`}
              label={row.accountName}
              description={rowDescription(row)}
              endContent={
                <Stack direction="horizontal" align="center" gap={2}>
                  <Token
                    label={sourceLabel(row)}
                    size="sm"
                    color={row.connectionId === null ? "gray" : "blue"}
                    icon={
                      <StatusDot
                        variant={row.connectionId === null ? "neutral" : "accent"}
                        label={sourceLabel(row)}
                      />
                    }
                  />
                  <Text hasTabularNumbers>
                    {valuedAmount.format(row.total)} {row.baseCurrencyIso}
                  </Text>
                </Stack>
              }
            />
          ))}
        </List>
      )}
    </>
  );
}
