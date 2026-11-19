"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownUp, Check, Inbox, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Pager, pageRange } from "@/components/shared/pager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// CR-046 — one list layout for every repair list (S09 งานซ่อม, S11 งานทั้งหมด, S06 ติดตามงานซ่อม, S18 ช่างภายนอก),
// from the owner draft output/technician-ui/index.html: a card with heading + count, underline tabs, search +
// ตัวกรอง (n) → filter sheet (bottom sheet on phones), removable chips, a table from `lg` and cards below it,
// then `แสดง a–b จาก n` + the numbered pager. Pages keep their own columns, filters and fetching.

/** Bottom sheet on phones, centred dialog from `sm` (design-system.md "Dialog / sheet"). */
export const SHEET_CLASS = "top-auto bottom-0 max-h-[92dvh] w-full max-w-none translate-y-0 overflow-y-auto rounded-b-none rounded-t-xl sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl";

// ---- card + heading ----

export function ListCard({ title, count, meta, children, className }: {
  title: string; count?: number; meta?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section aria-labelledby="list-title" className={cn("overflow-hidden rounded-xl border bg-card shadow-card", className)}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-1 lg:px-6 lg:pt-5">
      <h2 id="list-title" className="flex items-center gap-2.5 text-lg leading-7 font-semibold">{title}
        <span role="status" className={cn("rounded-md bg-secondary px-2 text-xs leading-6 font-semibold text-secondary-foreground tabular-nums", count === undefined && "invisible")}>
          {count ?? 0}<span className="sr-only"> รายการ</span>
        </span>
      </h2>
      {meta}
    </div>
    {children}
  </section>;
}

// ---- tabs ----

export type ListTab = { value: string; label: string; short?: string; count?: number };

/**
 * Underline tabs. `fill`: equal-width grid on phones with the count above the label (S09 / S11 steps), so every
 * step stays visible without sideways scrolling; otherwise a scrolling row (S06 relations).
 */
export function ListTabs({ label, value, tabs, onChange, fill = false }: { label: string; value: string; tabs: ListTab[]; onChange: (v: string) => void; fill?: boolean }) {
  return <div className="border-b px-2 sm:px-4 lg:px-6">
    <div role="group" aria-label={label} className={cn("-mb-px min-w-0", fill ? "grid auto-cols-fr grid-flow-col sm:flex sm:gap-1" : "flex gap-1 overflow-x-auto")}>
      {tabs.map((t) => {
        const on = value === t.value;
        return <button key={t.value} type="button" aria-pressed={on} onClick={() => onChange(t.value)}
          className={cn("flex min-h-12 shrink-0 items-center justify-center gap-1.5 border-b-2 px-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 sm:px-3",
            fill && "flex-col gap-0.5 py-2 text-[13px] leading-5 sm:flex-row sm:gap-1.5 sm:py-0 sm:text-sm",
            on ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.count !== undefined && <span className={cn("rounded-[5px] px-1.5 text-xs leading-5 font-semibold tabular-nums", on ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground", !fill && "order-last")}>{t.count}</span>}
          <span className={cn(fill && "text-center text-balance")}>{t.short ? <><span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span></> : t.label}</span>
        </button>;
      })}
    </div>
  </div>;
}

// ---- filters ----

export type FilterOption = { value: string; label: string };
export type FilterDef = {
  key: string;
  label: string;
  options: FilterOption[];
  /** The "everything" value (default `all`) — not counted, no chip. */
  allValue?: string;
  /** `sort`: shown in the sheet but never counted or chipped. */
  kind?: "filter" | "sort";
  /** CR-048: several values at once — the value is a comma list (`a,b`); the "everything" option clears it. */
  multiple?: boolean;
};
export type FilterValues = Record<string, string>;

const allOf = (d: FilterDef) => d.allValue ?? "all";
const activeFilters = (defs: FilterDef[], values: FilterValues) =>
  defs.filter((d) => d.kind !== "sort" && (values[d.key] ?? allOf(d)) !== allOf(d));
/** The picked values of a filter (a multiple filter keeps a comma list). */
const picked = (d: FilterDef, value: string | undefined) => (!value || value === allOf(d) ? [] : d.multiple ? value.split(",") : [value]);
/** Toggle one option of a multiple filter; none left → everything. */
function toggleValue(d: FilterDef, value: string | undefined, option: string) {
  if (option === allOf(d)) return allOf(d);
  const list = picked(d, value);
  const next = list.includes(option) ? list.filter((v) => v !== option) : [...list, option];
  return next.length ? next.join(",") : allOf(d);
}

/** CR-050: the list order — its own button beside ตัวกรอง (S06 / S09), applied at once, never counted or chipped. */
export type ListSort = { value: string; options: FilterOption[]; onChange: (v: string) => void };

/** Search box + เรียงลำดับ + ตัวกรอง (n) + optional extra controls, then the active filter chips. */
export function ListToolbar({ search, sort, filters, extra }: {
  search: { label: string; value: string; onChange: (v: string) => void };
  sort?: ListSort;
  filters?: { title: string; defs: FilterDef[]; values: FilterValues; onApply: (v: FilterValues) => void };
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = filters ? activeFilters(filters.defs, filters.values) : [];
  return <div className="space-y-2.5 px-3 pt-4 pb-2 sm:px-4 lg:px-6">
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label={search.label} placeholder={search.label} maxLength={50} value={search.value}
          onChange={(e) => search.onChange(e.target.value)} className="h-11 rounded-lg bg-card pr-3 pl-10 text-base sm:text-sm" />
      </div>
      {sort && <SortMenu {...sort} />}
      {filters && <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={cn("h-11 shrink-0 rounded-lg px-3.5", active.length > 0 && "border-primary/40 text-primary")}>
        <SlidersHorizontal aria-hidden />ตัวกรอง{active.length > 0 && <span className="tabular-nums">({active.length})</span>}
      </Button>}
      {extra}
    </div>
    {filters && active.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      {/* One chip per picked value, so each building of a multiple filter can be removed on its own. */}
      {active.flatMap((d) => picked(d, filters.values[d.key]).map((v) => {
        const opt = d.options.find((o) => o.value === v);
        return <button key={`${d.key}:${v}`} type="button" onClick={() => filters.onApply({ ...filters.values, [d.key]: d.multiple ? toggleValue(d, filters.values[d.key], v) : allOf(d) })}
          aria-label={`ล้างตัวกรอง ${d.label}: ${opt?.label ?? ""}`}
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-secondary pr-2 pl-3 text-[13px] font-medium text-secondary-foreground outline-none hover:bg-secondary/80 focus-visible:ring-3 focus-visible:ring-ring/30">
          <span className="max-w-60 truncate">{d.label}: {opt?.label}</span><X className="size-3.5" aria-hidden />
        </button>;
      }))}
      {(active.length > 1 || active.some((d) => picked(d, filters.values[d.key]).length > 1)) && <Button type="button" variant="ghost" size="sm" className="h-9 text-muted-foreground"
        onClick={() => filters.onApply(Object.fromEntries(filters.defs.map((d) => [d.key, d.kind === "sort" ? filters.values[d.key] : allOf(d)])))}>ล้างทั้งหมด</Button>}
    </div>}
    {filters && <FilterSheet open={open} onOpenChange={setOpen} {...filters} />}
  </div>;
}

/** เรียงลำดับ: icon-only on phones (the name is in aria-label), the current order from `sm`. */
function SortMenu({ value, options, onChange }: ListSort) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" aria-label={`เรียงลำดับ: ${current.label}`} className="size-11 shrink-0 rounded-lg px-0 sm:w-auto sm:px-3.5">
        <ArrowDownUp aria-hidden /><span className="hidden sm:inline">{current.label}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={6} className="w-auto min-w-52 p-1.5">
      <DropdownMenuLabel className="text-[13px] text-muted-foreground">เรียงลำดับ</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={current.value} onValueChange={onChange}>
        {options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 text-sm">{o.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function FilterSheet({ open, onOpenChange, title, defs, values, onApply }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; defs: FilterDef[]; values: FilterValues; onApply: (v: FilterValues) => void;
}) {
  const [draft, setDraft] = useState<FilterValues>(values);
  const [seen, setSeen] = useState(false);
  // Start from the applied filters each time the sheet opens.
  if (open !== seen) { setSeen(open); if (open) setDraft(values); }
  const valueOf = (d: FilterDef) => draft[d.key] ?? allOf(d);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {/* CR-049: header and buttons stay put, only the options scroll — nothing shows below the buttons. */}
    <DialogContent className={cn(SHEET_CLASS, "flex flex-col gap-0 overflow-hidden p-0")}>
      <form className="flex min-h-0 flex-col" onSubmit={(e) => { e.preventDefault(); onApply(draft); onOpenChange(false); }}>
        <DialogHeader className="shrink-0 border-b px-4 pt-4 pr-12 pb-3 sm:px-6"><DialogTitle className="text-lg">{title}</DialogTitle><DialogDescription>เลือกเฉพาะรายการที่ต้องการดู</DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {defs.map((d) => <fieldset key={d.key} className="space-y-2">
          <legend className="mb-2 text-[15px] font-semibold">{d.label}{d.multiple && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">เลือกได้หลายรายการ</span>}</legend>
          <div role={d.multiple ? "group" : "radiogroup"} aria-label={d.label} className="flex flex-wrap gap-2">
            {d.options.map((o) => {
              const on = d.multiple ? (o.value === allOf(d) ? valueOf(d) === allOf(d) : picked(d, valueOf(d)).includes(o.value)) : valueOf(d) === o.value;
              return <button key={o.value} type="button" role={d.multiple ? "checkbox" : "radio"} aria-checked={on}
                onClick={() => setDraft((v) => ({ ...v, [d.key]: d.multiple ? toggleValue(d, v[d.key], o.value) : o.value }))}
                className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
                  on ? "border-primary bg-secondary font-semibold text-secondary-foreground" : "border-input bg-card hover:border-primary/40")}>
                {on && <Check className="size-4" aria-hidden />}{o.label}
              </button>;
            })}
          </div>
        </fieldset>)}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row bg-popover px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          <Button type="button" variant="outline" className="h-12 sm:h-10"
            onClick={() => setDraft(Object.fromEntries(defs.map((d) => [d.key, d.kind === "sort" ? valueOf(d) : allOf(d)])))}><RotateCcw aria-hidden />ล้างตัวกรอง</Button>
          <Button type="submit" className="h-12 flex-1 sm:h-10 sm:flex-none">แสดงผล</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** `พบ n รายการ` under the toolbar (live), with an optional note on the right. */
export function ResultBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-3 text-[13px] text-muted-foreground lg:px-6">
    <p aria-live="polite">{children}</p>{note && <p>{note}</p>}
  </div>;
}

// ---- table (lg) / cards (below lg) ----

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Width / alignment classes for the header and its cells (`w-[30%]`, `text-right`). */
  className?: string;
  cell: (row: T) => ReactNode;
};

/** CR-050: what an empty table says under `ไม่มีข้อมูล` (why, and a way out). */
export type EmptyInfo = { hint?: ReactNode; action?: ReactNode };

/**
 * Table from `lg`, cards below. No rows → the same table (headers kept) with one `ไม่มีข้อมูล` row, and an
 * empty card frame on phones — every repair list, every role (CR-050), instead of a mascot panel.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, rowClassName, card, empty }: {
  caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** Phone / tablet card for one row. */
  card: (row: T) => ReactNode;
  empty?: EmptyInfo;
}) {
  const none = rows.length === 0;
  const message = <div role="status" className="flex flex-col items-center gap-1.5 text-center">
    <span aria-hidden className="mb-1 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" /></span>
    <p className="text-base font-semibold text-foreground">ไม่มีข้อมูล</p>
    {empty?.hint && <p className="text-sm text-muted-foreground">{empty.hint}</p>}
    {empty?.action && <div className="mt-2">{empty.action}</div>}
  </div>;
  return <>
    <table className="hidden w-full table-fixed border-collapse text-left lg:table">
      <caption className="sr-only">{caption}</caption>
      <thead className="border-y bg-muted/40 text-[13px] text-muted-foreground">
        <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn("px-3 py-3 font-medium first:pl-6 last:pr-6", c.className)}>{c.header}</th>)}</tr>
      </thead>
      {!none && <tbody className="divide-y">{rows.map((r) => <tr key={rowKey(r)} className={cn("align-middle transition-colors hover:bg-muted/40", rowClassName?.(r))}>
        {columns.map((c) => <td key={c.key} className={cn("px-3 py-3.5 first:pl-6 last:pr-6", c.className)}>{c.cell(r)}</td>)}
      </tr>)}</tbody>}
    </table>
    {/* One message for every width (e2e finds it once): under the headers from lg, an empty card frame below. */}
    {none && <div className="border-t bg-muted/25 p-3 sm:p-4 lg:border-t-0 lg:bg-transparent lg:p-0">
      <div className="rounded-xl border border-dashed bg-card px-4 py-8 lg:rounded-none lg:border-0 lg:py-10">{message}</div>
    </div>}
    {!none && <ul className="grid grid-cols-1 gap-2.5 border-t bg-muted/25 p-3 sm:p-4 lg:hidden">{rows.map((r) => <li key={rowKey(r)} className="min-w-0">{card(r)}</li>)}</ul>}
  </>;
}

/** The phone / tablet card frame; `highlight` = a row that needs the viewer (S06 ตรวจงาน). */
export function ListItemCard({ children, highlight, className }: { children: ReactNode; highlight?: boolean; className?: string }) {
  return <article className={cn("rounded-xl border bg-card p-3.5 shadow-xs", highlight && "border-l-3 border-l-attention bg-attention/4", className)}>{children}</article>;
}

export function ListFooter({ page, pageSize, total, unit, onPage }: { page: number; pageSize: number; total: number; unit: string; onPage: (p: number) => void }) {
  return <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 lg:px-6">
    <p className="text-[13px] text-muted-foreground">{pageRange(page, pageSize, total, unit)}</p>
    <Pager page={page} pages={Math.max(1, Math.ceil(total / pageSize))} onPage={onPage} className="ml-auto" />
  </footer>;
}

export function ListSkeleton({ label = "กำลังโหลด" }: { label?: string }) {
  return <div aria-label={label} aria-busy="true" className="divide-y border-t">
    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3.5 px-4 py-3.5 lg:px-6">
      <Skeleton className="size-9 rounded-lg" />
      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
      <Skeleton className="hidden h-5 w-28 rounded-[5px] sm:block" />
    </div>)}
  </div>;
}
