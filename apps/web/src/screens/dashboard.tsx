import { Alert, Box, Card, Grid, Heading, Stack, Text } from "@chakra-ui/react";
import type { DashboardAccountRow } from "@satella-app/engine/api";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { NavRow, PageHeader, PageState } from "../components";
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
import { compareDecimal, formatAmount, formatDecimal } from "../financial-number";

const rowDescription = (row: DashboardAccountRow, t: TFunction) => {
  const holdings = t("dashboard.accounts.holdingsCount", { count: row.positionCount });
  const parts = [holdings, row.totalIncomplete ? t("dashboard.incompleteValuation") : null].filter(
    (part): part is string => part !== null,
  );
  return parts.join(" · ");
};

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
  const change = periodChange(history);
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
                  {t("dashboard.portfolioValue.title")}
                </Heading>
                <Text fontSize="2xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">
                  {formatAmount(dashboard.portfolioValue, iso)}
                </Text>
                <Text color="fg.muted">
                  <Text as="span" fontWeight="medium">
                    {t("dashboard.portfolioValue.changeLabel")}
                  </Text>{" "}
                  <Text as="span">
                    {changeLabel(change, iso, t("dashboard.portfolioValue.notEnoughHistory"))}
                  </Text>
                </Text>
              </Stack>
              <Box alignSelf="flex-start">
                <SegmentedControl
                  aria-label={t("dashboard.portfolioValue.rangeAriaLabel")}
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
                  points={history}
                  currencyIso={iso}
                  hourly={isHourlyRange(range)}
                  categoryAllocation={dashboard.categoryAllocation}
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
        <Card.Root gridColumn={{ base: "auto", lg: "1 / -1" }}>
          <Card.Body>
            <Stack gap="6">
              {dashboard.custodians.map((group) => (
                <Stack key={group.custodianId} gap="2">
                  <Heading as="h2" size="md">
                    {group.isDefault ? t("dashboard.holdings.other") : group.name}
                  </Heading>
                  <Box as="ul" m="0" p="0">
                    {group.accounts.map((row) => (
                      <NavRow
                        key={row.accountId}
                        href={`/accounts/${row.accountId}`}
                        label={group.isDefault ? t("dashboard.holdings.other") : row.accountName}
                        description={rowDescription(row, t)}
                        endContent={
                          <Stack align="flex-end" gap="0" fontVariantNumeric="tabular-nums">
                            <Text>{formatAmount(row.total, iso)}</Text>
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
