'use client';

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
import { Button } from '@/components/ui/button';
import { Expense } from '@/types/expenses';

interface DeleteExpenseDialogProps {
  expense: Expense | null;
  onClose: () => void;
  onDeleteSingle: (expense: Expense) => Promise<void>;
  onDeleteAll: (expense: Expense) => Promise<void>;
}

export function DeleteExpenseDialog({
  expense,
  onClose,
  onDeleteSingle,
  onDeleteAll,
}: DeleteExpenseDialogProps) {
  if (!expense) return null;

  const isInstallment = !!(expense.isInstallment && expense.installmentParentId);
  const isRecurring = !!(expense.isRecurring && expense.recurringParentId);

  const handleDeleteSingle = async () => {
    await onDeleteSingle(expense);
    onClose();
  };

  const handleDeleteAll = async () => {
    await onDeleteAll(expense);
    onClose();
  };

  if (isInstallment) {
    return (
      <AlertDialog open onOpenChange={open => !open && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina rata</AlertDialogTitle>
            <AlertDialogDescription>
              Rata {expense.installmentNumber}/{expense.installmentTotal}
              {expense.notes ? ` di “${expense.notes}”` : ''}.{' '}
              Vuoi eliminare solo questa rata o tutte le {expense.installmentTotal} rate?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={onClose}>Annulla</AlertDialogCancel>
            <Button variant="outline" onClick={handleDeleteSingle}>
              Solo questa rata
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAll}
            >
              Tutte le {expense.installmentTotal} rate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (isRecurring) {
    return (
      <AlertDialog open onOpenChange={open => !open && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina voce ricorrente</AlertDialogTitle>
            <AlertDialogDescription>
              {expense.notes ? `"${expense.notes}"` : 'Questa voce'} è ricorrente.
              Vuoi eliminare solo questa occorrenza o tutte le voci correlate?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={onClose}>Annulla</AlertDialogCancel>
            <Button variant="outline" onClick={handleDeleteSingle}>
              Solo questa
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAll}
            >
              Tutte le voci correlate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Elimina voce</AlertDialogTitle>
          <AlertDialogDescription>
            {expense.notes
              ? `Sei sicuro di voler eliminare "${expense.notes}"?`
              : 'Sei sicuro di voler eliminare questa voce?'}{' '}
            L&apos;operazione non può essere annullata.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDeleteSingle}
          >
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
