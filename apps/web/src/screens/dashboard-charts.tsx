import { Box, Stack, Text, useToken } from "@chakra-ui/react";
import type { AllocationCell, PortfolioHistoryPoint } from "@optimus/engine/api";
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
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  Treemap,
  type TreemapNode as RechartsTreemapNode,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { canonicalDecimal } from "../financial-number";

const valuedAmount = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactAmount = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
const wholeAmount = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const chartDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const tooltipDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const CATEGORY_TOKENS = [
  "blue.subtle",
  "teal.subtle",
  "green.subtle",
  "orange.subtle",
  "purple.subtle",
  "yellow.subtle",
  "red.subtle",
] as const;

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
  const tick = compactAmount.format(extreme === 0 ? 0 : Math.ceil(extreme * 1.15));
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

const cellCopy = (cell: {
  readonly name: string;
  readonly symbol: string | null;
  readonly value: number;
  readonly percent: number;
  readonly currencyIso: string;
}) => {
  const amount = `${valuedAmount.format(cell.value)} ${cell.currencyIso}`;
  const compact = `${wholeAmount.format(cell.value)} ${cell.currencyIso}`;
  const percent = `${Math.round(cell.percent)}%`;
  const title = cell.symbol === null ? cell.name : `${cell.name} (${cell.symbol})`;
  const detail = `${cell.name} • ${percent}`;
  return {
    amount,
    compact,
    percent,
    title,
    detail,
    label: `${title}, ${amount}, ${percent}`,
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
      amount={`${valuedAmount.format(point.total)} ${currencyIso}`.trim()}
      detail={tooltipDate.format(Date.parse(point.capturedAt))}
      coordinate={coordinate}
    />
  );
}

function AllocationTooltipContent({ active, payload, coordinate }: TooltipContentProps) {
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
  const copy = cellCopy({
    name: cell.name ?? "",
    symbol: cell.symbol ?? null,
    value,
    percent,
    currencyIso: cell.currencyIso ?? "",
  });
  return <ChartTooltipBubble amount={copy.amount} detail={copy.detail} coordinate={coordinate} />;
}

export function PortfolioValueChart({
  points,
  currencyIso,
}: {
  readonly points: ReadonlyArray<PortfolioHistoryPoint>;
  readonly currencyIso: string;
}) {
  const [fg, fgMuted, accent, accentMuted] = useToken("colors", [
    "fg",
    "fg.muted",
    "blue.solid",
    "blue.muted",
  ]);
  const data = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        total: Number(canonicalDecimal(point.total)),
        currencyIso,
        date: chartDate.format(Date.parse(point.capturedAt)),
      })),
    [currencyIso, points],
  );
  const yAxisWidth = useMemo(() => yAxisWidthFor(points), [points]);
  return (
    <ChartFrame height={280} aria-label="Portfolio value history" role="img">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <AreaChart data={data} accessibilityLayer margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" stroke={fgMuted ?? "currentColor"} />
          <YAxis
            stroke={fgMuted ?? "currentColor"}
            width={yAxisWidth}
            tickMargin={4}
            tickFormatter={(value: number) => compactAmount.format(value)}
          />
          <ChartTooltip
            content={HistoryTooltipContent}
            portal={tooltipPortal()}
            isAnimationActive={false}
            wrapperStyle={tooltipWrapperStyle}
            cursor={{ stroke: fg ?? "currentColor" }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke={accent ?? "currentColor"}
            fill={accentMuted ?? "transparent"}
            name="Portfolio value"
          />
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
  if (!isAllocationTreemapNode(node)) return null;
  if (node.width <= 0 || node.height <= 0 || !Number.isFinite(node.percent)) return null;
  const copy = cellCopy(node);
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
    <ChartFrame height={280} aria-label="Allocation" role="img">
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
