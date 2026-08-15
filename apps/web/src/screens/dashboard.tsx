import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import type { DashboardAccountRow } from "@optimus/engine/api";
import { useState } from "react";

import { PageHeader, PageState } from "../components";
import {
  observationsInRange,
  periodChange,
  PORTFOLIO_VALUE_RANGES,
  type PortfolioValueRange,
} from "../portfolio-history";
import { dashboardQuery } from "../queries";
import { AddAssetsButton } from "./add-assets";
import { AllocationTreemap, PortfolioValueChart } from "./dashboard-charts";

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

const changeLabel = (change: ReturnType<typeof periodChange>, currencyIso: string): string => {
  if (change === null) return "Not enough history";
  const absolute = `${change.absolute >= 0 ? "+" : ""}${valuedAmount.format(change.absolute)} ${currencyIso}`;
  if (change.percent === null) return absolute;
  const sign = change.percent >= 0 ? "+" : "";
  return `${absolute} (${sign}${change.percent.toFixed(2)}%)`;
};

export function DashboardScreen() {
  const query = useQuery(dashboardQuery);
  const [range, setRange] = useState<PortfolioValueRange>("1M");
  const [allocationView, setAllocationView] = useState<"assets" | "categories">("assets");
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const dashboard = query.data;
  const iso = dashboard.reportingCurrency.iso;
  if (!dashboard.hasMeaningfulAssets) {
    return (
      <>
        <PageHeader title="Dashboard" action={<AddAssetsButton />} />
        <EmptyState
          title="No assets yet"
          description="Connect a provider or track assets manually. Optimus will show Portfolio value, allocation, and accounts here."
          actions={<AddAssetsButton />}
        />
      </>
    );
  }
  const history = observationsInRange(dashboard.history, range);
  const change = periodChange(history);
  const allocation =
    allocationView === "assets" ? dashboard.assetAllocation : dashboard.categoryAllocation;
  const unpriced =
    dashboard.unpricedAssetCount === 0
      ? null
      : `${dashboard.unpricedAssetCount} unpriced asset${dashboard.unpricedAssetCount === 1 ? "" : "s"} excluded from allocation.`;
  return (
    <>
      <PageHeader title="Dashboard" action={<AddAssetsButton />} />
      <Grid columns={{ minWidth: 360, max: 3 }} gap={4}>
        <GridSpan columns={2}>
          <Card padding={4}>
            <Stack gap={4}>
              <Stack gap={1}>
                <Heading level={2}>Portfolio value</Heading>
                <Text hasTabularNumbers>
                  {valuedAmount.format(dashboard.portfolioValue)} {iso}
                </Text>
                <Text type="supporting">{changeLabel(change, iso)}</Text>
              </Stack>
              <SegmentedControl
                label="Portfolio value range"
                value={range}
                onChange={(value) => setRange(value as PortfolioValueRange)}
                size="sm"
              >
                {PORTFOLIO_VALUE_RANGES.map((value) => (
                  <SegmentedControlItem key={value} value={value} label={value} />
                ))}
              </SegmentedControl>
              {history.length >= 2 ? (
                <PortfolioValueChart points={history} currencyIso={iso} />
              ) : null}
              {dashboard.totalIncomplete ? (
                <Banner status="warning" title="Incomplete valuation" />
              ) : null}
            </Stack>
          </Card>
        </GridSpan>
        <GridSpan columns={1}>
          <Card padding={4}>
            <Stack gap={4}>
              <Heading level={2}>Allocation</Heading>
              <SegmentedControl
                label="Allocation"
                value={allocationView}
                onChange={(value) => setAllocationView(value as "assets" | "categories")}
                size="sm"
              >
                <SegmentedControlItem value="assets" label="Assets" />
                <SegmentedControlItem value="categories" label="Categories" />
              </SegmentedControl>
              {allocation.length > 0 ? (
                <AllocationTreemap cells={allocation} currencyIso={iso} />
              ) : (
                <Text type="supporting">No priced allocation to show.</Text>
              )}
              {unpriced ? <Text type="supporting">{unpriced}</Text> : null}
              {dashboard.negativeHoldingCount > 0 ? (
                <Text type="supporting">Negative holdings are excluded from allocation.</Text>
              ) : null}
            </Stack>
          </Card>
        </GridSpan>
        <GridSpan columns="full">
          <List density="balanced" hasDividers header="Accounts">
            {dashboard.accounts.map((row) => (
              <ListItem
                key={row.accountId}
                href={`/accounts/${row.accountId}`}
                label={row.accountName}
                description={rowDescription(row)}
                endContent={
                  <Text hasTabularNumbers>
                    {valuedAmount.format(row.total)} {iso}
                  </Text>
                }
              />
            ))}
          </List>
        </GridSpan>
      </Grid>
    </>
  );
}
