import { Stack } from "@astryxdesign/core/Stack";
import { useTheme } from "@astryxdesign/core/theme";
import type { AllocationCell, PortfolioHistoryPoint } from "@optimus/engine/api";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";

const valuedAmount = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const chartDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const CATEGORY_TOKENS = [
  "--color-background-blue",
  "--color-background-teal",
  "--color-background-green",
  "--color-background-orange",
  "--color-background-purple",
  "--color-background-yellow",
  "--color-background-red",
] as const;

const cellCopy = (cell: {
  readonly name: string;
  readonly symbol: string | null;
  readonly value: number;
  readonly percent: number;
  readonly currencyIso: string;
}) => {
  const amount = `${valuedAmount.format(cell.value)} ${cell.currencyIso}`;
  const percent = `${cell.percent.toFixed(1)}%`;
  const title = cell.symbol === null ? cell.name : `${cell.name} (${cell.symbol})`;
  return {
    amount,
    percent,
    title,
    label: `${title}, ${amount}, ${percent}`,
    tooltip: `${title} · ${amount} · ${percent}`,
  };
};

export function PortfolioValueChart({
  points,
  currencyIso,
}: {
  readonly points: ReadonlyArray<PortfolioHistoryPoint>;
  readonly currencyIso: string;
}) {
  const { token } = useTheme();
  const data = points.map((point) => ({
    ...point,
    date: chartDate.format(Date.parse(point.capturedAt)),
  }));
  return (
    <Stack height={280} aria-label="Portfolio value history" role="img">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <AreaChart data={data} accessibilityLayer>
          <XAxis dataKey="date" stroke={token("--color-text-secondary")} />
          <YAxis
            stroke={token("--color-text-secondary")}
            tickFormatter={(value: number) => valuedAmount.format(value)}
          />
          <ChartTooltip
            formatter={(value) => [
              `${valuedAmount.format(Number(value ?? 0))} ${currencyIso}`,
              "Portfolio value",
            ]}
            labelFormatter={(label, payload) => {
              const capturedAt = payload[0]?.payload?.capturedAt;
              return capturedAt === undefined
                ? String(label)
                : new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(Date.parse(capturedAt));
            }}
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
    </Stack>
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
};

function AllocationCellShape(node: TreemapNode) {
  if (node.width <= 0 || node.height <= 0 || typeof node.percent !== "number") return null;
  const copy = cellCopy(node);
  return (
    <g tabIndex={0} role="img" aria-label={copy.label}>
      <title>{copy.tooltip}</title>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        fill={node.fill}
        stroke={node.labelColor}
        strokeOpacity={0.2}
      />
      {node.width > 72 && node.height > 28 ? (
        <text
          x={node.x + 8}
          y={node.y + 18}
          fill={node.labelColor}
          fontSize="var(--text-supporting-size)"
        >
          {node.name}
        </text>
      ) : null}
    </g>
  );
}

export function AllocationTreemap({
  cells,
  currencyIso,
}: {
  readonly cells: ReadonlyArray<AllocationCell>;
  readonly currencyIso: string;
}) {
  const { token } = useTheme();
  const labelColor = token("--color-text-primary");
  const data = cells.map((cell, index) => ({
    name: cell.name,
    value: cell.value,
    percent: cell.percent,
    symbol: cell.symbol,
    fill: token(CATEGORY_TOKENS[index % CATEGORY_TOKENS.length]!),
    labelColor,
    currencyIso,
  }));
  return (
    <Stack height={280} aria-label="Allocation" role="img">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <Treemap
          width={400}
          height={280}
          data={data}
          dataKey="value"
          aspectRatio={1}
          content={(node) => <AllocationCellShape {...(node as unknown as TreemapNode)} />}
        />
      </ResponsiveContainer>
    </Stack>
  );
}
