'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { staggerContainer, cardItem } from '@/lib/utils/motionVariants';
import { Card } from '@/components/ui/card';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { DashboardOverviewPayload } from '@/types/dashboardOverview';
import { Shield, TrendingUp, Receipt, Percent, Coins, Settings2, ChevronUp, ChevronDown, Check, X } from 'lucide-react';
import { STATUS_COLORS } from '@/lib/utils/statusColors';

type StatId = 'net' | 'gains' | 'tax' | 'ter' | 'cost';

interface StatDef {
  id: StatId;
  label: string;
  sub: string;
  icon: React.ElementType;
  visible: boolean;
}

const STAT_DEFAULTS: Record<StatId, Omit<StatDef, 'visible'>> = {
  net:   { id: 'net',   label: 'Patrimonio Netto', sub: 'Dopo tasse stimate', icon: Shield    },
  gains: { id: 'gains', label: 'Plusvalenze',       sub: 'Non realizzate',     icon: TrendingUp },
  tax:   { id: 'tax',   label: 'Tasse Stimate',     sub: 'Su plusvalenze',     icon: Receipt   },
  ter:   { id: 'ter',   label: 'TER Medio',         sub: 'Medio ponderato',    icon: Percent   },
  cost:  { id: 'cost',  label: 'Costo Annuale',     sub: 'Costi di gestione',  icon: Coins     },
};

function getAccentColor(id: StatId, unrealizedGains: number): string | undefined {
  if (id === 'gains') return unrealizedGains >= 0 ? STATUS_COLORS.green : STATUS_COLORS.red;
  if (id === 'tax' || id === 'cost') return STATUS_COLORS.amber;
  return undefined;
}

function getAvailableIds(flags: DashboardOverviewPayload['flags']): StatId[] {
  const ids: StatId[] = [];
  if (flags.hasCostBasisTracking) ids.push('net', 'gains', 'tax');
  if (flags.hasTERTracking) ids.push('ter');
  if (flags.hasTERTracking || flags.hasStampDuty) ids.push('cost');
  return ids;
}

