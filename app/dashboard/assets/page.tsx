'use client';

import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets, useDeleteAsset } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { RefreshCw, Plus, Banknote, Pencil, Trash2 } from 'lucide-react';
import { AssetManagementTab, type AssetManagementTabHandle } from '@/components/assets/AssetManagementTab';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { AssetClassHistoryTable } from '@/components/assets/AssetClassHistoryTable';
import { HeroCard } from '@/components/dashboard/HeroCard';
import { LiquidityCard } from '@/components/dashboard/LiquidityCard';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { calculateAssetValue } from '@/lib/services/assetService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Asset } from '@/types/assets';

// ─── Types ───────────────────────────────────────────────────────────────────

type PageTab  = 'situazione' | 'andamento';
type SubTabId = 'prezzi' | 'valori' | 'asset-class';

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: 'prezzi',      label: 'Prezzi'      },
  { id: 'valori',      label: 'Valori'      },
  { id: 'asset-class', label: 'Asset Class' },
];

// ─── Small components ─────────────────────────────────────────────────────────

function PageTabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative pb-2.5 text-sm font-medium transition-colors whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
      )}
    >
      {children}
      <span className={cn(
        'absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-foreground transition-opacity duration-150',
        active ? 'opacity-100' : 'opacity-0',
      )} />
    </button>
  );
}

