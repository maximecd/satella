import { Box, Stack, Text, useToken } from "@chakra-ui/react";
import type { AllocationCell, PortfolioHistoryPoint } from "@satella-app/engine/api";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import * as Schema from "effect/Schema";
import { useTranslation } from "react-i18next";
import {
  Legend,
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  Treemap,
  type TreemapNode as RechartsTreemapNode,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import {
  canonicalDecimal,
  compareDecimal,
  formatAmount,
  formatWholeAmount,
} from "../financial-number";
import { appLanguage } from "../app-language";
import type { TFunction } from "i18next";
import { ASSET_CATEGORY_LABELS, type AssetCategory } from "@satella-app/engine/api";

const numberFormatter = (locale: string, options: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat(locale, options);

const compactAmount = () => numberFormatter(appLanguage(), { maximumFractionDigits: 2 });
const chartDateFormatter = () =>
  new Intl.DateTimeFormat(appLanguage(), { month: "short", day: "numeric" });
const chartHourFormatter = () =>
  new Intl.DateTimeFormat(appLanguage(), { hour: "2-digit", minute: "2-digit" });
const tooltipDateFormatter = () => new Intl.DateTimeFormat(appLanguage(), { dateStyle: "medium" });
const tooltipDateTimeFormatter = () =>
  new Intl.DateTimeFormat(appLanguage(), { dateStyle: "medium", timeStyle: "short" });

const CATEGORY_TOKENS = [
  "blue.subtle",
  "teal.subtle",
  "green.subtle",
  "orange.subtle",
  "purple.subtle",
  "yellow.subtle",
  "red.subtle",
] as const;

const HISTORY_CATEGORY_ORDER = ["stocks_etfs", "crypto", "other", "cash"] as const;

// Same hue order as CATEGORY_TOKENS so the history chart matches the allocation treemap.
const HISTORY_HUES = ["blue", "teal", "green", "orange", "purple", "yellow", "red"] as const;

const historyCategoryStyles = (
  preferredOrder: ReadonlyArray<AssetCategory>,
  tokens: ReadonlyArray<string | undefined>,
) => {
  const hues = new Map<AssetCategory, (typeof HISTORY_HUES)[number]>();
  preferredOrder.forEach((category, index) => {
    if (hues.has(category)) return;
    const hue = HISTORY_HUES[index % HISTORY_HUES.length]!;
    hues.set(category, hue);
  });
  for (const category of HISTORY_CATEGORY_ORDER) {
    if (hues.has(category)) continue;
    const hue =
      HISTORY_HUES.find((candidate) => ![...hues.values()].includes(candidate)) ?? HISTORY_HUES[0]!;
    hues.set(category, hue);
  }
  const stylesFor = (category: AssetCategory) => {
    const hue = hues.get(category) ?? HISTORY_HUES[0]!;
    return {
      stroke: tokens[HISTORY_HUES.indexOf(hue) * 2] ?? "currentColor",
      fill: tokens[HISTORY_HUES.indexOf(hue) * 2 + 1] ?? "transparent",
    };
  };
  return {
    stocks_etfs: stylesFor("stocks_etfs"),
    crypto: stylesFor("crypto"),
    other: stylesFor("other"),
    cash: stylesFor("cash"),
  };
};

const MIN_LABEL_WIDTH = 96;
const MIN_LABEL_HEIGHT = 56;
const VIEWPORT_MARGIN = 8;
const Y_AXIS_CHAR_WIDTH = 8;
const Y_AXIS_GUTTER = 16;
const Y_AXIS_MIN_WIDTH = 56;
const Y_AXIS_MAX_WIDTH = 96;

type ChartHistoryPoint = Omit<PortfolioHistoryPoint, "total"> & {
  readonly total: number;
  readonly currencyIso?: string;
  readonly hourly?: boolean;
};

type AllocationTooltipCell = {
  readonly name?: string;
  readonly symbol?: string | null;
  readonly value?: number;
  readonly percent?: number;
  readonly currencyIso?: string;
};

const yAxisWidthFor = (points: ReadonlyArray<PortfolioHistoryPoint>) => {
  const extreme =
    points.length === 0
      ? 0
      : Math.max(...points.map((point) => Math.abs(Number(canonicalDecimal(point.total)))));
  const tick = compactAmount().format(extreme === 0 ? 0 : Math.ceil(extreme * 1.15));
  return Math.min(
    Y_AXIS_MAX_WIDTH,
    Math.max(Y_AXIS_MIN_WIDTH, tick.length * Y_AXIS_CHAR_WIDTH + Y_AXIS_GUTTER),
  );
};

const tooltipPortal = (): HTMLElement => document.body;
const tooltipWrapperStyle = {
  position: "fixed" as const,
  inset: 0,
  overflow: "visible",
  outline: "none",
  pointerEvents: "none" as const,
  zIndex: 1000,
};

const ChartRootContext = createContext<RefObject<HTMLElement | null>>({ current: null });

const cellCopy = (
  cell: {
    readonly name: string;
    readonly symbol: string | null;
    readonly value: number;
    readonly percent: number;
    readonly currencyIso: string;
  },
  t: TFunction,
) => {
  const amount = formatAmount(cell.value, cell.currencyIso);
  const compact = formatWholeAmount(cell.value, cell.currencyIso);
  const percent = `${Math.round(cell.percent)}%`;
  const title = cell.symbol === null ? cell.name : `${cell.name} (${cell.symbol})`;
  const detail = t("dashboard.charts.cellDetail", { name: cell.name, percent });
  return {
    amount,
    compact,
    percent,
    title,
    detail,
    label: t("dashboard.charts.cellLabel", { title, amount, percent }),
  };
};

function ChartFrame({
  children,
  height,
  ...props
}: {
  readonly children: ReactNode;
  readonly height: number;
  readonly "aria-label": string;
  readonly role: "img";
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  return (
    <ChartRootContext.Provider value={rootRef}>
      <Box ref={rootRef} overflow="visible" h={`${height}px`} {...props}>
        {children}
      </Box>
    </ChartRootContext.Provider>
  );
}

function ChartTooltipBubble({
  amount,
  detail,
  coordinate,
}: {
  readonly amount: string;
  readonly detail: string;
  readonly coordinate: { readonly x: number; readonly y: number } | undefined;
}) {
  const chartRef = useContext(ChartRootContext);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (tooltip === null || coordinate == null) return;
    const chart = chartRef.current?.querySelector(".recharts-wrapper") ?? chartRef.current;
    if (chart == null) return;
    const origin = chart.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();
    const x = origin.left + coordinate.x;
    const y = origin.top + coordinate.y;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - width;
    const maxTop = window.innerHeight - VIEWPORT_MARGIN - height;
    let left = Math.min(
      Math.max(VIEWPORT_MARGIN, x - width / 2),
      Math.max(VIEWPORT_MARGIN, maxLeft),
    );
    let top = y - height - VIEWPORT_MARGIN;
    if (top < VIEWPORT_MARGIN) top = y + VIEWPORT_MARGIN;
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, maxTop));
    setPos((current) =>
      current.ready && current.left === left && current.top === top
        ? current
        : { left, top, ready: true },
    );
  }, [chartRef, coordinate, amount, detail]);
  return (
    <Stack
      ref={tooltipRef}
      role="tooltip"
      gap="0.5"
      px="2"
      py="1"
      bg="fg"
      color="bg"
      rounded="md"
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? "visible" : "hidden",
      }}
    >
      <Text fontWeight="bold" fontVariantNumeric="tabular-nums" color="inherit">
        {amount}
      </Text>
      <Text color="inherit" fontSize="sm">
        {detail}
      </Text>
    </Stack>
  );
}

