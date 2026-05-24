'use client';

import { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Expense, ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance } from '@/lib/services/assetService';
import { queryKeys } from '@/lib/query/queryKeys';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Filter, X, Pencil } from 'lucide-react';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { DeleteExpenseDialog } from '@/components/cashflow/DeleteExpenseDialog';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
];

export interface ExpenseTrackingTabHandle {
  openAddDialog: () => void;
}

interface ExpenseTrackingTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export const ExpenseTrackingTab = forwardRef<ExpenseTrackingTabHandle, ExpenseTrackingTabProps>(
  function ExpenseTrackingTab({ allExpenses, categories, loading, onRefresh }, ref) {
    const { user } = useAuth();
    const isDemo = useDemoMode();
    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
    const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('all');
    const [pageSize, setPageSize] = useState<number>(20);

    const handleAddExpense = () => {
      setEditingExpense(null);
      setDialogOpen(true);
    };

    useImperativeHandle(ref, () => ({ openAddDialog: handleAddExpense }));

    // Generate available years from ALL expenses (not filtered)
    const availableYears = useMemo(() => {
      if (allExpenses.length === 0) return [];
      const years = allExpenses.map(e => {
        const d = e.date instanceof Date ? e.date : e.date.toDate();
        return d.getFullYear();
      });
      return Array.from(new Set(years)).sort((a, b) => b - a);
    }, [allExpenses]);

    const handleYearChange = (year: number) => {
      setSelectedYear(year);
      setSelectedMonth('all');
    };

    const handleCurrentMonth = () => {
      setSelectedYear(currentYear);
      setSelectedMonth(currentMonth);
    };

    const handleSelectType = (type: string) => {
      setSelectedType(type);
      setSelectedCategoryId('all');
      setSelectedSubCategoryId('all');
    };

    const handleSelectCategory = (categoryId: string) => {
      setSelectedCategoryId(categoryId);
      setSelectedSubCategoryId('all');
    };

    const handleSelectSubCategory = (subCategoryId: string) => {
      setSelectedSubCategoryId(subCategoryId);
    };

    const handleResetFilters = () => {
      setSelectedType('all');
      setSelectedCategoryId('all');
      setSelectedSubCategoryId('all');
    };

    const handleClearType = () => {
      setSelectedType('all');
      setSelectedCategoryId('all');
      setSelectedSubCategoryId('all');
    };

    const handleClearCategory = () => {
      setSelectedCategoryId('all');
      setSelectedSubCategoryId('all');
    };

    const handleClearSubCategory = () => {
      setSelectedSubCategoryId('all');
    };

    const activeFilterCount = [selectedType, selectedCategoryId, selectedSubCategoryId]
      .filter(v => v !== 'all').length;

    // Derive year+month slice from allExpenses synchronously — no extra render on filter change.
    const expenses = useMemo(() => {
      return allExpenses.filter(expense => {
        const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
        if (date.getFullYear() !== selectedYear) return false;
        if (selectedMonth !== 'all' && date.getMonth() + 1 !== parseInt(selectedMonth)) return false;
        return true;
      });
    }, [allExpenses, selectedYear, selectedMonth]);

    const handleEditExpense = (expense: Expense) => {
      setEditingExpense(expense);
      setDialogOpen(true);
    };

    const handleDialogClose = () => {
      setDialogOpen(false);
      setEditingExpense(null);
    };

    const handleSuccess = async () => {
      await onRefresh();
    };

    const handleDeleteExpense = (expense: Expense) => {
      setExpenseToDelete(expense);
    };

    const handleDialogDeleteAll = async (expense: Expense) => {
      if (expense.installmentParentId) {
        await deleteAllInstallmentExpenses(expense.installmentParentId);
      } else if (expense.recurringParentId) {
        await deleteAllRecurringExpenses(expense.recurringParentId);
      }
    };

    const deleteSingleExpense = async (expense: Expense) => {
      try {
        // Reverse the balance effect on the linked cash asset before deleting
        if (expense.linkedCashAssetId) {
          await updateCashAssetBalance(expense.linkedCashAssetId, -expense.amount);
          if (user) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        }
        const { deleteExpense } = await import('@/lib/services/expenseService');
        await deleteExpense(expense.id);
        toast.success('Voce eliminata con successo');
        await onRefresh();
      } catch (error) {
        console.error('Error deleting expense:', error);
        toast.error("Errore nell'eliminazione della voce");
      }
    };

    const deleteAllRecurringExpenses = async (recurringParentId: string) => {
      try {
        // Reverse balance effects before bulk-deleting (only the first entry stores linkedCashAssetId)
        const seriesExpenses = await getExpensesByRecurringParentId(recurringParentId);
        for (const exp of seriesExpenses) {
          if (exp.linkedCashAssetId) {
            await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
          }
        }
        if (user && seriesExpenses.some(e => e.linkedCashAssetId)) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        }
        const { deleteRecurringExpenses } = await import('@/lib/services/expenseService');
        await deleteRecurringExpenses(recurringParentId);
        toast.success('Tutte le voci ricorrenti sono state eliminate');
        await onRefresh();
      } catch (error) {
        console.error('Error deleting recurring expenses:', error);
        toast.error("Errore nell'eliminazione delle voci ricorrenti");
      }
    };

    const deleteAllInstallmentExpenses = async (installmentParentId: string) => {
      try {
        // Reverse balance effects before bulk-deleting (only the first installment stores linkedCashAssetId)
        const seriesExpenses = await getExpensesByInstallmentParentId(installmentParentId);
        for (const exp of seriesExpenses) {
          if (exp.linkedCashAssetId) {
            await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
          }
        }
        if (user && seriesExpenses.some(e => e.linkedCashAssetId)) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        }
        const { deleteInstallmentExpenses } = await import('@/lib/services/expenseService');
        await deleteInstallmentExpenses(installmentParentId);
        toast.success('Tutte le rate sono state eliminate');
        await onRefresh();
      } catch (error) {
        console.error('Error deleting installment expenses:', error);
        toast.error("Errore nell'eliminazione delle rate");
      }
    };

    // Filter options for Category based on selected type
    const categoryOptions = useMemo(() => {
      if (selectedType === 'all') return [];
      return categories.filter(cat => cat.type === selectedType);
    }, [categories, selectedType]);

    // Filter options for Subcategory based on selected category
    const subCategoryOptions = useMemo(() => {
      if (selectedCategoryId === 'all') return [];
      const cat = categories.find(c => c.id === selectedCategoryId);
      return cat?.subCategories ?? [];
    }, [categories, selectedCategoryId]);

    const filteredExpenses = useMemo(() => {
      let filtered = [...expenses];
      if (selectedType !== 'all') filtered = filtered.filter(e => e.type === selectedType);
      if (selectedType !== 'all' && selectedCategoryId !== 'all')
        filtered = filtered.filter(e => e.categoryId === selectedCategoryId);
      if (selectedType !== 'all' && selectedCategoryId !== 'all' && selectedSubCategoryId !== 'all')
        filtered = filtered.filter(e => e.subCategoryId === selectedSubCategoryId);
      return filtered;
    }, [expenses, selectedType, selectedCategoryId, selectedSubCategoryId]);

    if (loading) {
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-7 w-48 bg-muted rounded-full animate-pulse" />
            <div className="h-8 w-32 bg-muted rounded-lg animate-pulse" />
          </div>
          <div className="h-64 bg-muted rounded-[1.5rem] animate-pulse" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Mobile FAB — stays, ergonomic for one-handed use */}
        <Button
          onClick={handleAddExpense}
          disabled={isDemo}
          className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg desktop:hidden"
          aria-label="Nuova Spesa"
        >
          <Plus className="h-6 w-6" />
        </Button>

        {/* Controls bar: year pills + month select + filter popover */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Year pills */}
            {availableYears.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0">
                {availableYears.map(year => (
                  <button
                    key={year}
                    onClick={() => handleYearChange(year)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                      selectedYear === year
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            {/* Month select */}
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[130px] h-8 text-xs shrink-0">
                <SelectValue placeholder="Mese" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i mesi</SelectItem>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Current month shortcut */}
            <Button
              variant="outline"
              onClick={handleCurrentMonth}
              className="rounded-full shrink-0 h-8 px-3 text-xs"
            >
              Mese corrente
            </Button>

            {/* Filter popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="rounded-full shrink-0 h-8 px-3 text-xs gap-1.5">
                  <Filter className="h-3 w-3" />
                  Filtri
                  {activeFilterCount > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.6rem] font-bold leading-4">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={selectedType} onValueChange={handleSelectType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tutti" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      <SelectItem value="income">{EXPENSE_TYPE_LABELS.income}</SelectItem>
                      <SelectItem value="fixed">{EXPENSE_TYPE_LABELS.fixed}</SelectItem>
                      <SelectItem value="variable">{EXPENSE_TYPE_LABELS.variable}</SelectItem>
                      <SelectItem value="debt">{EXPENSE_TYPE_LABELS.debt}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedType !== 'all' && categoryOptions.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Categoria</Label>
                    <Select value={selectedCategoryId} onValueChange={handleSelectCategory}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tutte" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte</SelectItem>
                        {categoryOptions.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {selectedCategoryId !== 'all' && subCategoryOptions.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sottocategoria</Label>
                    <Select value={selectedSubCategoryId} onValueChange={handleSelectSubCategory}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tutte" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte</SelectItem>
                        {subCategoryOptions.map(sub => (
                          <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleResetFilters}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Ripristina filtri
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedType !== 'all' && (
                <span className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-xs">
                  {EXPENSE_TYPE_LABELS[selectedType as ExpenseType]}
                  <button onClick={handleClearType} className="hover:text-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {selectedCategoryId !== 'all' && (
                <span className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-xs">
                  {categories.find(c => c.id === selectedCategoryId)?.name}
                  <button onClick={handleClearCategory} className="hover:text-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {selectedSubCategoryId !== 'all' && (
                <span className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-xs">
                  {subCategoryOptions.find(s => s.id === selectedSubCategoryId)?.name}
                  <button onClick={handleClearSubCategory} className="hover:text-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expense list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {selectedMonth !== 'all'
                ? `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
                : `${selectedYear}`}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mostra</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desktop: Table */}
          <div className="hidden desktop:block">
            <ExpenseTable
              expenses={filteredExpenses}
              onEdit={handleEditExpense}
              onRefresh={onRefresh}
              isDemo={isDemo}
              pageSize={pageSize}
            />
          </div>

          {/* Mobile: Compact list rows */}
          <div className="desktop:hidden">
            {filteredExpenses.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">Nessuna voce trovata</p>
              </div>
            ) : (
              <Card className="py-0 gap-0 overflow-hidden">
                <div className="divide-y divide-border">
                  {filteredExpenses.slice(0, pageSize).map((expense) => {
                    const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
                    const isIncome = expense.type === 'income';
                    const catColor = categories.find(c => c.id === expense.categoryId)?.color;
                    return (
                      <div key={expense.id} className="flex items-center gap-3 px-4 py-3">
                        <div
                          className="h-2 w-2 rounded-full shrink-0 bg-muted"
                          style={catColor ? { backgroundColor: catColor } : undefined}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {expense.notes || expense.categoryName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {expense.categoryName}
                            {expense.subCategoryName && ` · ${expense.subCategoryName}`}
                            {' · '}{date.getDate()}/{date.getMonth() + 1}
                          </p>
                        </div>
                        <p className={cn(
                          'text-sm font-semibold tabular-nums shrink-0',
                          isIncome ? 'text-green-600' : 'text-red-600',
                        )}>
                          {isIncome ? '+' : ''}{cachedFormatCurrencyEUR(Math.abs(expense.amount))}
                        </p>
                        {!isDemo && (
                          <button
                            onClick={() => handleEditExpense(expense)}
                            className="shrink-0 p-2.5 rounded-full hover:bg-muted transition-colors"
                            aria-label="Modifica"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {filteredExpenses.length > pageSize && (
                  <p className="text-xs text-muted-foreground text-center py-3 border-t border-border">
                    Visualizzate {pageSize} di {filteredExpenses.length} voci. Aumenta il limite o usa i filtri.
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* Dialogs */}
        <ExpenseDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          expense={editingExpense}
          onSuccess={handleSuccess}
        />
        <DeleteExpenseDialog
          expense={expenseToDelete}
          onClose={() => setExpenseToDelete(null)}
          onDeleteSingle={deleteSingleExpense}
          onDeleteAll={handleDialogDeleteAll}
        />
      </div>
    );
  }
);
