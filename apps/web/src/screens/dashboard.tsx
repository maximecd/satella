import { Alert, Box, Card, Grid, Heading, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader, PageState } from "../components";
import { EmptyState } from "../components/ui/empty-state";
import { SegmentedControl } from "../components/ui/segmented-control";
import { useDashboard } from "../portfolio";
import {
  isHourlyRange,
  observationsInRange,
  periodChange,
  PORTFOLIO_VALUE_RANGES,
  type PortfolioValueRange,
} from "../portfolio-history";
import { AddAssetsButton } from "./add-assets";
import { AllocationTreemap, PortfolioValueChart } from "./dashboard-charts";
import { compareDecimal, formatAmount, formatDecimal, subtractDecimal } from "../financial-number";

const changeLabel = (
  change: ReturnType<typeof periodChange>,
  currencyIso: string,
  notEnoughHistory: string,
): string => {
  if (change === null) return notEnoughHistory;
  const absolute = `${compareDecimal(change.absolute, "0") >= 0 ? "+" : ""}${formatAmount(change.absolute, currencyIso)}`;
  if (change.percent === null) return absolute;
  const sign = compareDecimal(change.percent, "0") >= 0 ? "+" : "";
  return `${absolute} (${sign}${formatDecimal(change.percent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
};

export function DashboardScreen() {
  const { t } = useTranslation();
  const query = useDashboard();
  const [range, setRange] = useState<PortfolioValueRange>("1M");
  const [allocationView, setAllocationView] = useState<"categories" | "assets">("categories");
  const [netMode, setNetMode] = useState(false);
  const requestFailed = t("errors.requestFailed");
  const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : requestFailed);
  if (query.isPending) return <PageState kind="pending" />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const dashboard = query.data;
  const iso = dashboard.reportingCurrency.iso;
  if (!dashboard.hasMeaningfulAssets) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} action={<AddAssetsButton />} />
        <EmptyState
          title={t("dashboard.empty.title")}
          description={t("dashboard.empty.description")}
        >
          <AddAssetsButton />
        </EmptyState>
      </>
    );
  }
  const history = observationsInRange(dashboard.history, range);
  const hasDebts = compareDecimal(dashboard.totalDebt, "0") > 0;
  const worthHistory = netMode
    ? history.map((point) => ({ ...point, total: subtractDecimal(point.total, point.totalDebt) }))
    : history;
  const change = periodChange(worthHistory);
  const allocation =
    allocationView === "assets" ? dashboard.assetAllocation : dashboard.categoryAllocation;
  const unpriced =
    dashboard.unpricedAssetCount === 0
      ? null
      : t("dashboard.allocation.unpricedExcluded", { count: dashboard.unpricedAssetCount });
  return (
    <>
      <PageHeader title={t("dashboard.title")} action={<AddAssetsButton />} />
      <Grid templateColumns={{ base: "1fr", lg: "2fr 1fr" }} gap="4">
        <Card.Root>
          <Card.Body>
            <Stack gap="4">
              <Stack gap="1">
                <Heading as="h2" size="md">
                  {netMode ? t("dashboard.netWorth.title") : t("dashboard.totalAssets.title")}
                </Heading>
                <Text fontSize="2xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">
                  {formatAmount(netMode ? dashboard.netWorth : dashboard.totalAssets, iso)}
                </Text>
                {netMode ? (
                  <Text color="fg.muted">
                    {t("dashboard.netWorth.debtsSubline", {
                      amount: formatAmount(dashboard.totalDebt, iso),
                    })}
                  </Text>
                ) : null}
                <Text color="fg.muted">
                  <Text as="span" fontWeight="medium">
                    {netMode
                      ? t("dashboard.netWorth.changeLabel")
                      : t("dashboard.totalAssets.changeLabel")}
                  </Text>{" "}
                  <Text as="span">
                    {changeLabel(change, iso, t("dashboard.totalAssets.notEnoughHistory"))}
                  </Text>
                </Text>
              </Stack>
              {hasDebts ? (
                <Box alignSelf="flex-start">
                  <SegmentedControl
                    aria-label={t("dashboard.netWorth.toggleAriaLabel")}
                    size="sm"
                    value={netMode ? "net" : "gross"}
                    onValueChange={(details) => {
                      setNetMode(details.value === "net");
                    }}
                    items={[
                      { value: "gross", label: t("dashboard.totalAssets.title") },
                      { value: "net", label: t("dashboard.netWorth.title") },
                    ]}
                  />
                </Box>
              ) : null}
              <Box alignSelf="flex-start">
                <SegmentedControl
                  aria-label={t("dashboard.totalAssets.rangeAriaLabel")}
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
                <PortfolioValueChart
                  points={worthHistory}
                  currencyIso={iso}
                  hourly={isHourlyRange(range)}
                  ariaLabel={
                    netMode
                      ? t("dashboard.charts.netHistoryAriaLabel")
                      : t("dashboard.charts.historyAriaLabel")
                  }
                  categoryAllocation={netMode ? undefined : dashboard.categoryAllocation}
                  totalSeriesLabel={netMode ? t("dashboard.netWorth.title") : undefined}
                />
              ) : null}
              {dashboard.totalIncomplete ? (
                <Alert.Root status="warning">
                  <Alert.Indicator />
                  <Alert.Title>{t("dashboard.incompleteValuation")}</Alert.Title>
                </Alert.Root>
              ) : null}
            </Stack>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <Stack gap="4">
              <Heading as="h2" size="md">
                {t("dashboard.allocation.title")}
              </Heading>
              <SegmentedControl
                aria-label={t("dashboard.allocation.ariaLabel")}
                size="sm"
                w="fit-content"
                value={allocationView}
                onValueChange={(details) => {
                  // SAFETY: The segmented control items are exactly the allocation view literals.
                  setAllocationView(details.value as "categories" | "assets");
                }}
                items={[
                  { value: "categories", label: t("dashboard.allocation.categories") },
                  { value: "assets", label: t("dashboard.allocation.assets") },
                ]}
              />
              {allocation.length > 0 ? (
                <AllocationTreemap cells={allocation} currencyIso={iso} />
              ) : (
                <Text color="fg.muted">{t("dashboard.allocation.empty")}</Text>
              )}
              {unpriced ? <Text color="fg.muted">{unpriced}</Text> : null}
              {dashboard.negativeHoldingCount > 0 ? (
                <Text color="fg.muted">{t("dashboard.allocation.negativeExcluded")}</Text>
              ) : null}
            </Stack>
          </Card.Body>
        </Card.Root>
      </Grid>
    </>
  );
}
