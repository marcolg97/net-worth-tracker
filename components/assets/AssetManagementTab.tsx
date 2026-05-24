'use client';

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Asset } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateUnrealizedGains,
} from '@/lib/services/assetService';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { useDeleteAsset } from '@/lib/hooks/useAssets';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAssetClassColor } from '@/lib/constants/colors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BarChart3,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Coins,
  Info,
  Landmark,
  Layers,
  Package,
  Pencil,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { TaxCalculatorModal } from '@/components/assets/TaxCalculatorModal';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

// ─── Column configuration ────────────────────────────────────────────────────

type ColumnId = 'class' | 'quantity' | 'price' | 'pmc' | 'ter' | 'value' | 'weight' | 'gainLoss' | 'updated' | 'actions';

interface ColumnDef {
  id: ColumnId;
  label: string;
  align: 'left' | 'right';
  pinned?: boolean;
  defaultWidth: number;
}

const COLUMNS: ColumnDef[] = [
  { id: 'class',    label: 'Classe',     align: 'left',  defaultWidth: 105 },
  { id: 'quantity', label: 'Quantità',   align: 'right', defaultWidth: 85  },
  { id: 'price',    label: 'Prezzo',     align: 'right', defaultWidth: 110 },
  { id: 'pmc',      label: 'PMC',        align: 'right', defaultWidth: 110 },
  { id: 'ter',      label: 'TER',        align: 'right', defaultWidth: 65  },
  { id: 'value',    label: 'Valore',     align: 'right', defaultWidth: 120 },
  { id: 'weight',   label: 'Peso %',     align: 'right', defaultWidth: 90  },
  { id: 'gainLoss', label: 'G/P',        align: 'right', defaultWidth: 135 },
  { id: 'updated',  label: 'Aggiornato', align: 'left',  defaultWidth: 115 },
  { id: 'actions',  label: 'Azioni',     align: 'right', defaultWidth: 100, pinned: true },
];

const COLUMN_MAP    = Object.fromEntries(COLUMNS.map(c => [c.id, c])) as Record<ColumnId, ColumnDef>;
const VALID_IDS     = new Set<string>(COLUMNS.map(c => c.id));
const DEFAULT_ORDER: ColumnId[] = ['class', 'quantity', 'price', 'pmc', 'value', 'weight', 'gainLoss', 'actions'];
const DEFAULT_HIDDEN: ColumnId[] = ['ter', 'updated'];

// Default column widths (px); name column is always auto-stretch
const DEFAULT_WIDTHS: Record<ColumnId, number> = Object.fromEntries(
  COLUMNS.map(c => [c.id, c.defaultWidth])
) as Record<ColumnId, number>;

function loadPrefs(): { order: ColumnId[]; hidden: Set<ColumnId>; widths: Record<ColumnId, number> } {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('asset-table-v2') : null;
    if (raw) {
      const p = JSON.parse(raw);
      return {
        order:  Array.isArray(p.order)  ? (p.order  as string[]).filter(id => VALID_IDS.has(id)) as ColumnId[] : DEFAULT_ORDER,
        hidden: new Set<ColumnId>(Array.isArray(p.hidden) ? (p.hidden as string[]).filter(id => VALID_IDS.has(id)) as ColumnId[] : DEFAULT_HIDDEN),
        widths: { ...DEFAULT_WIDTHS, ...(p.widths ?? {}) },
      };
    }
  } catch {}
  return { order: DEFAULT_ORDER, hidden: new Set(DEFAULT_HIDDEN), widths: { ...DEFAULT_WIDTHS } };
}

function savePrefs(order: ColumnId[], hidden: Set<ColumnId>, widths: Record<ColumnId, number>) {
  try {
    localStorage.setItem('asset-table-v2', JSON.stringify({ order, hidden: [...hidden], widths }));
  } catch {}
}

// ─── Asset class labels ──────────────────────────────────────────────────────

const CLASS_LABEL: Record<string, string> = {
  realestate: 'Real Estate',
  equity:     'Azioni',
  bonds:      'Obbligazioni',
  crypto:     'Crypto',
  cash:       'Liquidità',
  commodity:  'Materie Prime',
};

function formatAssetName(name: string): string {
  return CLASS_LABEL[name.toLowerCase()] ?? (name.charAt(0).toUpperCase() + name.slice(1));
}

