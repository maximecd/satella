import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useTheme } from "@astryxdesign/core/theme";
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
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  Treemap,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

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
  "--color-background-blue",
  "--color-background-teal",
  "--color-background-green",
  "--color-background-orange",
  "--color-background-purple",
  "--color-background-yellow",
  "--color-background-red",
] as const;

const MIN_LABEL_WIDTH = 96;
const MIN_LABEL_HEIGHT = 56;
const VIEWPORT_MARGIN = 8;
const Y_AXIS_CHAR_WIDTH = 8;
const Y_AXIS_GUTTER = 16;
const Y_AXIS_MIN_WIDTH = 56;
const Y_AXIS_MAX_WIDTH = 96;

const yAxisWidthFor = (points: ReadonlyArray<PortfolioHistoryPoint>) => {
  const extreme =
    points.length === 0 ? 0 : Math.max(...points.map((point) => Math.abs(point.total)));
  const tick = compactAmount.format(extreme === 0 ? 0 : Math.ceil(extreme * 1.15));
  return Math.min(
    Y_AXIS_MAX_WIDTH,
    Math.max(Y_AXIS_MIN_WIDTH, tick.length * Y_AXIS_CHAR_WIDTH + Y_AXIS_GUTTER),
  );
};

const tooltipPortal = (): HTMLElement => {
  const theme = document.querySelector("[data-astryx-theme]");
  return theme instanceof HTMLElement ? theme : document.body;
};
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
  ...props
}: {
  readonly children: ReactNode;
  readonly height: number;
  readonly "aria-label": string;
  readonly role: "img";
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  return (
    <ChartRootContext.Provider value={rootRef}>
      <Stack ref={rootRef} {...props} style={{ overflow: "visible" }}>
        {children}
      </Stack>
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
  const tooltipRef = useRef<HTMLElement | null>(null);
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
      gap={0.5}
      paddingInline={2}
      paddingBlock={1}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? "visible" : "hidden",
        backgroundColor: "var(--color-text-primary)",
        color: "var(--color-background-surface)",
        borderRadius: "var(--radius-container)",
      }}
    >
      <Text weight="bold" hasTabularNumbers color="inherit">
        {amount}
      </Text>
      <Text type="supporting" color="inherit">
        {detail}
      </Text>
    </Stack>
  );
}

function HistoryTooltipContent({ active, payload, coordinate }: TooltipContentProps) {
  if (!active) return null;
  const point = payload[0]?.payload as
    | (PortfolioHistoryPoint & { readonly currencyIso?: string })
    | undefined;
  if (point?.capturedAt == null || typeof point.total !== "number") return null;
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
  const cell = payload[0]?.payload as {
    readonly name?: string;
    readonly symbol?: string | null;
    readonly value?: number;
    readonly percent?: number;
    readonly currencyIso?: string;
  } | null;
  if (cell == null || typeof cell.percent !== "number" || typeof cell.value !== "number") {
    return null;
  }
  const copy = cellCopy({
    name: cell.name ?? "",
    symbol: cell.symbol ?? null,
    value: cell.value,
    percent: cell.percent,
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
  const { token } = useTheme();
  const data = useMemo(
    () =>
      points.map((point) => ({
        ...point,
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
          <XAxis dataKey="date" stroke={token("--color-text-secondary")} />
          <YAxis
            stroke={token("--color-text-secondary")}
            width={yAxisWidth}
            tickMargin={4}
            tickFormatter={(value: number) => compactAmount.format(value)}
          />
          <ChartTooltip
            content={HistoryTooltipContent}
            portal={tooltipPortal()}
            isAnimationActive={false}
            wrapperStyle={tooltipWrapperStyle}
            cursor={{ stroke: token("--color-text-primary") }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke={token("--color-accent")}
            fill={token("--color-accent-muted")}
            name="Portfolio value"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

type TreemapNode = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly value: number;
  readonly percent: number;
  readonly symbol: string | null;
  readonly fill: string;
  readonly labelColor: string;
  readonly currencyIso: string;
  readonly tooltipIndex?: string;
};

function AllocationCellShape(node: TreemapNode) {
  if (node.width <= 0 || node.height <= 0 || typeof node.percent !== "number") return null;
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
          padding={2}
          gap={0.5}
          align="center"
          justify="center"
          style={{ overflow: "hidden", color: node.labelColor }}
        >
          {showLabels ? (
            <>
              <Text weight="bold" hasTabularNumbers justify="center" color="inherit">
                {copy.compact}
              </Text>
              <Text
                type="supporting"
                justify="center"
                maxLines={3}
                hasTruncateTooltip={false}
                color="inherit"
              >
                {copy.detail}
              </Text>
            </>
          ) : null}
        </Stack>
      </foreignObject>
    </g>
  );
}

const renderAllocationCell = (node: unknown) => <AllocationCellShape {...(node as TreemapNode)} />;

export function AllocationTreemap({
  cells,
  currencyIso,
}: {
  readonly cells: ReadonlyArray<AllocationCell>;
  readonly currencyIso: string;
}) {
  const data = useMemo(
    () =>
      cells.map((cell, index) => ({
        name: cell.name,
        value: cell.value,
        percent: cell.percent,
        symbol: cell.symbol,
        fill: `var(${CATEGORY_TOKENS[index % CATEGORY_TOKENS.length]})`,
        labelColor: "var(--color-text-primary)",
        currencyIso,
      })),
    [cells, currencyIso],
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
