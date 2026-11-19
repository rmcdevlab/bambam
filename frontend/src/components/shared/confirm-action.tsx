"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmAsk = {
  title: string;
  description?: ReactNode;
  /** The confirm button — same verb as the button that opened it. */
  action: string;
  cancel?: string;
  destructive?: boolean;
};

/**
 * Repair CR-044: a confirm popup after an important confirm button, before anything is sent.
 * `const [confirm, confirmDialog] = useConfirm();` → `if (!(await confirm({...}))) return;` and render `{confirmDialog}`.
 * Phones: a bottom sheet, like the other dialogs.
 */
export function useConfirm() {
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((value: ConfirmAsk) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setAsk(value);
    setOpen(true);
  }), []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  };

  const dialog = <AlertDialog open={open} onOpenChange={(o) => { if (!o) finish(false); }}>
    <AlertDialogContent className="top-auto bottom-0 w-full max-w-none translate-y-0 rounded-b-none rounded-t-xl sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-y-1/2 sm:rounded-xl">
      <AlertDialogHeader>
        <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
        {ask?.description && <AlertDialogDescription>{ask.description}</AlertDialogDescription>}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="min-h-11">{ask?.cancel ?? "ยกเลิก"}</AlertDialogCancel>
        <AlertDialogAction className="min-h-11" variant={ask?.destructive ? "destructive" : "default"} onClick={() => finish(true)}>{ask?.action}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;

  return [confirm, dialog] as const;
}