function SubTabPills({ active, onChange }: { active: SubTabId; onChange: (v: SubTabId) => void }) {
  return (
    <div className="flex gap-0.5 bg-muted rounded-full p-1 mb-5 w-fit">
      {SUB_TABS.map((sub) => (
        <button
          key={sub.id}
          onClick={() => onChange(sub.id)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            active === sub.id
              ? 'bg-card [box-shadow:var(--sh-card)] text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {sub.label}
        </button>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4">
      {children}
    </p>
  );
}

// ─── Cash account card ────────────────────────────────────────────────────────

function CashAccountCard({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const value = calculateAssetValue(asset);
  return (
    <button
      onClick={onClick}
      className="snap-start shrink-0 w-44 text-left"
    >
      <Card className="p-4 flex flex-col gap-3 h-full transition-shadow hover:shadow-md cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </div>
          {asset.currency && asset.currency !== 'EUR' && (
            <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {asset.currency}
            </span>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground truncate mb-0.5">{asset.name}</p>
          <p className="text-lg font-bold tabular-nums">{cachedFormatCurrencyEUR(value)}</p>
        </div>
      </Card>
    </button>
  );
}

// ─── Add cash card (dashed) ───────────────────────────────────────────────────

function AddCashCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="snap-start shrink-0 w-44 text-left">
      <Card className="p-4 flex flex-col items-center justify-center gap-3 h-full border-2 border-dashed bg-transparent [box-shadow:none] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer">
        <div className="h-8 w-8 rounded-full border-2 border-dashed border-current flex items-center justify-center">
          <Plus className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium">Nuovo conto</span>
      </Card>
    </button>
  );
}

// ─── Cash detail modal ────────────────────────────────────────────────────────

function CashDetailModal({
  asset,
  isDemo,
  onClose,
  onEdit,
  onDelete,
}: {
  asset: Asset;
  isDemo: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const value      = calculateAssetValue(asset);
  const lastUpdate = asset.lastPriceUpdate instanceof Date ? asset.lastPriceUpdate : new Date();

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="truncate">{asset.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Balance */}
          <p className="text-3xl font-bold tabular-nums">{cachedFormatCurrencyEUR(value)}</p>

          {/* Detail rows */}
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">Valuta</span>
              <span className="font-medium">{asset.currency ?? 'EUR'}</span>
            </div>
            {asset.isin && (
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">IBAN / ISIN</span>
                <span className="font-mono text-xs tracking-wide">{asset.isin}</span>
              </div>
            )}
            {asset.ticker && (
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">Codice</span>
                <span className="font-mono text-xs">{asset.ticker}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">Aggiornato</span>
              <span className="tabular-nums">{format(lastUpdate, 'dd/MM/yyyy', { locale: it })}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onEdit}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Modifica
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={onDelete}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { user } = useAuth();
  const isDemo   = useDemoMode();

  const { data: assets = [], isLoading: loading, refetch: refetchAssets }                = useAssets(user?.uid);
  const { data: snapshots = [], isLoading: snapshotsLoading, refetch: refetchSnapshots } = useSnapshots(user?.uid);
  const { data: overview }                                                               = useDashboardOverview(user?.uid);
  const deleteAssetMutation                                                              = useDeleteAsset(user?.uid ?? '');

  const assetTabRef = useRef<AssetManagementTabHandle>(null);

  const [pageTab,         setPageTab]         = useState<PageTab>('situazione');
  const [subAnno,         setSubAnno]         = useState<SubTabId>('prezzi');
  const [subStorico,      setSubStorico]      = useState<SubTabId>('prezzi');
  const [updating,        setUpdating]        = useState(false);
  const [cashDetailAsset,      setCashDetailAsset]      = useState<Asset | null>(null);
  const [cashEditAsset,        setCashEditAsset]        = useState<Asset | null>(null);
  const [cashEditOpen,         setCashEditOpen]         = useState(false);
  const [addCashOpen,          setAddCashOpen]          = useState(false);
  const [cashDeleteConfirmOpen, setCashDeleteConfirmOpen] = useState(false);

  const cashAssets       = useMemo(() => assets.filter((a) => a.type === 'cash'), [assets]);
  const investmentAssets = useMemo(() => assets.filter((a) => a.type !== 'cash'), [assets]);
  const historyAssets    = useMemo(() => assets.filter((a) => a.quantity > 0 && a.includeInHistoryTables), [assets]);
  const historyAssetsAll = useMemo(() => assets.filter((a) => a.includeInHistoryTables), [assets]);

  const handleUpdatePrices = async () => {
    if (!user) return;
    try {
      setUpdating(true);
      const response = await authenticatedFetch('/api/prices/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(
          `Aggiornati ${data.updated} prezzi${data.failed.length > 0 ? `, ${data.failed.length} falliti` : ''}`
        );
        await Promise.all([refetchAssets(), refetchSnapshots()]);
      } else {
        toast.error("Errore nell'aggiornamento dei prezzi");
      }
    } catch {
      toast.error("Errore nell'aggiornamento dei prezzi");
    } finally {
      setUpdating(false);
    }
  };

  const handleCashEdit = () => {
    if (!cashDetailAsset) return;
    setCashEditAsset(cashDetailAsset);
    setCashDetailAsset(null);
    setCashEditOpen(true);
  };

  const handleCashDelete = () => {
    if (!cashDetailAsset) return;
    setCashDeleteConfirmOpen(true);
  };

  const handleCashDeleteConfirmed = async () => {
    if (!cashDetailAsset) return;
    setCashDeleteConfirmOpen(false);
    try {
      await deleteAssetMutation.mutateAsync(cashDetailAsset.id);
      toast.success('Conto eliminato');
      setCashDetailAsset(null);
      await refetchAssets();
    } catch {
      toast.error("Errore nell'eliminazione");
    }
  };

  const handleCashEditClose = async () => {
    setCashEditOpen(false);
    setCashEditAsset(null);
    await refetchAssets();
  };

  const handleAddCashClose = async () => {
    setAddCashOpen(false);
    await refetchAssets();
  };

  /* ── Skeleton ───────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-8 max-desktop:portrait:pb-20">
        <div className="flex justify-between items-start">
          <div>
            <div className="h-7 w-36 bg-muted rounded-full animate-pulse mb-1.5" />
            <div className="h-3.5 w-52 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-muted rounded-full animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-64 bg-muted rounded-[2.25rem] animate-pulse" />)}
      </div>
    );
  }

  /* ── Page ───────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-10 max-desktop:portrait:pb-20">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Patrimonio</h1>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleUpdatePrices}
              disabled={isDemo || updating || assets.length === 0}
              title={isDemo ? 'Non disponibile in modalità demo' : 'Aggiorna Prezzi'}
              variant="outline"
              className="rounded-full"
            >
              <RefreshCw className={cn('h-4 w-4 sm:mr-2', updating && 'animate-spin')} />
              <span className="hidden sm:inline">{updating ? 'Aggiornamento…' : 'Aggiorna Prezzi'}</span>
            </Button>
            <Button
              onClick={() => assetTabRef.current?.openAddDialog()}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : 'Aggiungi Asset'}
              variant="default"
              className="rounded-full"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Aggiungi Asset</span>
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-[0.77rem] text-muted-foreground">Gestisci e monitora il tuo patrimonio</p>
          <div className="flex items-end gap-5 border-b border-border/60 w-fit">
            <PageTabButton active={pageTab === 'situazione'} onClick={() => setPageTab('situazione')}>
              La mia situazione
            </PageTabButton>
            <PageTabButton active={pageTab === 'andamento'} onClick={() => setPageTab('andamento')}>
              Andamento annuale
            </PageTabButton>
          </div>
        </div>
      </div>

      {/* ── La mia situazione — always mounted for ref stability ────────────── */}
      <div className={cn('space-y-10', pageTab !== 'situazione' && 'hidden')}>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_320px] gap-4">
          <HeroCard overview={overview} />
          <LiquidityCard overview={overview} />
        </div>

        {/* Conti Correnti */}
        <section>
          <SectionLabel>Conti Correnti</SectionLabel>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-stretch">
            {cashAssets.map((asset) => (
              <CashAccountCard
                key={asset.id}
                asset={asset}
                onClick={() => setCashDetailAsset(asset)}
              />
            ))}
            {!isDemo && (
              <AddCashCard onClick={() => setAddCashOpen(true)} />
            )}
          </div>
        </section>

        {/* I miei Investimenti */}
        <section>
          <SectionLabel>I miei Investimenti</SectionLabel>
          <AssetManagementTab ref={assetTabRef} assets={investmentAssets} loading={loading} />
        </section>

      </div>

      {/* ── Andamento annuale ──────────────────────────────────────────────── */}
      {pageTab === 'andamento' && (
        <div className="space-y-10">

          <section>
            <SectionLabel>Anno Corrente</SectionLabel>
            <SubTabPills active={subAnno} onChange={setSubAnno} />
            <Tabs value={subAnno} onValueChange={(v) => setSubAnno(v as SubTabId)}>
              <TabsContent value="prezzi">
                <AssetPriceHistoryTable
                  assets={historyAssets} snapshots={snapshots}
                  filterYear={getCurrentYear()} displayMode="price"
                  includePreviousMonthBaseline restrictToPassedAssets showTotalRow={false}
                  loading={snapshotsLoading}
                />
              </TabsContent>
              <TabsContent value="valori">
                <AssetPriceHistoryTable
                  assets={historyAssets} snapshots={snapshots}
                  filterYear={getCurrentYear()} displayMode="totalValue"
                  includePreviousMonthBaseline restrictToPassedAssets showTotalRow
                  loading={snapshotsLoading}
                />
              </TabsContent>
              <TabsContent value="asset-class">
                <AssetClassHistoryTable
                  snapshots={snapshots} filterYear={getCurrentYear()} includePreviousMonthBaseline
                  loading={snapshotsLoading}
                />
              </TabsContent>
            </Tabs>
          </section>

          <section>
            <SectionLabel>Storico</SectionLabel>
            <SubTabPills active={subStorico} onChange={setSubStorico} />
            <Tabs value={subStorico} onValueChange={(v) => setSubStorico(v as SubTabId)}>
              <TabsContent value="prezzi">
                <AssetPriceHistoryTable
                  assets={historyAssetsAll} snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }} displayMode="price"
                  restrictToPassedAssets showTotalRow={false}
                  loading={snapshotsLoading}
                />
              </TabsContent>
              <TabsContent value="valori">
                <AssetPriceHistoryTable
                  assets={historyAssetsAll} snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }} displayMode="totalValue"
                  restrictToPassedAssets showTotalRow
                  loading={snapshotsLoading}
                />
              </TabsContent>
              <TabsContent value="asset-class">
                <AssetClassHistoryTable
                  snapshots={snapshots} filterStartDate={{ year: 2025, month: 11 }}
                  loading={snapshotsLoading}
                />
              </TabsContent>
            </Tabs>
          </section>

        </div>
      )}

      {/* ── Cash detail modal ───────────────────────────────────────────────── */}
      {cashDetailAsset && (
        <CashDetailModal
          asset={cashDetailAsset}
          isDemo={isDemo}
          onClose={() => setCashDetailAsset(null)}
          onEdit={handleCashEdit}
          onDelete={handleCashDelete}
        />
      )}

      {/* ── Cash delete confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={cashDeleteConfirmOpen} onOpenChange={setCashDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina conto corrente</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare <strong>{cashDetailAsset?.name}</strong>? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleCashDeleteConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cash edit dialog ─────────────────────────────────────────────────── */}
      <AssetDialog
        open={cashEditOpen}
        onClose={handleCashEditClose}
        asset={cashEditAsset}
      />

      {/* ── Add cash dialog ──────────────────────────────────────────────────── */}
      <AssetDialog
        open={addCashOpen}
        onClose={handleAddCashClose}
        asset={null}
      />

    </div>
  );
}
