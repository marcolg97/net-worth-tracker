'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  staggerContainer,
  cardItem,
  heroMetricSettle,
  springLayoutTransition,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { SavingsRateBadge } from '@/components/ui/SavingsRateBadge';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { getGreeting } from '@/lib/utils/getGreeting';
import { HeroCard } from '@/components/dashboard/HeroCard';
import { LiquidityCard } from '@/components/dashboard/LiquidityCard';
import { CompositionRow } from '@/components/dashboard/CompositionRow';
import { StatsSection } from '@/components/dashboard/StatsSection';
import { CashflowSection } from '@/components/dashboard/CashflowSection';
import { useDemoMode } from '@/lib/hooks/useDemoMode';

const MotionButtonShell = motion.div;

/**
 * MAIN DASHBOARD PAGE
 *
 * Central overview showing current portfolio state and key metrics.
 *
 * DATA LOADING STRATEGY:
 * The page now consumes a single server-aggregated overview query plus the
 * existing snapshot mutation. This keeps the render layer thin while preserving
 * the same cards, charts, and conditional sections users already see.
 */

export default function DashboardPage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();

  // Calculated once at mount — no need to re-evaluate on every render.
  // Hour extracted in Europe/Rome timezone so the greeting is always contextually correct.
  const greeting = useMemo(() => {
    const italyHour = getItalyDate(new Date()).getHours();
    const result = getGreeting(italyHour);
    const firstName = user?.displayName?.split(' ')[0];
    const label = firstName && firstName.length <= 20
      ? `${result.greeting} ${firstName}`
      : result.greeting;
    return { label, subtitle: result.subtitle };
  }, [user?.displayName]);

  const { data: overview, isLoading: loadingOverview } = useDashboardOverview(user?.uid);
  const createSnapshotMutation = useCreateSnapshot(user?.uid || '');

  const loading = loadingOverview;

  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // Cost basis detail starts open — user can collapse to reduce visual density
  const [snapshotDialogStyle, setSnapshotDialogStyle] = useState<CSSProperties | undefined>(undefined);
  const snapshotButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapshotDialogRef = useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    if (!showConfirmDialog || prefersReducedMotion) {
      setSnapshotDialogStyle(undefined);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const trigger = snapshotButtonRef.current;
      const dialog = snapshotDialogRef.current;

      if (!trigger || !dialog) {
        setSnapshotDialogStyle(undefined);
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const originX = triggerRect.left + (triggerRect.width / 2) - dialogRect.left;
      const originY = triggerRect.top + (triggerRect.height / 2) - dialogRect.top;

      setSnapshotDialogStyle({
        transformOrigin: `${originX}px ${originY}px`,
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [showConfirmDialog, prefersReducedMotion]);

  const currentMonthReference = useMemo(() => getItalyMonthYear(), []);

  /**
   * Create monthly snapshot of current portfolio state.
   *
   * Flow:
   * 1. Check if snapshot already exists for current month
   * 2. If exists: Show confirmation dialog with overwrite warning
   * 3. If not: Proceed directly to snapshot creation
   * 4. Update Hall of Fame rankings after successful snapshot creation
   *
   * Snapshot includes:
   * - Total/liquid/illiquid net worth
   * - Asset class breakdown for historical charts
   * - Individual asset values and prices (enables price history tracking)
   * - Timestamp for audit trail
   *
   * Note: Price updates automatically fetched before snapshot creation (handled by API route).
   * This ensures snapshot captures most recent market prices.
   */
  const handleCreateSnapshot = async () => {
    if (!user) return;

    // Check if snapshot for current month already exists (prevent accidental duplicates)
    try {
      if (overview?.flags.currentMonthSnapshotExists) {
        setShowConfirmDialog(true);
      } else {
        await createSnapshot();
      }
    } catch (error) {
      console.error('Error checking existing snapshots:', error);
      toast.error('Errore nel controllo degli snapshot esistenti');
    }
  };

  /**
   * Execute snapshot creation and handle UI feedback.
   *
   * Uses React Query mutation hook for:
   * - Automatic loading states (tracked in createSnapshotMutation.isLoading)
   * - Cache invalidation (triggers automatic re-fetch of snapshots list)
   * - Error handling with retry logic (built into React Query)
   *
   * Side effects:
   * - Updates Hall of Fame rankings (non-critical, failure doesn't stop flow)
   * - Toast notifications for user feedback (loading → success/error)
   * - Cache invalidation triggers re-render with new snapshot data
   *
   * @mutates Firestore: Creates new snapshot document in user's snapshots collection
   * @mutates Cache: Invalidates snapshots query to trigger automatic refetch
   */
  const createSnapshot = async () => {
    if (!user) return;

    try {
      setCreatingSnapshot(true);
      setShowConfirmDialog(false);

      // Show loading toast with unique ID for later dismissal
      toast.loading('Aggiornamento prezzi e creazione snapshot...', {
        id: 'snapshot-creation',
      });

      // Use mutation hook to create snapshot (handles API call + cache invalidation)
      const result = await createSnapshotMutation.mutateAsync({});

      // Dismiss loading toast
      toast.dismiss('snapshot-creation');

      toast.success(result.message);

      // Update Hall of Fame after successful snapshot creation.
      // This is non-critical: failure doesn't block user flow or show error.
      // Hall of Fame can be manually recalculated from Hall of Fame page if needed.
      try {
        await updateHallOfFame(user.uid);
      } catch (error) {
        console.error('Error updating Hall of Fame:', error);
        // Don't show error to user - Hall of Fame update is non-critical
      }

      // React Query automatically refetches snapshots via cache invalidation in the mutation hook
    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast.dismiss('snapshot-creation');
      toast.error('Errore nella creazione dello snapshot');
    } finally {
      setCreatingSnapshot(false);
    }
  };


  if (loading) {
    return (
      <div className="space-y-6 max-desktop:portrait:pb-20">
        {/* Header skeleton */}
        <div className="flex justify-between items-start">
          <div>
            <div className="h-7 w-56 bg-muted rounded animate-pulse mb-1.5" />
            <div className="h-4 w-40 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-muted rounded-full animate-pulse" />
        </div>
        {/* Row 1 skeleton — hero + liquidity */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px] gap-4">
          <div className="rounded-[2.25rem] bg-card px-6 py-6 [box-shadow:var(--sh-card)]">
            <div className="h-2.5 w-36 bg-muted rounded-full animate-pulse mb-4" />
            <div className="h-12 w-52 bg-muted rounded-full animate-pulse mb-4" />
            <div className="flex gap-2">
              <div className="h-6 w-36 bg-muted rounded-full animate-pulse" />
              <div className="h-6 w-24 bg-muted rounded-full animate-pulse" />
            </div>
          </div>
          <div className="rounded-[2.25rem] bg-card p-6 [box-shadow:var(--sh-card)]">
            <div className="h-2.5 w-32 bg-muted rounded-full animate-pulse mb-3" />
            <div className="h-8 w-40 bg-muted rounded-full animate-pulse" />
          </div>
        </div>
        {/* Cashflow skeleton */}
        <div className="rounded-[2.25rem] bg-card px-6 py-6 [box-shadow:var(--sh-card)]">
          <div className="h-2.5 w-36 bg-muted rounded-full animate-pulse mb-5" />
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="h-2.5 w-16 bg-muted rounded-full animate-pulse" />
              <div className="h-8 w-28 bg-muted rounded-full animate-pulse" />
              <div className="h-2.5 w-24 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-12 bg-muted rounded-full animate-pulse" />
              <div className="h-8 w-28 bg-muted rounded-full animate-pulse" />
              <div className="h-2.5 w-24 bg-muted rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    // pb-20 on portrait mobile compensates for the BottomNavigation bar (h-16 = 64px)
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="space-y-5 max-desktop:portrait:pb-20"
    >
      {/* Header — greeting on left, timestamp + snapshot button on right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{greeting.label}</h1>
          <p className="text-[0.77rem] text-muted-foreground mt-0.5">
            {new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(getItalyDate(new Date()))}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {overview?.freshness.updatedAt && (
            <span className="hidden sm:flex items-center gap-1 text-[0.71rem] text-muted-foreground">
              <Camera className="h-3 w-3" />
              Aggiornato {new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(overview.freshness.updatedAt))}
            </span>
          )}
          <MotionButtonShell
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            transition={springLayoutTransition}
          >
            <Button
              ref={snapshotButtonRef}
              onClick={handleCreateSnapshot}
              disabled={isDemo || creatingSnapshot || (overview?.flags.assetCount ?? 0) === 0}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              variant="default"
              className="w-full sm:w-auto rounded-full"
            >
              <Camera className="mr-2 h-4 w-4" />
              {creatingSnapshot ? 'Creazione...' : 'Snapshot'}
            </Button>
          </MotionButtonShell>
        </div>
      </div>

      {/* Row 1: Hero (flex) + Liquidity (280px) side-by-side on sm+, stacked on mobile.
          motion.section doubles as the CSS grid container so the stagger still
          reaches the two direct motion.div children. */}
      <motion.section
        layout="position"
        transition={springLayoutTransition}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-[1fr_280px] gap-4"
      >
        {/* Hero card — dominant number inline with variation badge, sparkline below. */}
        <motion.div
          layout="position"
          transition={springLayoutTransition}
          variants={heroMetricSettle}
        >
          <HeroCard overview={overview} />
        </motion.div>

        {/* Liquidity card — side panel on desktop, stacked below hero on mobile. */}
        <motion.div layout="position" transition={springLayoutTransition} variants={cardItem} className="h-full">
          <LiquidityCard overview={overview} />
        </motion.div>

      </motion.section>

      {/* Row 2: Configurable stats (fiscal detail + TER/cost) */}
      {overview && (overview.flags.hasCostBasisTracking || overview.flags.hasTERTracking || overview.flags.hasStampDuty) && (
        <StatsSection metrics={overview.metrics} flags={overview.flags} />
      )}

      {/* Row 3: Composition donut + Asset list */}
      <CompositionRow
        assetClassData={overview?.charts.assetClassData ?? []}
        assetData={overview?.charts.assetData ?? []}
        liquidityData={overview?.charts.liquidityData ?? []}
        assetCount={overview?.flags.assetCount ?? 0}
      />

      {/* Row 4: Cashflow full-width */}
      <CashflowSection
        expenseStats={overview?.expenseStats ?? null}
        currentMonth={currentMonthReference.month}
        currentYear={currentMonthReference.year}
      />

      {/* Confirm Dialog */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSnapshotDialogStyle(undefined);
          }
          setShowConfirmDialog(nextOpen);
        }}
      >
        <DialogContent
          ref={snapshotDialogRef}
          style={snapshotDialogStyle}
          className="duration-300 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-100 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 sm:max-w-md"
          showCloseButton={false}
        >
          <DialogHeader>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Snapshot mensile
            </p>
            <DialogTitle>Snapshot già esistente</DialogTitle>
            <DialogDescription>
              Esiste già uno snapshot per questo mese (
              {`${String(currentMonthReference.month).padStart(2, '0')}/${currentMonthReference.year}`}
              ). Vuoi sovrascriverlo con i dati attuali?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={creatingSnapshot}
            >
              Annulla
            </Button>
            <Button
              onClick={createSnapshot}
              disabled={creatingSnapshot}
            >
              {creatingSnapshot ? 'Creazione...' : 'Sovrascrivi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Savings rate celebration badge — shown once per session when last month > threshold */}
      {overview?.expenseStats && (
        <SavingsRateBadge
          previousMonthIncome={overview.expenseStats.previousMonth.income}
          previousMonthExpenses={overview.expenseStats.previousMonth.expenses}
        />
      )}
    </motion.div>
  );
}
