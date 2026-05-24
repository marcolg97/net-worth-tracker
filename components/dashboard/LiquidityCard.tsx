'use client';

import { Card } from '@/components/ui/card';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';

function PctBadge({ value, total }: { value: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min((value / total) * 100, 100);
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-semibold tabular-nums text-muted-foreground">
      {pct.toFixed(1)}%
    </span>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  bold,
}: {
  label: string;
  value: number;
  total: number;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 py-2 ${bold ? 'border-t border-border mt-1' : ''}`}>
      <span className={`text-xs leading-snug ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <OverviewAnimatedCurrency
          value={value}
          animateOnMount={true}
          startDelay={120}
          duration={350}
          className={`text-xs tabular-nums ${bold ? 'font-semibold' : 'font-medium'}`}
        />
        <PctBadge value={value} total={total} />
      </div>
    </div>
  );
}

export function LiquidityCard({
  overview,
}: {
  overview: DashboardOverviewPayload | undefined;
}) {
  const totalValue       = overview?.metrics.totalValue       ?? 0;
  const cashValue        = overview?.metrics.cashValue        ?? 0;
  const liquidNetWorth   = overview?.metrics.liquidNetWorth   ?? 0;
  const illiquidNetWorth = overview?.metrics.illiquidNetWorth ?? 0;
  const liquidNetTotal   = overview?.metrics.liquidNetTotal   ?? 0;

  const liquidInvestments = liquidNetWorth - cashValue;

  return (
    <Card className="p-6 flex flex-col h-full gap-0">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
        Liquidità Netta
      </p>
      <OverviewAnimatedCurrency
        value={liquidNetTotal}
        animateOnMount={true}
        startDelay={105}
        duration={390}
        className="text-2xl font-bold"
      />

      {totalValue > 0 && (
        <div className="mt-auto pt-5 flex flex-col">
          <BreakdownRow label="Conti Correnti"           value={cashValue}          total={totalValue} />
          <BreakdownRow label="Investimenti Liquidabili" value={liquidInvestments}  total={totalValue} />
          {illiquidNetWorth > 0 && (
            <BreakdownRow label="Investimenti Illiquidi"  value={illiquidNetWorth}  total={totalValue} />
          )}
          <BreakdownRow label="Patrimonio Totale Lordo"  value={totalValue}         total={totalValue} bold />
        </div>
      )}
    </Card>
  );
}