function HistoryTooltipContent({ active, payload, coordinate }: TooltipContentProps) {
  if (!active) return null;
  // SAFETY: The chart data below converts PortfolioHistoryPoint.total to a finite number before Recharts receives it.
  const point = payload[0]?.payload as ChartHistoryPoint | undefined;
  if (point?.capturedAt == null || !Number.isFinite(point.total)) return null;
  const currencyIso = point.currencyIso ?? "";
  return (
    <ChartTooltipBubble
      amount={formatAmount(point.total, currencyIso)}
      detail={(point.hourly ? tooltipDateTimeFormatter() : tooltipDateFormatter()).format(
        Date.parse(point.capturedAt),
      )}
      coordinate={coordinate}
    />
  );
}

function AllocationTooltipContent({ active, payload, coordinate }: TooltipContentProps) {
  const { t } = useTranslation();
  if (!active) return null;
  // SAFETY: The treemap data below supplies numeric value and percent fields to Recharts.
  const cell = payload[0]?.payload as AllocationTooltipCell | undefined;
  const value = cell?.value;
  const percent = cell?.percent;
  if (
    cell === undefined ||
    value === undefined ||
    percent === undefined ||
    !Number.isFinite(percent) ||
    !Number.isFinite(value)
  ) {
    return null;
  }
  const copy = cellCopy(
    {
      name: cell.name ?? "",
      symbol: cell.symbol ?? null,
      value,
      percent,
      currencyIso: cell.currencyIso ?? "",
    },
    t,
  );
  return <ChartTooltipBubble amount={copy.amount} detail={copy.detail} coordinate={coordinate} />;
}

