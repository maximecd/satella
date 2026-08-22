import { Alert, Box, Card, Grid, Heading, Stack, Text } from "@chakra-ui/react";
import type { DashboardAccountRow, DashboardCustodianGroup } from "@optimus/engine/api";
import { useState } from "react";

import { NavRow, PageHeader, PageState } from "../components";
import { EmptyState } from "../components/ui/empty-state";
import { SegmentedControl } from "../components/ui/segmented-control";
import { useDashboard } from "../portfolio";
import {
  observationsInRange,
  periodChange,
  PORTFOLIO_VALUE_RANGES,
  type PortfolioValueRange,
} from "../portfolio-history";
import { AddAssetsButton } from "./add-assets";
import { AllocationTreemap, PortfolioValueChart } from "./dashboard-charts";
import {
  compareDecimal,
  formatAmount,
  formatDecimal,
  formatSignedAmount,
  multiplyDecimal,
} from "../financial-number";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

const groupLabel = (group: DashboardCustodianGroup) =>
  group.isDefault ? "Other holdings" : group.name;

const rowDescription = (row: DashboardAccountRow) => {
  const holdings = `${row.positionCount} holding${row.positionCount === 1 ? "" : "s"}`;
  const parts = [holdings, row.totalIncomplete ? "Incomplete valuation" : null].filter(
    (part): part is string => part !== null,
  );
  return parts.join(" · ");
};

const changeLabel = (change: ReturnType<typeof periodChange>, currencyIso: string): string => {
  if (change === null) return "Not enough history";
  const absolute = `${compareDecimal(change.absolute, "0") >= 0 ? "+" : ""}${formatAmount(change.absolute, currencyIso)}`;
  if (change.percent === null) return absolute;
  const sign = compareDecimal(change.percent, "0") >= 0 ? "+" : "";
  return `${absolute} (${sign}${formatDecimal(change.percent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
};

const pnlColor = (value: string) =>
  compareDecimal(value, "0") > 0
    ? "green.fg"
    : compareDecimal(value, "0") < 0
      ? "red.fg"
      : "fg.muted";

const pnlPercent = (value: string | null) =>
  value === null
    ? ""
    : ` (${compareDecimal(value, "0") > 0 ? "+" : ""}${formatDecimal(
        multiplyDecimal(value, "100"),
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )}%)`;

export function DashboardScreen() {
  const query = useDashboard();
  const [range, setRange] = useState<PortfolioValueRange>("1M");
  const [allocationView, setAllocationView] = useState<"custodians" | "categories" | "assets">(
    "custodians",
  );
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
        >
          <AddAssetsButton />
        </EmptyState>
      </>
    );
  }
  const history = observationsInRange(dashboard.history, range);
  const change = periodChange(history);
  const allocation =
    allocationView === "assets"
      ? dashboard.assetAllocation
      : allocationView === "categories"
        ? dashboard.categoryAllocation
        : dashboard.custodianAllocation;
  const unpriced =
    dashboard.unpricedAssetCount === 0
      ? null
      : `${dashboard.unpricedAssetCount} unpriced asset${dashboard.unpricedAssetCount === 1 ? "" : "s"} excluded from allocation.`;
  return (
    <>
      <PageHeader title="Dashboard" action={<AddAssetsButton />} />
      <Grid templateColumns={{ base: "1fr", lg: "2fr 1fr" }} gap="4">
        <Card.Root>
          <Card.Body>
            <Stack gap="4">
              <Stack gap="1">
                <Heading as="h2" size="md">
                  Portfolio value
                </Heading>
                <Text fontSize="2xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">
                  {formatAmount(dashboard.portfolioValue, iso)}
                </Text>
                <Text fontWeight="medium">Unrealized P&amp;L</Text>
                <Text
                  fontSize="lg"
                  fontVariantNumeric="tabular-nums"
                  color={pnlColor(dashboard.unrealizedPnl)}
                >
                  {formatSignedAmount(dashboard.unrealizedPnl, iso)}
                  {dashboard.unrealizedPnlPercent === null
                    ? ""
                    : ` (${compareDecimal(dashboard.unrealizedPnlPercent, "0") > 0 ? "+" : ""}${formatDecimal(
                        multiplyDecimal(dashboard.unrealizedPnlPercent, "100"),
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}%)`}
                </Text>
                <Text color="fg.muted">
                  <Text as="span" fontWeight="medium">
                    Portfolio value change:
                  </Text>{" "}
                  <Text as="span">{changeLabel(change, iso)}</Text>
                </Text>
              </Stack>
              <Box alignSelf="flex-start">
                <SegmentedControl
                  aria-label="Portfolio value range"
                  size="sm"
                  value={range}
                  onValueChange={(details) => {
                    // SAFETY: The segmented control items are exactly the PortfolioValueRange literals.
                    setRange(details.value as PortfolioValueRange);
                  }}
                  items={[...PORTFOLIO_VALUE_RANGES]}
                />
              </Box>
              {history.length >= 2 ? (
                <PortfolioValueChart points={history} currencyIso={iso} />
              ) : null}
              {dashboard.totalIncomplete ? (
                <Alert.Root status="warning">
                  <Alert.Indicator />
                  <Alert.Title>Incomplete valuation</Alert.Title>
                </Alert.Root>
              ) : null}
            </Stack>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <Stack gap="4">
              <Heading as="h2" size="md">
                Allocation
              </Heading>
              <Box alignSelf="flex-start">
                <SegmentedControl
                  aria-label="Allocation"
                  size="sm"
                  value={allocationView}
                  onValueChange={(details) => {
                    // SAFETY: The segmented control items are exactly the three allocation view literals.
                    setAllocationView(details.value as "custodians" | "categories" | "assets");
                  }}
                  items={[
                    { value: "custodians", label: "Custodians" },
                    { value: "categories", label: "Categories" },
                    { value: "assets", label: "Assets" },
                  ]}
                />
              </Box>
              {allocation.length > 0 ? (
                <AllocationTreemap cells={allocation} currencyIso={iso} />
              ) : (
                <Text color="fg.muted">No priced allocation to show.</Text>
              )}
              {unpriced ? <Text color="fg.muted">{unpriced}</Text> : null}
              {dashboard.negativeHoldingCount > 0 ? (
                <Text color="fg.muted">Negative holdings are excluded from allocation.</Text>
              ) : null}
            </Stack>
          </Card.Body>
        </Card.Root>
        <Card.Root gridColumn={{ base: "auto", lg: "1 / -1" }}>
          <Card.Body>
            <Stack gap="6">
              {dashboard.custodians.map((group) => (
                <Stack key={group.custodianId} gap="2">
                  <Heading as="h2" size="md">
                    {groupLabel(group)}
                  </Heading>
                  <Box as="ul" m="0" p="0">
                    {group.accounts.map((row) => (
                      <NavRow
                        key={row.accountId}
                        href={`/accounts/${row.accountId}`}
                        label={group.isDefault ? "Other holdings" : row.accountName}
                        description={rowDescription(row)}
                        endContent={
                          <Stack align="flex-end" gap="0" fontVariantNumeric="tabular-nums">
                            <Text>{formatAmount(row.total, iso)}</Text>
                            <Text color={pnlColor(row.unrealizedPnl)} fontSize="sm">
                              P&amp;L {formatSignedAmount(row.unrealizedPnl, iso)}
                              {pnlPercent(row.unrealizedPnlPercent)}
                            </Text>
                          </Stack>
                        }
                      />
                    ))}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Card.Body>
        </Card.Root>
      </Grid>
    </>
  );
}
