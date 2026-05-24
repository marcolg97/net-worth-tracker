'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpenseTrackingTab, ExpenseTrackingTabHandle } from '@/components/cashflow/ExpenseTrackingTab';
import { CurrentYearTab } from '@/components/cashflow/CurrentYearTab';
import { TotalHistoryTab } from '@/components/cashflow/TotalHistoryTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';
import { BudgetTab } from '@/components/cashflow/BudgetTab';
import { CostCentersTab } from '@/components/cashflow/CostCentersTab';
import { CashflowSection } from '@/components/dashboard/CashflowSection';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { Expense, ExpenseCategory } from '@/types/expenses';
import { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear, getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function CashflowTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative pb-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
      )}
    >
      {children}
      <span
        className={cn(
          'absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-foreground transition-opacity duration-150',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
    </button>
  );
}

export default function CashflowPage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const trackingTabRef = useRef<ExpenseTrackingTabHandle>(null);

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['tracking']));
  const [activeTab, setActiveTab] = useState<string>('tracking');
  const [costCentersEnabled, setCostCentersEnabled] = useState<boolean | null>(null);

  const { data: allExpenses = [], isLoading: expensesLoading } = useExpenses(user?.uid);
  const { data: categories = [], isLoading: categoriesLoading } = useExpenseCategories(user?.uid);

  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(2025);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [otherDataLoading, setOtherDataLoading] = useState(false);
  const [otherDataLoaded, setOtherDataLoaded] = useState(false);

  const loading = expensesLoading || categoriesLoading || otherDataLoading;

  const { month: nowMonth, year: nowYear } = getItalyMonthYear();
  const prevMonth = nowMonth === 1 ? 12 : nowMonth - 1;
  const prevYear = nowMonth === 1 ? nowYear - 1 : nowYear;

  const expenseStats = useMemo((): DashboardOverviewExpenseStats | null => {
    if (allExpenses.length === 0) return null;

    const filterMonth = (exps: Expense[], y: number, m: number) =>
      exps.filter(e => {
        const d = e.date instanceof Date ? e.date : e.date.toDate();
        return getItalyYear(d) === y && getItalyMonth(d) === m;
      });

    const summarize = (exps: Expense[]) => {
      const income = exps.filter(e => e.type === 'income').reduce((s, e) => s + Math.abs(e.amount), 0);
      const expenses = exps.filter(e => e.type !== 'income').reduce((s, e) => s + Math.abs(e.amount), 0);
      return { income, expenses, net: income - expenses };
    };

    const buildCats = (exps: Expense[], isIncome: boolean, cats: ExpenseCategory[]) => {
      const filtered = exps.filter(e => isIncome ? e.type === 'income' : e.type !== 'income');
      const map = new Map<string, { name: string; amount: number; color?: string }>();
      for (const e of filtered) {
        const key = e.categoryId ?? '__other';
        const cat = cats.find(c => c.id === e.categoryId);
        const existing = map.get(key);
        if (existing) {
          existing.amount += Math.abs(e.amount);
        } else {
          map.set(key, { name: e.categoryName ?? 'Altro', amount: Math.abs(e.amount), color: cat?.color });
        }
      }
      return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    };

    const current = filterMonth(allExpenses, nowYear, nowMonth);
    const previous = filterMonth(allExpenses, prevYear, prevMonth);
    if (current.length === 0 && previous.length === 0) return null;

    const currentMonth = summarize(current);
    const previousMonth = summarize(previous);

    return {
      currentMonth,
      previousMonth,
      delta: {
        income: previousMonth.income > 0
          ? ((currentMonth.income - previousMonth.income) / previousMonth.income) * 100
          : 0,
        expenses: previousMonth.expenses > 0
          ? ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100
          : 0,
        net: previousMonth.net !== 0
          ? ((currentMonth.net - previousMonth.net) / Math.abs(previousMonth.net)) * 100
          : 0,
      },
      expenseCategories: buildCats(current, false, categories),
      incomeCategories: buildCats(current, true, categories),
    };
  }, [allExpenses, categories, nowMonth, nowYear, prevMonth, prevYear]);

  const loadOtherData = async () => {
    if (!user || otherDataLoaded) return;
    try {
      setOtherDataLoading(true);
      const [dividendsData, assetsData] = await Promise.all([
        authenticatedFetch(`/api/dividends?userId=${user.uid}`)
          .then(r => r.json())
          .then(d => d.dividends || []),
        getAllAssets(user.uid),
      ]);
      setDividends(dividendsData);
      setAssets(assetsData.filter(a => a.assetClass === 'equity' || a.assetClass === 'bonds'));
      setOtherDataLoaded(true);
    } catch (error) {
      console.error('Failed to load cashflow secondary data', {
        userId: user.uid,
        operation: 'loadOtherData',
        error: getErrorMessage(error),
      });
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setOtherDataLoading(false);
    }
  };

  useEffect(() => {
    if (user && mountedTabs.has('dividends') && !otherDataLoaded) {
      loadOtherData();
    }
  }, [user, mountedTabs, otherDataLoaded]);

  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      try {
        const settings = await getSettings(user.uid);
        if (settings?.cashflowHistoryStartYear !== undefined) {
          setCashflowHistoryStartYear(settings.cashflowHistoryStartYear);
        }
        setCostCentersEnabled(settings?.costCentersEnabled ?? false);
      } catch (error) {
        console.error('Failed to load cashflow settings, using fallback defaults', {
          userId: user.uid,
          operation: 'loadCashflowSettings',
          fallbackHistoryStartYear: 2025,
          fallbackCostCentersEnabled: false,
          error: getErrorMessage(error),
        });
        setCostCentersEnabled(false);
      }
    };
    void loadSettings();
  }, [user]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(user?.uid || '') });
    await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(user?.uid || '') });
    setOtherDataLoaded(false);
    await loadOtherData();
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
  };

  return (
    <div className="space-y-8 max-desktop:portrait:pb-20">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Cashflow</h1>
          <Button
            onClick={() => trackingTabRef.current?.openAddDialog()}
            variant="default"
            className="rounded-full"
            disabled={isDemo || activeTab !== 'tracking'}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nuova Spesa</span>
          </Button>
        </div>
        <p className="text-[0.77rem] text-muted-foreground">
          Traccia e analizza le tue entrate e uscite nel tempo
        </p>
      </div>

      {/* Tab navigation — scrollable underline bar */}
      <div className="flex items-end gap-5 overflow-x-auto border-b border-border/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CashflowTabButton active={activeTab === 'tracking'} onClick={() => handleTabChange('tracking')}>
          Tracciamento
        </CashflowTabButton>
        <CashflowTabButton active={activeTab === 'dividends'} onClick={() => handleTabChange('dividends')}>
          Dividendi &amp; Cedole
        </CashflowTabButton>
        <CashflowTabButton active={activeTab === 'current-year'} onClick={() => handleTabChange('current-year')}>
          Anno Corrente
        </CashflowTabButton>
        <CashflowTabButton active={activeTab === 'total-history'} onClick={() => handleTabChange('total-history')}>
          Storico Totale
        </CashflowTabButton>
        <CashflowTabButton active={activeTab === 'budget'} onClick={() => handleTabChange('budget')}>
          Budget
        </CashflowTabButton>
        {costCentersEnabled && (
          <CashflowTabButton active={activeTab === 'cost-centers'} onClick={() => handleTabChange('cost-centers')}>
            Centri di Costo
          </CashflowTabButton>
        )}
      </div>

      {/* Tab panels — lazy mount with hidden */}
      <div className={cn(activeTab !== 'tracking' && 'hidden', 'space-y-6')}>
        <CashflowSection
          expenseStats={expenseStats}
          currentMonth={nowMonth}
          currentYear={nowYear}
        />
        <ExpenseTrackingTab
          ref={trackingTabRef}
          allExpenses={allExpenses}
          categories={categories}
          loading={loading}
          onRefresh={handleRefresh}
        />
      </div>

      {mountedTabs.has('dividends') && (
        <div className={cn(activeTab !== 'dividends' && 'hidden')}>
          <DividendTrackingTab
            dividends={dividends}
            assets={assets}
            loading={loading}
            onRefresh={handleRefresh}
          />
        </div>
      )}

      {mountedTabs.has('current-year') && (
        <div className={cn(activeTab !== 'current-year' && 'hidden')}>
          <CurrentYearTab
            allExpenses={allExpenses}
            loading={loading}
            onRefresh={handleRefresh}
          />
        </div>
      )}

      {mountedTabs.has('total-history') && (
        <div className={cn(activeTab !== 'total-history' && 'hidden')}>
          <TotalHistoryTab
            allExpenses={allExpenses}
            loading={loading}
            onRefresh={handleRefresh}
            historyStartYear={cashflowHistoryStartYear}
          />
        </div>
      )}

      {mountedTabs.has('budget') && (
        <div className={cn(activeTab !== 'budget' && 'hidden')}>
          <BudgetTab
            allExpenses={allExpenses}
            categories={categories}
            loading={loading}
            historyStartYear={cashflowHistoryStartYear}
            userId={user?.uid ?? ''}
          />
        </div>
      )}

      {costCentersEnabled && mountedTabs.has('cost-centers') && (
        <div className={cn(activeTab !== 'cost-centers' && 'hidden')}>
          <CostCentersTab />
        </div>
      )}
    </div>
  );
}
