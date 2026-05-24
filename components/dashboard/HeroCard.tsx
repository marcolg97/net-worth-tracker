'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { formatCurrency } from '@/lib/services/chartService';
import type { DashboardOverviewPayload, DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { STATUS_COLORS } from '@/lib/utils/statusColors';

type SparklinePeriod = '1M' | '3M' | '6M' | '1A' | '3A' | 'All';

const SPARKLINE_PERIODS: SparklinePeriod[] = ['1M', '3M', '6M', '1A', '3A', 'All'];
const PERIOD_MONTHS: Record<SparklinePeriod, number> = {
  '1M': 1, '3M': 3, '6M': 6, '1A': 12, '3A': 36, 'All': Infinity,
};
const MONTHS_ABB_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function filterByPeriod(data: DashboardOverviewSparklinePoint[], period: SparklinePeriod) {
  const months = PERIOD_MONTHS[period];
  if (months === Infinity || data.length <= months + 1) return data;
  return data.slice(-(months + 1));
}

export function HeroCard({
  overview,
}: {
  overview: DashboardOverviewPayload | undefined;
}) {
  const [badgeMode, setBadgeMode] = useState<0 | 1>(0);
  const [period, setPeriod] = useState<SparklinePeriod>('3M');

  const allData = overview?.sparklineData ?? [];
  const filteredData = filterByPeriod(allData, period);

  const periodVariation: { value: number; percentage: number } | null =
    filteredData.length >= 2
      ? (() => {
          const first = filteredData[0].totalNetWorth;
          const last = filteredData[filteredData.length - 1].totalNetWorth;
          return {
            value: last - first,
            percentage: first > 0 ? ((last - first) / first) * 100 : 0,
          };
        })()
      : null;

  const isUp = (periodVariation?.value ?? 0) >= 0;

  const badgeLabel = periodVariation
    ? badgeMode === 0
      ? `${periodVariation.percentage >= 0 ? '+' : ''}${periodVariation.percentage.toFixed(2)}%`
      : `${periodVariation.value >= 0 ? '+' : ''}${formatCurrency(periodVariation.value)}`
    : null;

  const dateRangeLabel = filteredData.length >= 2
    ? (() => {
        const first = filteredData[0];
        const last = filteredData[filteredData.length - 1];
        const fl = `${MONTHS_ABB_IT[first.month - 1]} ${first.year}`;
        const ll = `${MONTHS_ABB_IT[last.month - 1]} ${last.year}`;
        return fl === ll ? ll : `${fl} – ${ll}`;
      })()
    : null;

  return (
    <Card className="px-6 py-6 sm:px-7 gap-0">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
        Patrimonio Totale Lordo
      </p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <OverviewAnimatedCurrency
          value={overview?.metrics.totalValue ?? 0}
          animateOnMount={true}
          className="text-4xl font-bold tracking-tight desktop:text-5xl"
        />
        {badgeLabel && (
          <button
            onClick={() => setBadgeMode(m => (m === 0 ? 1 : 0))}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.78rem] font-medium select-none transition-opacity hover:opacity-80"
            style={{
              background: isUp ? STATUS_COLORS.greenBg : STATUS_COLORS.redBg,
              color: isUp ? STATUS_COLORS.green : STATUS_COLORS.red,
            }}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {badgeLabel}
          </button>
        )}
      </div>
      {dateRangeLabel && (
        <p className="text-[0.69rem] text-muted-foreground mt-1">{dateRangeLabel}</p>
      )}

      {allData.length >= 2 && (
        <div className="mt-4">
          <div className="inline-flex items-center gap-3 mb-3">
            {SPARKLINE_PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-[0.71rem] font-bold transition-colors ${
                  period === p ? 'text-foreground' : 'text-muted-foreground/40'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {filteredData.length >= 2 && (
            <div className="-mx-1">
              <NetWorthSparkline key={`${period}-${filteredData.length}`} data={filteredData} period={period} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