export function PortfolioValueChart({
  points,
  currencyIso,
  hourly = false,
  categoryAllocation,
  ariaLabel,
  totalSeriesLabel,
}: {
  readonly points: ReadonlyArray<PortfolioHistoryPoint>;
  readonly currencyIso: string;
  readonly hourly?: boolean;
  readonly categoryAllocation?: ReadonlyArray<AllocationCell> | undefined;
  readonly ariaLabel?: string;
  /** Renders the single derived total series (net worth) instead of the per-category stacks. */
  readonly totalSeriesLabel?: string | undefined;
}) {
  const [fg, fgMuted, ...categoryTokens] = useToken("colors", [
    "fg",
    "fg.muted",
    ...HISTORY_HUES.flatMap((hue) => [`${hue}.solid`, `${hue}.subtle`]),
  ]);
  const data = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        total: Number(canonicalDecimal(point.total)),
        ...Object.fromEntries(
          HISTORY_CATEGORY_ORDER.map((category) => [
            category,
            Number(canonicalDecimal(point.categories[category] ?? "0")),
          ]),
        ),
        currencyIso,
        hourly,
        date: hourly
          ? chartHourFormatter().format(Date.parse(point.capturedAt))
          : chartDateFormatter().format(Date.parse(point.capturedAt)),
      })),
    [currencyIso, hourly, points],
  );
  const yAxisWidth = useMemo(() => yAxisWidthFor(points), [points]);
  const { t } = useTranslation();
  const preferredOrder = useMemo(() => {
    // SAFETY: AllocationCell.key holds an AssetCategory literal emitted by the engine.
    const ranked = categoryAllocation
      ?.map((cell) => cell.key as AssetCategory)
      .filter((category) => HISTORY_CATEGORY_ORDER.includes(category));
    if (ranked !== undefined && ranked.length > 0) return ranked;
    const totalFor = (category: AssetCategory) =>
      points.reduce(
        (sum, point) => sum + Number(canonicalDecimal(point.categories[category] ?? "0")),
        0,
      );
    return [...HISTORY_CATEGORY_ORDER].sort(
      (left, right) => totalFor(right) - totalFor(left) || left.localeCompare(right),
    );
  }, [categoryAllocation, points]);
  const categoryStyles = useMemo(
    () => historyCategoryStyles(preferredOrder, categoryTokens),
    [categoryTokens, preferredOrder],
  );
  const legendCategories = useMemo(() => {
    const active = HISTORY_CATEGORY_ORDER.filter((category) =>
      points.some((point) => compareDecimal(point.categories[category] ?? "0", "0") !== 0),
    );
    return active.length > 0 ? active : [...HISTORY_CATEGORY_ORDER];
  }, [points]);
  const legendPayload = useMemo(
    () =>
      legendCategories.map((category) => ({
        value: ASSET_CATEGORY_LABELS[category],
        type: "circle" as const,
        color: categoryStyles[category].stroke,
        id: category,
      })),
    [categoryStyles, legendCategories],
  );
  const defaultLabel = t("dashboard.charts.historyAriaLabel");
  return (
    <ChartFrame height={280} aria-label={ariaLabel ?? defaultLabel} role="img">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <AreaChart data={data} accessibilityLayer margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" stroke={fgMuted ?? "currentColor"} />
          <YAxis
            stroke={fgMuted ?? "currentColor"}
            width={yAxisWidth}
            tickMargin={4}
            tickFormatter={(value: number) => compactAmount().format(value)}
          />
          <ChartTooltip
            content={HistoryTooltipContent}
            portal={tooltipPortal()}
            isAnimationActive={false}
            wrapperStyle={tooltipWrapperStyle}
            cursor={{ stroke: fg ?? "currentColor" }}
          />
          {totalSeriesLabel === undefined ? (
            legendCategories.map((category) => (
              <Area
                key={category}
                type="monotone"
                dataKey={category}
                stackId="total"
                isAnimationActive={false}
                stroke={categoryStyles[category].stroke}
                fill={categoryStyles[category].fill}
                name={ASSET_CATEGORY_LABELS[category]}
              />
            ))
          ) : (
            <Area
              type="monotone"
              dataKey="total"
              isAnimationActive={false}
              stroke={categoryTokens[0] ?? "currentColor"}
              fill={categoryTokens[1] ?? "transparent"}
              name={totalSeriesLabel}
            />
          )}
          {totalSeriesLabel === undefined ? (
            <Legend
              content={() => (
                <Stack direction="row" gap="4" justify="center" wrap="wrap" px="2">
                  {legendPayload.map((entry) => (
                    <Stack key={entry.id} direction="row" align="center" gap="1.5">
                      <Box w="2" h="2" rounded="full" bg={entry.color} />
                      <Text color="fg.muted" fontSize="xs">
                        {entry.value}
                      </Text>
                    </Stack>
                  ))}
                </Stack>
              )}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

type AllocationTreemapNode = RechartsTreemapNode & {
  readonly percent: number;
  readonly symbol: string | null;
  readonly fill: string;
  readonly labelColor: string;
  readonly currencyIso: string;
};

const isAllocationTreemapNode = (node: RechartsTreemapNode): node is AllocationTreemapNode =>
  Number.isFinite(node["percent"]) &&
  (node["symbol"] === null || Schema.is(Schema.String)(node["symbol"])) &&
  Schema.is(Schema.String)(node["fill"]) &&
  Schema.is(Schema.String)(node["labelColor"]) &&
  Schema.is(Schema.String)(node["currencyIso"]);

function AllocationCellRenderer(node: RechartsTreemapNode) {
  const { t } = useTranslation();
  if (!isAllocationTreemapNode(node)) return null;
  if (node.width <= 0 || node.height <= 0 || !Number.isFinite(node.percent)) return null;
  const copy = cellCopy(node, t);
  const showLabels = node.width >= MIN_LABEL_WIDTH && node.height >= MIN_LABEL_HEIGHT;
  return (
    <g role="img" tabIndex={0} aria-label={copy.label}>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        fill={node.fill}
        stroke={node.labelColor}
        strokeOpacity={0.2}
        data-recharts-item-index={node.tooltipIndex}
      />
      <foreignObject
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        style={{ pointerEvents: "none" }}
      >
        <Stack
          width="100%"
          height="100%"
          p="2"
          gap="0.5"
          align="center"
          justify="center"
          overflow="hidden"
          color={node.labelColor}
        >
          {showLabels ? (
            <>
              <Text
                fontWeight="bold"
                fontVariantNumeric="tabular-nums"
                textAlign="center"
                color="inherit"
              >
                {copy.compact}
              </Text>
              <Text color="inherit" fontSize="sm" textAlign="center" lineClamp={3}>
                {copy.detail}
              </Text>
            </>
          ) : null}
        </Stack>
      </foreignObject>
    </g>
  );
}

const renderAllocationCell = (node: RechartsTreemapNode) => <AllocationCellRenderer {...node} />;

export function AllocationTreemap({
  cells,
  currencyIso,
}: {
  readonly cells: ReadonlyArray<AllocationCell>;
  readonly currencyIso: string;
}) {
  const [labelColor, ...fills] = useToken("colors", ["fg", ...CATEGORY_TOKENS]);
  const { t } = useTranslation();
  const data = useMemo(
    () =>
      cells.map((cell, index) => ({
        name: cell.name,
        value: Number(canonicalDecimal(cell.value)),
        percent: Number(canonicalDecimal(cell.percent)),
        symbol: cell.symbol,
        fill: fills[index % fills.length] ?? "transparent",
        labelColor: labelColor ?? "currentColor",
        currencyIso,
      })),
    [cells, currencyIso, fills, labelColor],
  );
  return (
    <ChartFrame height={280} aria-label={t("dashboard.charts.allocationAriaLabel")} role="img">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <Treemap
          width={400}
          height={280}
          data={data}
          dataKey="value"
          aspectRatio={1}
          isAnimationActive={false}
          isUpdateAnimationActive={false}
          content={renderAllocationCell}
        >
          <ChartTooltip
            content={AllocationTooltipContent}
            portal={tooltipPortal()}
            isAnimationActive={false}
            wrapperStyle={tooltipWrapperStyle}
          />
        </Treemap>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function HoldingSparkline({
  points,
  color,
  ariaLabel,
}: {
  readonly points: ReadonlyArray<{ readonly value: string }>;
  readonly color: string;
  readonly ariaLabel: string;
}) {
  const [stroke] = useToken("colors", [color]);
  const data = points.flatMap((point) => {
    const value = Number(canonicalDecimal(point.value));
    return Number.isFinite(value) ? [{ value }] : [];
  });
  if (data.length < 2) return null;
  return (
    <Box w="24" flexShrink="0">
      <ChartFrame height={40} aria-label={ariaLabel} role="img">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={stroke ?? "currentColor"}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </Box>
  );
}