function ConfigurePanel({
  stats,
  setStats,
  onClose,
}: {
  stats: StatDef[];
  setStats: React.Dispatch<React.SetStateAction<StatDef[]>>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const toggle = (id: StatId) =>
    setStats((s) => s.map((st) => (st.id === id ? { ...st, visible: !st.visible } : st)));

  const move = (id: StatId, dir: -1 | 1) => {
    setStats((s) => {
      const idx = s.findIndex((st) => st.id === id);
      const nxt = idx + dir;
      if (nxt < 0 || nxt >= s.length) return s;
      const arr = [...s];
      [arr[idx], arr[nxt]] = [arr[nxt], arr[idx]];
      return arr;
    });
  };

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-72 bg-card rounded-[1.925rem] [box-shadow:var(--sh-pop,var(--sh-card))] p-4"
      style={{ animation: 'fadeInDrop 100ms ease forwards' }}
    >
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-semibold">Configura statistiche</span>
        <button onClick={onClose} className="text-muted-foreground p-0.5 flex hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {stats.map((s, i) => (
          <div
            key={s.id}
            className="flex items-center gap-2 px-2.5 py-2 rounded-[0.875rem] transition-colors"
            style={{ background: s.visible ? 'var(--muted)' : 'transparent' }}
          >
            <button
              onClick={() => toggle(s.id)}
              className="w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                borderColor: s.visible ? 'var(--primary)' : 'var(--border)',
                background: s.visible ? 'var(--primary)' : 'transparent',
              }}
            >
              {s.visible && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </button>
            <span className={`flex-1 text-xs font-medium ${s.visible ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
            <div className="flex flex-col gap-px">
              <button
                onClick={() => move(s.id, -1)}
                disabled={i === 0}
                className="text-muted-foreground p-0.5 flex leading-none disabled:opacity-25"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => move(s.id, 1)}
                disabled={i === stats.length - 1}
                className="text-muted-foreground p-0.5 flex leading-none disabled:opacity-25"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsSection({ metrics, flags }: {
  metrics: DashboardOverviewPayload['metrics'];
  flags: DashboardOverviewPayload['flags'];
}) {
  const annualCost = metrics.annualPortfolioCost + metrics.annualStampDuty;

  // Stable list of available ids derived from flags — drives both initial state
  // and the effect that syncs newly-enabled stats after mount.
  const available = useMemo(
    () => getAvailableIds(flags),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flags.hasCostBasisTracking, flags.hasTERTracking, flags.hasStampDuty],
  );

  const [stats, setStats] = useState<StatDef[]>(() =>
    available.map(id => ({ ...STAT_DEFAULTS[id], visible: true })),
  );
  const [configOpen, setConfigOpen] = useState(false);

  // When flags change (e.g. user enables cost basis mid-session), add newly
  // available stats and remove disabled ones while preserving user customisations.
  useEffect(() => {
    setStats(prev => {
      const availSet = new Set(available);
      const prevIds = new Set(prev.map(s => s.id));
      const filtered = prev.filter(s => availSet.has(s.id));
      const toAdd = available
        .filter(id => !prevIds.has(id))
        .map(id => ({ ...STAT_DEFAULTS[id], visible: true }));
      return [...filtered, ...toAdd];
    });
  }, [available]);

  if (stats.length === 0) return null;

  const visible = stats.filter((s) => s.visible);

  const renderValue = (s: StatDef) => {
    if (s.id === 'ter') {
      return <span className="text-xl font-bold tabular-nums">{metrics.portfolioTER.toFixed(2)}%</span>;
    }
    if (s.id === 'cost') {
      return (
        <OverviewAnimatedCurrency
          value={annualCost}
          animateOnMount
          startDelay={180}
          duration={380}
          className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400"
        />
      );
    }
    if (s.id === 'net') {
      return <OverviewAnimatedCurrency value={metrics.netTotal} animateOnMount startDelay={125} duration={380} className="text-xl font-bold tabular-nums" />;
    }
    if (s.id === 'gains') {
      const isPositive = metrics.unrealizedGains >= 0;
      return (
        <span className={`text-xl font-bold tabular-nums ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {isPositive ? '+' : ''}
          <OverviewAnimatedCurrency value={metrics.unrealizedGains} animateOnMount startDelay={140} duration={380} />
        </span>
      );
    }
    if (s.id === 'tax') {
      return <OverviewAnimatedCurrency value={metrics.estimatedTaxes} animateOnMount startDelay={155} duration={380} className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400" />;
    }
    return null;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Statistiche
        </p>
        <div className="relative">
          <button
            onClick={() => setConfigOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: configOpen ? 'var(--primary)' : 'var(--muted)',
              color: configOpen ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}
          >
            <Settings2 className="h-3 w-3" />
            Configura
          </button>
          {configOpen && (
            <ConfigurePanel stats={stats} setStats={setStats} onClose={() => setConfigOpen(false)} />
          )}
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        {visible.map((s) => {
          const Icon = s.icon;
          const accentColor = getAccentColor(s.id, metrics.unrealizedGains);
          return (
            <motion.div key={s.id} variants={cardItem} layout="position">
              <Card className="p-5 overflow-hidden h-full relative gap-0">
                {accentColor && (
                  <div
                    className="absolute top-0 inset-x-0 h-0.5 rounded-t-[2.25rem]"
                    style={{ background: accentColor, opacity: 0.6 }}
                  />
                )}
                <div className="flex items-start justify-between gap-1 mb-2" style={{ paddingTop: accentColor ? '0.2rem' : 0 }}>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground leading-tight">
                    {s.label}
                  </p>
                  <Icon
                    className="h-3.5 w-3.5 flex-shrink-0"
                    style={{
                      color: accentColor ?? 'var(--muted-foreground)',
                      opacity: accentColor ? 0.65 : 0.4,
                    }}
                  />
                </div>
                <div className="mb-1">{renderValue(s)}</div>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