const ASSET_TYPE_ICON: Record<string, LucideIcon> = {
  stock:      TrendingUp,
  etf:        BarChart3,
  bond:       Landmark,
  crypto:     Coins,
  cash:       Building2,
  realestate: Building2,
  commodity:  Package,
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface AssetManagementTabProps {
  assets: Asset[];
  loading: boolean;
}

export interface AssetManagementTabHandle {
  openAddDialog: () => void;
}

// ─── Column settings panel ───────────────────────────────────────────────────

function ColumnSettingsPanel({
  order, hidden, onOrderChange, onHiddenChange,
}: {
  order: ColumnId[];
  hidden: Set<ColumnId>;
  onOrderChange: (o: ColumnId[]) => void;
  onHiddenChange: (h: Set<ColumnId>) => void;
}) {
  const configurable = order.filter(id => !COLUMN_MAP[id]?.pinned);
  const pinned       = order.filter(id =>  COLUMN_MAP[id]?.pinned);

  const toggle = (id: ColumnId, checked: boolean) => {
    const next = new Set(hidden);
    if (checked) next.delete(id); else next.add(id);
    onHiddenChange(next);
  };

  const move = (id: ColumnId, dir: -1 | 1) => {
    const idx  = configurable.indexOf(id);
    const next = [...configurable];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onOrderChange([...next, ...pinned]);
  };

  return (
    <div className="w-52 p-1">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground px-2 py-1 mb-1">
        Colonne
      </p>
      {configurable.map((id, idx) => (
        <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
          <Checkbox
            id={`col-${id}`}
            checked={!hidden.has(id)}
            onCheckedChange={(v) => toggle(id, !!v)}
            className="h-3.5 w-3.5"
          />
          <label htmlFor={`col-${id}`} className="flex-1 text-xs cursor-pointer select-none">
            {COLUMN_MAP[id].label}
          </label>
          <div className="flex gap-0.5">
            <button onClick={() => move(id, -1)} disabled={idx === 0}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30">
              <ChevronUp className="h-3 w-3" />
            </button>
            <button onClick={() => move(id, 1)} disabled={idx === configurable.length - 1}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30">
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mobile list row ─────────────────────────────────────────────────────────

function MobileAssetRow({
  asset,
  totalValue,
  onEdit,
  onDelete,
  onCalculateTaxes,
  isDemo,
}: {
  asset: Asset;
  totalValue: number;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
  onCalculateTaxes?: (a: Asset) => void;
  isDemo: boolean;
}) {
  const value     = calculateAssetValue(asset);
  const color     = getAssetClassColor(asset.assetClass);
  const isSold    = asset.quantity === 0;
  const hasCB     = !!(asset.averageCost && asset.averageCost > 0);
  const gl        = hasCB ? calculateUnrealizedGains(asset) : null;
  const cb        = hasCB ? asset.quantity * (asset.averageCost ?? 0) : 0;
  const glPct     = hasCB && cb > 0 ? (gl! / cb) * 100 : 0;
  const identLine = [asset.ticker, asset.isin].filter(Boolean).join(' · ');
  const weightPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
  const TypeIcon  = ASSET_TYPE_ICON[asset.type] ?? TrendingUp;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Asset type icon */}
      <div
        className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${color}18` }}
      >
        <TypeIcon className="h-4 w-4" style={{ color }} />
      </div>

      {/* Name + identifier */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('font-medium text-sm truncate', isSold && 'text-muted-foreground')}>
            {asset.name}
          </span>
          {isSold && (
            <span className="shrink-0 text-[0.6rem] font-medium text-muted-foreground bg-muted rounded px-1 py-0.5">
              Venduto
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 min-w-0">
          <span className="text-[0.625rem] font-semibold shrink-0" style={{ color }}>
            {formatAssetName(asset.assetClass)}
          </span>
          {identLine && (
            <span className="text-[0.65rem] font-mono text-muted-foreground/55 truncate">
              · {identLine}
            </span>
          )}
        </div>
      </div>

      {/* Value + G/P or weight */}
      <div className="shrink-0 text-right">
        <p className="font-semibold text-sm tabular-nums">{formatCurrency(value)}</p>
        {gl !== null ? (
          <p className={cn(
            'text-xs tabular-nums',
            gl > 0 ? 'text-green-600' : gl < 0 ? 'text-red-600' : 'text-muted-foreground',
          )}>
            {gl >= 0 ? '+' : ''}{formatNumber(glPct, 1)}%
          </p>
        ) : (
          <p className="text-xs tabular-nums text-muted-foreground">{weightPct.toFixed(1)}%</p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-0.5">
        {onCalculateTaxes && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onCalculateTaxes(asset)} title="Calcola Plusvalenze">
            <Calculator className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(asset)} disabled={isDemo}
          title={isDemo ? 'Non disponibile in modalità demo' : 'Modifica'}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(asset.id)} disabled={isDemo}
          title={isDemo ? 'Non disponibile in modalità demo' : 'Elimina'}>
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export const AssetManagementTab = forwardRef<AssetManagementTabHandle, AssetManagementTabProps>(
function AssetManagementTab({ assets, loading }, ref) {
  const { user }    = useAuth();
  const isDemo      = useDemoMode();
  const queryClient = useQueryClient();

  const deleteAssetMutation = useDeleteAsset(user?.uid || '');

  const [dialogOpen,        setDialogOpen]        = useState(false);
  const [editingAsset,      setEditingAsset]      = useState<Asset | null>(null);
  const [taxCalculatorOpen, setTaxCalculatorOpen] = useState(false);
  const [calculatingAsset,  setCalculatingAsset]  = useState<Asset | null>(null);
  const [isGrouped,         setIsGrouped]         = useState(false);
  const [collapsedGroups,   setCollapsedGroups]   = useState<Set<string>>(new Set());
  const [settingsOpen,      setSettingsOpen]      = useState(false);
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState<Asset | null>(null);

  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() => loadPrefs().order);
  const [hiddenCols,  setHiddenCols]  = useState<Set<ColumnId>>(() => loadPrefs().hidden);
  const [colWidths,   setColWidths]   = useState<Record<ColumnId, number>>(() => loadPrefs().widths);

  // Resize state stored in ref to avoid stale closures in mousemove handler
  const resizeRef = useRef<{ colId: ColumnId; startX: number; startW: number } | null>(null);

  useImperativeHandle(ref, () => ({
    openAddDialog: () => { setEditingAsset(null); setDialogOpen(true); },
  }));

  const updateOrder = useCallback((order: ColumnId[]) => {
    setColumnOrder(order);
    savePrefs(order, hiddenCols, colWidths);
  }, [hiddenCols, colWidths]);

  const updateHidden = useCallback((hidden: Set<ColumnId>) => {
    setHiddenCols(hidden);
    savePrefs(columnOrder, hidden, colWidths);
  }, [columnOrder, colWidths]);

  const startResize = useCallback((e: React.MouseEvent, colId: ColumnId) => {
    e.preventDefault();
    resizeRef.current = { colId, startX: e.clientX, startW: colWidths[colId] };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { colId: id, startX, startW } = resizeRef.current;
      const newW = Math.max(55, startW + ev.clientX - startX);
      setColWidths(prev => {
        const next = { ...prev, [id]: newW };
        savePrefs(columnOrder, hiddenCols, next);
        return next;
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths, columnOrder, hiddenCols]);

  const visibleCols = useMemo(
    () => columnOrder.filter(id => !hiddenCols.has(id)),
    [columnOrder, hiddenCols]
  );

  const handleDelete = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    setDeleteConfirmAsset(asset);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmAsset || !user) return;
    const id = deleteConfirmAsset.id;
    setDeleteConfirmAsset(null);
    try {
      await deleteAssetMutation.mutateAsync(id);
      toast.success('Asset eliminato con successo');
    } catch {
      toast.error("Errore nell'eliminazione dell'asset");
    }
  };

  const handleEdit             = (asset: Asset) => { setEditingAsset(asset); setDialogOpen(true); };
  const handleCalculateTaxes   = (asset: Asset) => { setCalculatingAsset(asset); setTaxCalculatorOpen(true); };
  const handleTaxCalculatorClose = () => { setTaxCalculatorOpen(false); setCalculatingAsset(null); };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAsset(null);
    if (user?.uid) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
  };

  const hasCostBasisTracking = (asset: Asset) =>
    !!(asset.averageCost && asset.averageCost > 0 && asset.taxRate && asset.taxRate >= 0);

  const requiresManualPricing = (asset: Asset) => {
    if (asset.autoUpdatePrice === false) return true;
    if (['realestate', 'cash'].includes(asset.type)) return true;
    if (asset.subCategory === 'Private Equity') return true;
    return false;
  };

  const totalValue = calculateTotalValue(assets);

  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>();
    assets.forEach(a => {
      if (!map.has(a.assetClass)) map.set(a.assetClass, []);
      map.get(a.assetClass)!.push(a);
    });
    return map;
  }, [assets]);

  const toggleGroup = (cls: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      return next;
    });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Caricamento…
      </div>
    );
  }

  // ── Cell renderers ─────────────────────────────────────────────────────────

  const renderCell = (col: ColumnId, asset: Asset, value: number) => {
    const color = getAssetClassColor(asset.assetClass);
    const lastUpdate = asset.lastPriceUpdate instanceof Date ? asset.lastPriceUpdate : new Date();

    switch (col) {
      case 'class':
        return (
          <TableCell key={col}>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap"
              style={{ backgroundColor: `${color}18`, color }}
            >
              {formatAssetName(asset.assetClass)}
            </span>
          </TableCell>
        );

      case 'quantity':
        return <TableCell key={col} className="text-right tabular-nums text-sm">{formatNumber(asset.quantity, 2)}</TableCell>;

      case 'price':
        return <TableCell key={col} className="text-right tabular-nums text-sm">{formatCurrency(asset.currentPrice, asset.currency, 4)}</TableCell>;

      case 'pmc':
        return (
          <TableCell key={col} className="text-right tabular-nums text-sm">
            {asset.averageCost ? formatCurrency(asset.averageCost, asset.currency, 4) : <span className="text-muted-foreground">—</span>}
          </TableCell>
        );

      case 'ter':
        return (
          <TableCell key={col} className="text-right tabular-nums text-sm text-muted-foreground">
            {asset.totalExpenseRatio ? `${asset.totalExpenseRatio.toFixed(2)}%` : '—'}
          </TableCell>
        );

      case 'value':
        return (
          <TableCell key={col} className="text-right font-semibold tabular-nums text-sm">
            {asset.assetClass === 'realestate' && asset.outstandingDebt && asset.outstandingDebt > 0 ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-end gap-1 cursor-help">
                      {formatCurrency(value)}
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p><strong>Valore lordo:</strong> {formatCurrency(asset.quantity * asset.currentPrice)}</p>
                      <p><strong>Debito residuo:</strong> {formatCurrency(asset.outstandingDebt)}</p>
                      <p><strong>Valore netto:</strong> {formatCurrency(value)}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : formatCurrency(value)}
          </TableCell>
        );

      case 'weight': {
        const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
        return (
          <TableCell key={col} className="text-right">
            <div className="flex flex-col items-end gap-1">
              <span className="font-medium tabular-nums text-sm">{pct.toFixed(1)}%</span>
              <div className="h-0.5 w-10 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.min(pct * 5, 100)}%` }} />
              </div>
            </div>
          </TableCell>
        );
      }

      case 'gainLoss': {
        if (!asset.averageCost) return <TableCell key={col} className="text-right text-muted-foreground text-sm">—</TableCell>;
        const gl  = calculateUnrealizedGains(asset);
        const cb  = asset.quantity * asset.averageCost;
        const pct = cb > 0 ? (gl / cb) * 100 : 0;
        const c   = gl > 0 ? 'text-green-600' : gl < 0 ? 'text-red-600' : 'text-muted-foreground';
        return (
          <TableCell key={col} className={`text-right tabular-nums ${c}`}>
            <div className="font-medium text-sm">{gl >= 0 ? '+' : ''}{formatCurrency(gl)}</div>
            <div className="text-[0.68rem] opacity-75">{pct >= 0 ? '+' : ''}{formatNumber(pct, 2)}%</div>
          </TableCell>
        );
      }

      case 'updated':
        return (
          <TableCell key={col} className="text-muted-foreground text-xs tabular-nums">
            {format(lastUpdate, 'dd/MM/yy HH:mm', { locale: it })}
          </TableCell>
        );

      case 'actions':
        return (
          <TableCell key={col} className="text-right">
            <div className="flex justify-end gap-0.5">
              {hasCostBasisTracking(asset) && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleCalculateTaxes(asset)} title="Calcola Plusvalenze">
                  <Calculator className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(asset)} disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : 'Modifica'}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(asset.id)} disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : 'Elimina'}>
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          </TableCell>
        );
    }
  };

  const renderAssetRow = (asset: Asset, indented = false) => {
    const value  = calculateAssetValue(asset);
    const isSold = asset.quantity === 0;

    // Build identifier sub-line: "TICKER · ISIN" showing whatever's available
    const identParts = [asset.ticker, asset.isin].filter(Boolean);
    const identLine  = identParts.join(' · ');

    return (
      <TableRow key={asset.id}>
        {/* Nome — always visible; ticker + ISIN as sub-line */}
        <TableCell className={`py-2.5 ${indented ? 'pl-8' : ''}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`font-medium text-sm truncate block ${isSold ? 'text-muted-foreground' : ''}`}>
                      {asset.name}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{asset.name}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isSold && (
                <span className="shrink-0 text-[0.6rem] font-medium text-muted-foreground bg-muted rounded px-1 py-0.5">
                  Venduto
                </span>
              )}
            </div>
            {identLine && (
              <span className="text-[0.68rem] font-mono text-muted-foreground/60 tracking-wide mt-0.5 block truncate">
                {identLine}
              </span>
            )}
          </div>
        </TableCell>
        {visibleCols.map(colId => renderCell(colId, asset, value))}
      </TableRow>
    );
  };

  // ── Group rows ─────────────────────────────────────────────────────────────

  const renderGroupRow = (assetClass: string, groupAssets: Asset[]) => {
    const isCollapsed = collapsedGroups.has(assetClass);
    const groupTotal  = groupAssets.reduce((s, a) => s + calculateAssetValue(a), 0);
    const groupColor  = getAssetClassColor(assetClass);
    const colSpan     = visibleCols.length + 1;

    return [
      <TableRow
        key={`group-${assetClass}`}
        className="bg-muted/30 hover:bg-muted/50 cursor-pointer select-none"
        onClick={() => toggleGroup(assetClass)}
      >
        <TableCell colSpan={colSpan} className="py-2">
          <div className="flex items-center gap-2">
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${groupColor}18`, color: groupColor }}
            >
              {formatAssetName(assetClass)}
            </span>
            <span className="text-xs text-muted-foreground">{groupAssets.length} asset</span>
            <span className="ml-auto text-xs font-semibold tabular-nums">
              {formatCurrency(groupTotal)}
              {totalValue > 0 && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {((groupTotal / totalValue) * 100).toFixed(1)}%
                </span>
              )}
            </span>
          </div>
        </TableCell>
      </TableRow>,
      ...(!isCollapsed ? groupAssets.map(a => renderAssetRow(a, true)) : []),
    ];
  };

  // ── Footer ─────────────────────────────────────────────────────────────────

  const renderFooterCell = (col: ColumnId) => {
    if (col === 'value') return <TableCell key={col} className="text-right font-semibold tabular-nums">{formatCurrency(totalValue)}</TableCell>;
    if (col === 'weight') return <TableCell key={col} className="text-right font-semibold tabular-nums">100.00%</TableCell>;
    if (col === 'gainLoss') {
      const withCB   = assets.filter(a => a.averageCost);
      const totalGL  = withCB.reduce((s, a) => s + calculateUnrealizedGains(a), 0);
      const totalCB  = withCB.reduce((s, a) => s + a.quantity * a.averageCost!, 0);
      const totalPct = totalCB > 0 ? (totalGL / totalCB) * 100 : 0;
      const c        = totalGL > 0 ? 'text-green-600' : totalGL < 0 ? 'text-red-600' : 'text-muted-foreground';
      return withCB.length > 0 ? (
        <TableCell key={col} className={`text-right tabular-nums ${c}`}>
          <div>{totalGL >= 0 ? '+' : ''}{formatCurrency(totalGL)}</div>
          <div className="text-xs">{totalPct >= 0 ? '+' : ''}{formatNumber(totalPct, 2)}%</div>
        </TableCell>
      ) : <TableCell key={col} className="text-right text-muted-foreground">—</TableCell>;
    }
    if (col === 'actions') return <TableCell key={col} />;
    return <TableCell key={col} className={COLUMN_MAP[col].align === 'right' ? 'text-right' : ''} />;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Card className="p-0 gap-0 overflow-hidden">
        {assets.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground p-6">
            Nessun investimento presente. Clicca su &ldquo;Aggiungi Asset&rdquo; per iniziare.
          </div>
        ) : (
          <>
            {/* ── Mobile / tablet list layout ────────────────────────────── */}
            <div className="desktop:hidden">
              {/* Controls */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <button
                  onClick={() => setIsGrouped(g => !g)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    isGrouped
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Layers className="h-3 w-3" />
                  Raggruppa
                </button>
              </div>

              {/* Asset list */}
              {isGrouped ? (
                <div>
                  {[...grouped.entries()].map(([cls, ga]) => {
                    const groupColor   = getAssetClassColor(cls);
                    const groupTotal   = ga.reduce((s, a) => s + calculateAssetValue(a), 0);
                    const isCollapsed  = collapsedGroups.has(cls);
                    return (
                      <div key={cls}>
                        <button
                          onClick={() => toggleGroup(cls)}
                          className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 border-b border-border transition-colors text-left"
                        >
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <span className="text-xs font-semibold" style={{ color: groupColor }}>
                            {formatAssetName(cls)}
                          </span>
                          <span className="text-xs text-muted-foreground">{ga.length}</span>
                          <span className="ml-auto text-xs font-semibold tabular-nums">
                            {formatCurrency(groupTotal)}
                          </span>
                        </button>
                        {!isCollapsed && (
                          <div className="divide-y divide-border">
                            {ga.map(a => (
                              <MobileAssetRow
                                key={a.id}
                                asset={a}
                                totalValue={totalValue}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onCalculateTaxes={hasCostBasisTracking(a) ? handleCalculateTaxes : undefined}
                                isDemo={isDemo}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {assets.map(a => (
                    <MobileAssetRow
                      key={a.id}
                      asset={a}
                      totalValue={totalValue}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onCalculateTaxes={hasCostBasisTracking(a) ? handleCalculateTaxes : undefined}
                      isDemo={isDemo}
                    />
                  ))}
                </div>
              )}

              {/* Footer total */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                <span className="text-sm font-semibold">Totale</span>
                <span className="text-sm font-bold tabular-nums">{formatCurrency(totalValue)}</span>
              </div>
            </div>

            {/* ── Desktop table layout ───────────────────────────────────── */}
            <div className="hidden desktop:block">
              {/* Controls bar */}
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
                <button
                  onClick={() => setIsGrouped(g => !g)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isGrouped
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  Raggruppa per classe
                </button>
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Configura colonne">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="p-1">
                    <ColumnSettingsPanel
                      order={columnOrder}
                      hidden={hiddenCols}
                      onOrderChange={updateOrder}
                      onHiddenChange={updateHidden}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Resizable table */}
              <div className="overflow-x-auto">
                <Table style={{ tableLayout: 'fixed', width: '100%', minWidth: 600 }}>
                  {/* colgroup defines column widths; name column stretches to fill */}
                  <colgroup>
                    <col style={{ minWidth: 160 }} />
                    {visibleCols.map(id => (
                      <col key={id} style={{ width: colWidths[id] }} />
                    ))}
                  </colgroup>

                  <TableHeader>
                    <TableRow>
                      {/* Nome header — no resize handle (stretches to fill) */}
                      <TableHead className="text-[0.625rem] uppercase tracking-[0.08em]">
                        Nome
                      </TableHead>
                      {visibleCols.map(id => (
                        <TableHead
                          key={id}
                          className={`text-[0.625rem] uppercase tracking-[0.08em] relative select-none overflow-visible ${
                            COLUMN_MAP[id].align === 'right' ? 'text-right' : ''
                          }`}
                        >
                          {COLUMN_MAP[id].label}
                          {/* Drag-to-resize handle */}
                          <div
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-border/80 active:bg-border z-10"
                            onMouseDown={(e) => startResize(e, id)}
                          />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {isGrouped
                      ? [...grouped.entries()].flatMap(([cls, ga]) => renderGroupRow(cls, ga))
                      : assets.map(a => renderAssetRow(a))
                    }
                  </TableBody>

                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold text-sm">Totale</TableCell>
                      {visibleCols.map(id => renderFooterCell(id))}
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </div>
          </>
        )}
      </Card>

      <AssetDialog open={dialogOpen} onClose={handleDialogClose} asset={editingAsset} />

      {calculatingAsset && (
        <TaxCalculatorModal open={taxCalculatorOpen} onClose={handleTaxCalculatorClose} asset={calculatingAsset} />
      )}

      <AlertDialog open={!!deleteConfirmAsset} onOpenChange={(o) => { if (!o) setDeleteConfirmAsset(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina investimento</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare <strong>{deleteConfirmAsset?.name}</strong>? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
