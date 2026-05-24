'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, BarChart3, Landmark, Coins, Banknote, Building2, Package,
  ChevronRight, type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PieChartData, AssetType } from '@/types/assets';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

/* ─── Italian asset type labels ─────────────────────────────────────────────── */
const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  stock: 'Azione',
  etf: 'ETF',
  bond: 'Obbligazione',
  crypto: 'Criptovaluta',
  cash: 'Liquidità',
  realestate: 'Immobile',
  commodity: 'Materia Prima',
};

const ASSET_TYPE_ICON: Record<AssetType, LucideIcon> = {
  stock: TrendingUp,
  etf: BarChart3,
  bond: Landmark,
  crypto: Coins,
  cash: Banknote,
  realestate: Building2,
  commodity: Package,
};

/* ─── SVG Donut Chart ─────────────────────────────────────────────────────── */
function DonutChart({ data }: { data: PieChartData[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data.length) return null;

  const cx = 85, cy = 85, R = 70, ri = 44, size = 170;
  const total = data.reduce((s, d) => s + d.percentage, 0) || 100;
  const GAP = 0.025;

  let angle = -Math.PI / 2;
  const segs = data.map((d, i) => {
    const sweep = (d.percentage / total) * Math.PI * 2;
    const sa = angle + GAP / 2;
    const ea = angle + sweep - GAP / 2;
    angle += sweep;

    const pt = (t: number, r: number): [number, number] => [
      cx + r * Math.cos(t),
      cy + r * Math.sin(t),
    ];
    const [x1, y1] = pt(sa, R), [x2, y2] = pt(ea, R);
    const [xi1, yi1] = pt(sa, ri), [xi2, yi2] = pt(ea, ri);
    const lg = sweep - GAP > Math.PI ? 1 : 0;
    const path = [
      `M${x1.toFixed(1)},${y1.toFixed(1)}`,
      `A${R},${R},0,${lg},1,${x2.toFixed(1)},${y2.toFixed(1)}`,
      `L${xi2.toFixed(1)},${yi2.toFixed(1)}`,
      `A${ri},${ri},0,${lg},0,${xi1.toFixed(1)},${yi1.toFixed(1)}`,
      'Z',
    ].join(' ');

    return { ...d, path, i };
  });

  const active = hovered !== null ? (segs[hovered] ?? segs[0]) : segs[0];

  return (
    <div className="flex items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="flex-shrink-0"
        aria-hidden="true"
      >
        {segs.map(s => (
          <path
            key={s.name}
            d={s.path}
            fill={s.color}
            style={{ opacity: hovered === null || hovered === s.i ? 1 : 0.25, cursor: 'pointer', transition: 'opacity 100ms' }}
            onMouseEnter={() => setHovered(s.i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize="18" fontWeight="700" fontFamily="inherit" style={{ fill: 'var(--foreground)' }}>
          {active?.percentage.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" fontSize="11" fontFamily="inherit" style={{ fill: 'var(--muted-foreground)' }}>
          {active?.name}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-2.5 flex-1 min-w-0">
        {segs.map(s => (
          <div
            key={s.name}
            className="flex items-center gap-2 cursor-pointer"
            style={{ opacity: hovered === null || hovered === s.i ? 1 : 0.3, transition: 'opacity 100ms' }}
            onMouseEnter={() => setHovered(s.i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1 text-sm truncate">{s.name}</span>
            <span className="text-sm font-semibold tabular-nums w-10 text-right">{s.percentage.toFixed(1)}%</span>
            <span className="text-xs text-muted-foreground tabular-nums min-w-[68px] text-right hidden sm:block">
              {cachedFormatCurrencyEUR(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Asset Table ─────────────────────────────────────────────────────────── */
function AssetTable({ data, assetCount }: { data: PieChartData[]; assetCount: number }) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div>
      {/* Header row */}
      <div className="flex justify-between items-center mb-3">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {assetCount} asset in portafoglio
        </p>
        <Link
          href="/dashboard/assets"
          className="text-[0.71rem] font-medium text-primary hover:underline"
        >
          Aggiungi →
        </Link>
      </div>

      {data.length > 0 ? (
        <>
          {/* Column headers */}
          <div className="grid gap-2 px-2.5 mb-1" style={{ gridTemplateColumns: '1fr 90px 80px 70px 20px' }}>
            {['Asset', 'Valore', '% Port.', 'Rend.', ''].map((h, i) => (
              <span
                key={i}
                className="text-[0.59rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                style={{ textAlign: i > 0 ? 'right' : 'left' }}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Asset rows */}
          <div className="flex flex-col">
            {data.slice(0, 8).map((asset, i) => {
              const typeLabel = asset.assetType
                ? ASSET_TYPE_LABEL[asset.assetType as AssetType] ?? asset.assetType
                : undefined;
              const TypeIcon = asset.assetType
                ? ASSET_TYPE_ICON[asset.assetType as AssetType]
                : null;
              const change = asset.change as number | undefined;
              const changeColor = change === undefined
                ? 'text-muted-foreground'
                : change > 0
                ? 'text-green-600 dark:text-green-400'
                : change < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground';

              return (
                <div
                  key={i}
                  className="grid gap-2 items-center px-2.5 py-2.5 rounded-[1.25rem] cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: '1fr 90px 80px 70px 20px',
                    background: hovered === i ? 'var(--muted)' : 'transparent',
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Icon + name + type */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ background: `color-mix(in srgb, ${asset.color} 15%, var(--muted))` }}
                    >
                      {TypeIcon ? (
                        <TypeIcon className="h-3.5 w-3.5" style={{ color: asset.color }} />
                      ) : (
                        <div className="w-2 h-2 rounded-full" style={{ background: asset.color }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">
                        {(asset.displayName as string | undefined) ?? asset.name}
                      </p>
                      {typeLabel && (
                        <p className="text-xs text-muted-foreground leading-tight">{typeLabel}</p>
                      )}
                    </div>
                  </div>

                  {/* Value */}
                  <p className="text-sm font-semibold tabular-nums text-right">
                    {cachedFormatCurrencyEUR(asset.value)}
                  </p>

                  {/* Portfolio % */}
                  <p className="text-xs text-muted-foreground tabular-nums text-right">
                    {asset.percentage.toFixed(1)}%
                  </p>

                  {/* Return */}
                  <p className={`text-xs font-medium tabular-nums text-right ${changeColor}`}>
                    {change === undefined ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
                  </p>

                  {/* Chevron */}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/35 ml-auto" />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-[170px] text-sm text-muted-foreground">
          Nessun asset disponibile
        </div>
      )}
    </div>
  );
}

/* ─── Composition Row ─────────────────────────────────────────────────────── */
export function CompositionRow({
  assetClassData,
  assetData,
  liquidityData,
  assetCount = 0,
}: {
  assetClassData: PieChartData[];
  assetData: PieChartData[];
  liquidityData: PieChartData[];
  assetCount?: number;
}) {
  return (
    <div className="space-y-4">
      {/* Row 1: Donut summary + Asset table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left — Donut chart by asset class */}
        <Card className="p-6 gap-0">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-5">
            Composizione Portafoglio
          </p>
          {assetClassData.length > 0 ? (
            <DonutChart data={assetClassData} />
          ) : (
            <div className="flex items-center justify-center h-[170px] text-sm text-muted-foreground">
              Aggiungi asset per visualizzare la composizione
            </div>
          )}
        </Card>

        {/* Right — Asset table */}
        <Card className="p-5 gap-0">
          <AssetTable data={assetData} assetCount={assetCount} />
        </Card>
      </div>

      {/* Row 2: Additional donut charts — Distribuzione per Asset + Liquidità */}
      {(assetData.length > 0 || liquidityData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assetData.length > 0 && (
            <Card className="p-6 gap-0">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-5">
                Distribuzione per Asset
              </p>
              <DonutChart data={assetData} />
            </Card>
          )}
          {liquidityData.length > 0 && (
            <Card className="p-6 gap-0">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-5">
                Liquidità vs Illiquidità
              </p>
              <DonutChart data={liquidityData} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
