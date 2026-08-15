import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
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

const rowDescription = (row: DashboardAccountRow) => {
  const holdings = `${row.positionCount} holding${row.positionCount === 1 ? "" : "s"}`;
  const parts = [
    row.connectionName,
    holdings,
    row.totalIncomplete ? "Incomplete valuation" : null,
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
};

export function DashboardScreen() {
  const query = useQuery(dashboardQuery);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const accounts = query.data.accounts;
  return (
    <>
      <PageHeader title="Dashboard" action={<AddAssetsButton />} />
      {accounts.length === 0 ? (
        <EmptyState
          title="No assets yet"
          description="Connect a service or track assets manually. Optimus will show every account here."
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
                <Text hasTabularNumbers>
                  {valuedAmount.format(row.total)} {row.baseCurrencyIso}
                </Text>
              }
            />
          ))}
        </List>
      )}
    </>
  );
}
