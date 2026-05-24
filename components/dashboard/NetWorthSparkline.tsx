'use client';

import {
  AreaChart, Area, YAxis, XAxis, CartesianGrid,
  ResponsiveContainer, ReferenceDot,
} from 'recharts';
import { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';

const MONTHS_SHORT_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const PERIOD_MONTHS_MAP: Record<string, number> = {
  '1M': 1, '3M': 3, '6M': 6, '1A': 12, '3A': 36, 'All': Infinity,
};

interface NetWorthSparklineProps {
  data: DashboardOverviewSparklinePoint[];
  period: string;
}

type SeriesPoint = {
  year: number;
  month: number;
  idx: number;
  totalNetWorth: number | null;
  label: string;
};

function formatK(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value.toFixed(0);
}

// Build a full month-by-month series covering the selected period,
// filling null for months without a real snapshot.
function buildFullSeries(data: DashboardOverviewSparklinePoint[], period: string): SeriesPoint[] {
  const last = data[data.length - 1];
  const periodMonths = PERIOD_MONTHS_MAP[period] ?? Infinity;

  // Axis start: either first data point (All) or period-length back from last point
  let startYear = data[0].year;
  let startMonth = data[0].month;

  if (periodMonths !== Infinity) {
    let m = last.month - periodMonths;
    let y = last.year;
    while (m <= 0) { m += 12; y--; }
    // Expand backwards only if this is earlier than our first real data
    if (y < startYear || (y === startYear && m < startMonth)) {
      startYear = y;
      startMonth = m;
    }
  }

  const dataMap = new Map(data.map(d => [`${d.year}-${d.month}`, d.totalNetWorth]));
  const series: SeriesPoint[] = [];
  let y = startYear, m = startMonth;

  while (y < last.year || (y === last.year && m <= last.month)) {
    const key = `${y}-${m}`;
    series.push({
      year: y,
      month: m,
      idx: series.length,
      totalNetWorth: dataMap.get(key) ?? null,
      label: `${MONTHS_SHORT_IT[m - 1]} ${String(y).slice(-2)}`,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  return series;
}

// Generate X-axis tick indices at regular calendar intervals.
function getCalendarTicks(series: SeriesPoint[]): number[] {
  if (series.length < 2) return [0];

  const first = series[0];
  const last = series[series.length - 1];
  const totalMonths = (last.year - first.year) * 12 + (last.month - first.month);

  let interval: number;
  if (totalMonths <= 4)       interval = 1;
  else if (totalMonths <= 8)  interval = 2;
  else if (totalMonths <= 15) interval = 3;
  else if (totalMonths <= 30) interval = 6;
  else if (totalMonths <= 60) interval = 12;
  else                        interval = 24;

  // Generate desired calendar months from first to last at `interval` steps
  const desired: { year: number; month: number }[] = [{ year: first.year, month: first.month }];
  let dm = first.month, dy = first.year;
  while (true) {
    dm += interval;
    while (dm > 12) { dm -= 12; dy++; }
    if (dy > last.year || (dy === last.year && dm > last.month)) break;
    desired.push({ year: dy, month: dm });
  }
  if (desired.at(-1)!.month !== last.month || desired.at(-1)!.year !== last.year) {
    desired.push({ year: last.year, month: last.month });
  }

  // Map each desired date to the nearest series index
  const idxSet = new Set<number>();
  for (const t of desired) {
    const target = t.year * 12 + t.month;
    let best = 0, bestDiff = Infinity;
    for (const d of series) {
      const diff = Math.abs(d.year * 12 + d.month - target);
      if (diff < bestDiff) { bestDiff = diff; best = d.idx; }
    }
    idxSet.add(best);
  }
  return [...idxSet].sort((a, b) => a - b);
}

export function NetWorthSparkline({ data, period }: NetWorthSparklineProps) {
  if (data.length < 2) return null;

  const isPositive = data[data.length - 1].totalNetWorth >= data[0].totalNetWorth;
  const strokeColor = isPositive ? '#16a34a' : '#dc2626';
  const gradientId = `spkfill-${isPositive ? 'pos' : 'neg'}`;

  const series = buildFullSeries(data, period);
  const xTicks = getCalendarTicks(series);
  const lastRealPoint = [...series].reverse().find(p => p.totalNetWorth !== null) ?? series[series.length - 1];

  return (
    <ResponsiveContainer width="100%" height={130} minWidth={0}>
      <AreaChart data={series} margin={{ top: 8, right: 0, left: 24, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.12} />
            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="4 4"
          vertical={false}
          stroke="var(--border)"
          strokeOpacity={0.5}
        />

        <YAxis
          orientation="right"
          width={38}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatK}
          tickCount={4}
          domain={['auto', 'auto']}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'inherit' }}
        />

        <XAxis
          dataKey="idx"
          ticks={xTicks}
          tickLine={false}
          axisLine={false}
          tickFormatter={(idx: number) => series[idx]?.label ?? ''}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'inherit' }}
          interval={0}
          height={20}
        />

        <Area
          type="monotone"
          dataKey="totalNetWorth"
          stroke={strokeColor}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          connectNulls
        />

        <ReferenceDot
          x={lastRealPoint.idx}
          y={lastRealPoint.totalNetWorth ?? 0}
          r={4.5}
          fill={strokeColor}
          stroke="var(--card)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
