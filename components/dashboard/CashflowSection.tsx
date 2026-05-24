'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { DashboardOverviewExpenseStats, DashboardCategoryBreakdownItem } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { TrendingUp, TrendingDown, PiggyBank, Receipt, Scale, ChevronDown, ChevronUp } from 'lucide-react';
import { STATUS_COLORS } from '@/lib/utils/statusColors';

const ITALIAN_MONTHS = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
];

const CAT_LIMIT = 6;

/* ─── Category list ──────────────────────────────────────────────────────── */
function CategoryList({
  cats,
  total,
  emptyLabel,
}: {
  cats: DashboardCategoryBreakdownItem[];
  total: number;
  emptyLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const maxAmt = cats.length > 0 ? Math.max(...cats.map((c) => c.amount)) : 1;
  const visible = expanded ? cats : cats.slice(0, CAT_LIMIT);
  const hasMore = cats.length > CAT_LIMIT;

  if (cats.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">{emptyLabel}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((cat, i) => {
        const pct = (cat.amount / maxAmt) * 100;
        const share = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
        const color = cat.color ?? 'var(--primary)';
        return (
          <div key={i} className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
              style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium truncate">{cat.name}</span>
                <div className="flex items-baseline gap-1.5 flex-shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{share}%</span>
                  <span className="text-sm font-semibold tabular-nums">{cachedFormatCurrencyEUR(cat.amount)}</span>
                </div>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start mt-1"
        >
          {expanded
            ? <><ChevronUp className="h-3.5 w-3.5" />Mostra di meno</>
            : <><ChevronDown className="h-3.5 w-3.5" />Mostra di più ({cats.length - CAT_LIMIT})</>
          }
        </button>
      )}
    </div>
  );
}

/* ─── Cashflow Section ───────────────────────────────────────────────────── */
export function CashflowSection({
  expenseStats,
  currentMonth,
  currentYear,
}: {
  expenseStats: DashboardOverviewExpenseStats | null;
  currentMonth: number;
  currentYear: number;
}) {
  const monthLabel = `${ITALIAN_MONTHS[currentMonth - 1]} ${currentYear}`;

  if (!expenseStats) {
    return (
      <Card className="p-6 gap-0">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4">
          Cashflow · {monthLabel}
        </p>
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Receipt className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nessuna spesa registrata questo mese</p>
        </div>
      </Card>
    );
  }

  const { income, expenses } = expenseStats.currentMonth;
  const saved = income - expenses;
  const savingsRate = income > 0 ? (saved / income) * 100 : 0;
  const savedColor = savingsRate >= 20
    ? STATUS_COLORS.green
    : savingsRate >= 10
    ? STATUS_COLORS.amber
    : STATUS_COLORS.red;

  const ratio = income > 0 && expenses > 0 ? income / expenses : null;
  const ratioColor = ratio === null
    ? 'var(--muted-foreground)'
    : ratio >= 1.2
    ? STATUS_COLORS.green
    : ratio >= 0.8
    ? STATUS_COLORS.amber
    : STATUS_COLORS.red;
  const ratioSub = ratio === null
    ? '—'
    : ratio >= 1.2
    ? 'Salute ottima'
    : ratio >= 0.8
    ? 'In equilibrio'
    : 'Attenzione';

  const chips = [
    {
      lbl: 'Entrate',
      val: cachedFormatCurrencyEUR(income),
      color: STATUS_COLORS.green,
      icon: TrendingUp,
      sub: expenseStats.delta.income !== 0
        ? `${expenseStats.delta.income >= 0 ? '+' : ''}${expenseStats.delta.income.toFixed(1)}%`
        : '—',
    },
    {
      lbl: 'Spese',
      val: cachedFormatCurrencyEUR(expenses),
      color: 'var(--foreground)',
      icon: TrendingDown,
      sub: expenseStats.delta.expenses !== 0
        ? `${expenseStats.delta.expenses >= 0 ? '+' : ''}${expenseStats.delta.expenses.toFixed(1)}%`
        : '—',
    },
    {
      lbl: 'Risparmio',
      val: cachedFormatCurrencyEUR(Math.abs(saved)),
      color: savedColor,
      icon: PiggyBank,
      sub: income > 0 ? `${savingsRate.toFixed(0)}% reddito` : '—',
    },
    {
      lbl: 'Rapporto',
      val: ratio !== null ? `${ratio.toFixed(2)}×` : '—',
      color: ratioColor,
      icon: Scale,
      sub: ratioSub,
    },
  ];

  return (
    <Card className="p-6 gap-0">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-5">
        Cashflow · {monthLabel}
      </p>

      {/* 4 summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {chips.map((chip, i) => {
          const Icon = chip.icon;
          return (
            <div key={i} className="px-3 py-2.5 bg-muted rounded-[1.575rem]">
              <div className="flex items-center gap-1 mb-1">
                <Icon className="h-3 w-3 flex-shrink-0" style={{ color: chip.color }} />
                <span className="text-[0.58rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  {chip.lbl}
                </span>
              </div>
              <div className="text-sm font-bold tabular-nums" style={{ color: chip.color }}>
                {chip.val}
              </div>
              <div className="text-[0.65rem] text-muted-foreground mt-0.5">{chip.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Category breakdown — two columns on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — Spese */}
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Spese per categoria
          </p>
          <CategoryList
            cats={expenseStats.expenseCategories}
            total={expenses}
            emptyLabel="Nessuna spesa registrata questo mese"
          />
        </div>

        {/* Right — Entrate */}
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Entrate per categoria
          </p>
          <CategoryList
            cats={expenseStats.incomeCategories}
            total={income}
            emptyLabel="Nessuna entrata registrata questo mese"
          />
        </div>
      </div>
    </Card>
  );
}
