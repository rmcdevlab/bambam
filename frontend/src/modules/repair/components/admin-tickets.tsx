"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleX, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, ForbiddenState } from "@/components/shared/states";
import { useCurrentUser } from "@/components/shared/me-provider";
import { can, PERM, seesRepairQueue } from "@/lib/platform/permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getBuildings, getCategories, getTicketCounts, getTickets } from "../api";
import { errorCode } from "../errors";
import { CLOSED_REASONS, PRIORITIES, type Building, type Category, type ClosedReason, type Priority, type TicketCounts, type TicketCountsQuery, type TicketSort, type TicketStep, type TicketSummary } from "../types";
import { DataTable, ListCard, ListFooter, ListSkeleton, ListTabs, ListToolbar, ResultBar, type Column, type FilterDef } from "./list-ui";
import { CloseTicketDialog, CLOSED_TOAST, HandoverDialog } from "./ticket-actions";
import { autoCloseText } from "./ticket-progress";
import { OpenTicketLink, summaryRow, TicketCard, ticketColumns, type TicketRow } from "./ticket-table";
import { addDays, CLOSED_LABELS, dayLabel, listDate, PRIORITY_LABELS, todayBangkok } from "./ticket-presentation";

// S11 งานทั้งหมด (Stage 3 re-spec, CR-005 + CR-015): repair managers (D-050) see every ticket by step, filter by
// category / building / priority (information only) / closed reason, search by ticket no or place. Open tabs list
// the oldest report first (BR-F22-1); closed lists the newest closed first. `close_any` closes an open ticket
// (F08-B), `handover_any` hands a team job over (F05) — permissions, not role names (CR-007 A).
// CR-046: the S09 list layout (list-ui / ticket-table) — same columns, priority pill, ระยะเวลาที่แจ้ง with a clock,
// filters in the sheet (+ ระยะเวลาที่แจ้ง on open tabs, เหตุผลที่ปิด incl. ทีมดำเนินการเอง on the closed tab), cards
// below `lg`. Per-tab facts (ผู้แจ้ง / ผู้ซ่อม / คาดว่าจะเสร็จ / ส่งกลับ / ปิดอัตโนมัติ / เหตุผล / คะแนน) sit under the status.
// CR-054: its own เรียงลำดับ button beside ตัวกรอง (as S09 / S06, CR-050); the first option of each list is the default.

type Tab = "assess" | "repair" | "rating" | "closed";
const TABS: Record<Tab, { label: string; short?: string; steps: TicketStep[]; count: (c: TicketCounts) => number; empty: string }> = {
  assess: { label: "รับเรื่อง", steps: ["awaiting_assessment"], count: (c) => c.awaitingAssessment, empty: "ไม่มีงานที่รอช่างเริ่มดำเนินการ" },
  repair: { label: "กำลังดำเนินการ", short: "กำลังซ่อม", steps: ["in_repair", "reworking"], count: (c) => c.inRepair, empty: "ไม่มีงานที่ช่างกำลังดำเนินการ" },
  rating: { label: "รอประเมินตรวจงาน", short: "รอตรวจงาน", steps: ["awaiting_rating"], count: (c) => c.resolved, empty: "ไม่มีงานที่รอผู้แจ้งประเมินตรวจงาน" },
  closed: { label: "ปิดแล้ว", steps: ["closed"], count: (c) => c.closed, empty: "ยังไม่มีงานที่ปิดแล้ว" },
};
const TAB_KEYS = Object.keys(TABS) as Tab[];
const PAGE_SIZE = 20;
const AGES = [{ value: "all", label: "ทั้งหมด" }, { value: "5", label: "5 วันขึ้นไป" }, { value: "7", label: "7 วันขึ้นไป" }];
const FILTER_KEYS = ["category", "building", "priority", "age", "reason"] as const;
type SortOption = { value: string; label: string; sort: TicketSort };
const OPEN_SORTS: SortOption[] = [{ value: "oldest", label: "งานเก่าสุดก่อน", sort: "createdAt:asc" }, { value: "newest", label: "งานใหม่สุดก่อน", sort: "createdAt:desc" }];
const CLOSED_SORTS: SortOption[] = [
  { value: "closed", label: "ปิดล่าสุดก่อน", sort: "closedAt:desc" },
  { value: "newest", label: "แจ้งล่าสุดก่อน", sort: "createdAt:desc" },
  { value: "oldest", label: "แจ้งเก่าสุดก่อน", sort: "createdAt:asc" },
];
const sortsOf = (tab: Tab) => (tab === "closed" ? CLOSED_SORTS : OPEN_SORTS);
type FilterKey = (typeof FILTER_KEYS)[number];

type Change = (values: Record<string, string | null>) => void;

const oneOf = <T extends string>(list: readonly T[], value: string | null, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);

export function AdminTicketsScreen() {
  const me = useCurrentUser();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").slice(0, 50);
  const tab = oneOf(TAB_KEYS, params.get("tab"), "assess");
  const values: Record<FilterKey, string> = {
    category: params.get("category") ?? "all",
    building: params.get("building") ?? "all",
    priority: oneOf(["all", ...PRIORITIES], params.get("priority"), "all"),
    age: tab === "closed" ? "all" : oneOf(["all", "5", "7"], params.get("age"), "all"),
    reason: tab === "closed" ? oneOf(["all", ...CLOSED_REASONS], params.get("reason"), "all") : "all",
  };
  const sorts = sortsOf(tab);
  const sort = sorts.find((s) => s.value === params.get("sort")) ?? sorts[0];
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const [draft, setDraft] = useState({ query: q, value: q });
  if (draft.query !== q) setDraft({ query: q, value: q });
  const text = draft.query === q ? draft.value : q;
  const [categories, setCategories] = useState<Category[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  useEffect(() => {
    getCategories().then(setCategories, () => setCategories([]));
    getBuildings().then(setBuildings, () => setBuildings([]));
  }, []);
  // Every filter change starts again at page 1; tab / filters / search / page live in the URL.
  const change: Change = useCallback((next) => {
    const url = new URL(window.location.href);
    if (!("page" in next)) url.searchParams.delete("page");
    for (const [k, v] of Object.entries(next)) { if (v === null || v === "" || v === "all") url.searchParams.delete(k); else url.searchParams.set(k, v); }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  useEffect(() => {
    if (text === q) return;
    const timer = window.setTimeout(() => change({ q: text.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [text, q, change]);

  if (!seesRepairQueue(me)) {
    return <><PageHeader title="งานทั้งหมด" variant="bar" /><ForbiddenState reason="หน้านี้สำหรับ Admin เท่านั้น" /></>;
  }
  const allow = { close: can(me, PERM.ticketCloseAny), handover: can(me, PERM.ticketHandoverAny) };
  const defs: FilterDef[] = [
    { key: "building", label: "อาคาร", options: [{ value: "all", label: "ทุกอาคาร" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))] },
    { key: "category", label: "หมวดงาน", options: [{ value: "all", label: "ทุกหมวดงาน" }, ...categories.map((c) => ({ value: c.id, label: c.name }))] },
    { key: "priority", label: "ความเร่งด่วน", options: [{ value: "all", label: "ทุกระดับ" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))] },
    ...(tab === "closed"
      ? [{ key: "reason", label: "เหตุผลที่ปิด", options: [{ value: "all", label: "ทุกเหตุผล" }, ...CLOSED_REASONS.map((r) => ({ value: r, label: CLOSED_LABELS[r] }))] }]
      : [{ key: "age", label: "ระยะเวลาที่แจ้ง", options: AGES }]),
  ];
  const filtered = q !== "" || FILTER_KEYS.some((k) => values[k] !== "all");
  const reset = () => { setDraft({ query: q, value: "" }); change({ q: null, category: null, building: null, priority: null, age: null, reason: null }); };

  return <>
    <PageHeader title="งานทั้งหมด" variant="service" service="repair" subtitle="ทุกงานแจ้งซ่อม ค้นหา กรอง และเรียงลำดับได้" />
    <div className="px-4 py-4 lg:px-0 lg:py-0">
      <Board tab={tab} q={q} values={values} sort={sort} page={page} allow={allow} filtered={filtered} change={change} reset={reset}
        toolbar={<ListToolbar search={{ label: "ค้นหาเลขงาน หรือสถานที่", value: text, onChange: (v) => setDraft({ query: q, value: v }) }}
          sort={{ value: sort.value, options: sorts, onChange: (v) => change({ sort: v === sorts[0].value ? null : v }) }}
          filters={{ title: "ตัวกรองงานทั้งหมด", defs, values, onApply: (v) => change(v) }} />} />
    </div>
  </>;
}

/** A table row: the shared ticket cells + the #6 row for the per-tab facts and the actions. */
type Row = TicketRow & { src: TicketSummary };

type BoardProps = {
  tab: Tab; q: string; values: Record<FilterKey, string>; sort: SortOption; page: number; allow: { close: boolean; handover: boolean };
  filtered: boolean; change: Change; reset: () => void; toolbar: ReactNode;
};

function Board({ tab, q, values, sort, page, allow, filtered, change, reset, toolbar }: BoardProps) {
  const key = JSON.stringify({ tab, q, page, sort: sort.sort, ...values });
  const [data, setData] = useState<{ key: string; counts?: TicketCounts; items?: TicketSummary[]; total?: number; error?: unknown }>();
  const [revision, setRevision] = useState(0);
  const [closing, setClosing] = useState<TicketSummary | null>(null);
  const [handingOver, setHandingOver] = useState<TicketSummary | null>(null);
  useEffect(() => {
    let active = true;
    const f = JSON.parse(key) as { tab: Tab; q: string; page: number; sort: TicketSort } & Record<FilterKey, string>;
    const base: TicketCountsQuery = {
      scope: "all",
      q: f.q || undefined,
      categoryId: f.category === "all" ? undefined : f.category,
      buildingId: f.building === "all" ? undefined : f.building,
      priority: f.priority === "all" ? undefined : (f.priority as Priority),
    };
    // Open tabs: "n วันขึ้นไป" = reported on or before the end of (today − n), Asia/Bangkok (#6 createdTo is inclusive).
    const createdTo = f.age === "all" ? undefined : new Date(`${addDays(todayBangkok(), -Number(f.age))}T23:59:59+07:00`).toISOString();
    Promise.all([
      getTicketCounts({ ...base, createdTo }),
      getTickets({
        ...base, createdTo, step: TABS[f.tab].steps, page: f.page, pageSize: PAGE_SIZE,
        closedReason: f.tab === "closed" && f.reason !== "all" ? (f.reason as ClosedReason) : undefined,
        sort: f.sort,
      }),
    ]).then(([counts, list]) => { if (active) setData({ key, counts, items: list.items, total: list.meta.total }); },
      (error: unknown) => { if (active) setData((d) => ({ key, counts: d?.counts, error })); });
    return () => { active = false; };
  }, [key, revision]);
  useEffect(() => {
    const reload = () => setRevision((r) => r + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  const current = data?.key === key ? data : undefined;
  const ready = !!current?.items && current.error === undefined;
  const counts = data?.counts;
  const total = current?.total ?? 0;
  const canClose = allow.close && tab !== "closed";
  const open = tab !== "closed";
  // Priority is information only on the open work tabs (as before); closed rows show when they closed instead.
  const rows: Row[] = (current?.items ?? []).map((t) => ({ ...summaryRow(t), priority: tab === "assess" || tab === "repair" ? t.priority : undefined, createdAt: open ? t.createdAt : undefined, src: t }));
  const actions = (t: TicketSummary, dense: boolean) => <>
    {canClose && <Button type="button" variant="ghost" size={dense ? "sm" : "default"} onClick={() => setClosing(t)} aria-label={`ปิดงาน ${t.ticketNo}`}
      className={cn("text-destructive hover:bg-destructive/5 hover:text-destructive", !dense && "h-11")}><CircleX aria-hidden />ปิดงาน</Button>}
    {allow.handover && t.closedReason === "team_handled" && <Button type="button" variant="outline" size={dense ? "sm" : "default"} className={cn(!dense && "h-11")} onClick={() => setHandingOver(t)}>ส่งต่อให้ช่าง</Button>}
  </>;
  const goTo = (p: number) => { change({ page: p > 1 ? String(p) : null }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const columns: Column<Row>[] = [
    { ...ticketColumns.title<Row>(), className: "w-[26%]" }, { ...ticketColumns.place<Row>(), className: "w-[15%]" }, ticketColumns.status<Row>((t) => caption(tab, t.src)),
    open ? ticketColumns.elapsed<Row>()
      : { key: "closedAt", header: "ปิดเมื่อ", className: "w-[14%]", cell: (t) => <span className="text-sm">{t.src.closedAt ? listDate(t.src.closedAt) : "–"}</span> },
    ...(tab === "assess" || tab === "repair" ? [ticketColumns.priority<Row>()] : []),
    ticketColumns.action<Row>((t) => <div className="flex items-center justify-end gap-1">{actions(t.src, true)}<OpenTicketLink ticket={t} dense /></div>, "จัดการงาน", "w-[20%] text-right"),
  ];

  return <>
    <ListCard title="งานแจ้งซ่อม" count={ready ? total : undefined}>
      <ListTabs label="ขั้นของงาน" value={tab} fill onChange={(v) => change({ tab: v === "assess" ? null : v, reason: null, age: null, sort: null })}
        tabs={TAB_KEYS.map((t) => ({ value: t, label: TABS[t].label, short: TABS[t].short, count: counts && t !== "closed" ? TABS[t].count(counts) : undefined }))} />
      {toolbar}
      {ready && <ResultBar>พบ {total} งาน</ResultBar>}
      {current?.error !== undefined
        ? (errorCode(current.error) === "FORBIDDEN" ? <ForbiddenState /> : <div className="border-t px-4 py-6 lg:px-6"><ErrorState variant="inline" title="โหลดงานทั้งหมดไม่สำเร็จ" onRetry={() => setRevision((r) => r + 1)} /></div>)
        : !ready ? <ListSkeleton label="กำลังโหลดงาน" />
        : <>
          <DataTable caption="งานแจ้งซ่อมทั้งหมด" rows={rows} rowKey={(t) => t.id} columns={columns}
            empty={page > 1 ? { hint: "ไม่มีงานในหน้านี้", action: <Button variant="outline" onClick={() => goTo(1)}><RotateCcw aria-hidden />กลับหน้าแรก</Button> }
              : filtered ? { hint: q ? `ไม่พบงานที่ตรงกับ "${q}"` : "ไม่พบงานตามตัวกรองนี้", action: <Button variant="outline" onClick={reset}><RotateCcw aria-hidden />ล้างตัวกรอง</Button> }
              : { hint: TABS[tab].empty }}
            card={(t) => <TicketCard ticket={t} caption={caption(tab, t.src)} meta={!open && t.src.closedAt ? `ปิดเมื่อ ${listDate(t.src.closedAt)}` : undefined}
              action={<>{actions(t.src, false)}<OpenTicketLink ticket={t} /></>} />} />
          {rows.length > 0 && <ListFooter page={page} pageSize={PAGE_SIZE} total={total} unit="งาน" onPage={goTo} />}
        </>}
    </ListCard>
    {closing && <CloseTicketDialog ticket={closing} open onOpenChange={(o) => { if (!o) setClosing(null); }}
      onDone={() => { setClosing(null); toast.success(CLOSED_TOAST); setRevision((r) => r + 1); }} />}
    {handingOver && <HandoverDialog ticket={handingOver} open onOpenChange={(o) => { if (!o) setHandingOver(null); }}
      onDone={() => { setHandingOver(null); toast.success("ส่งต่อให้ช่างแล้ว"); setRevision((r) => r + 1); }}
      onStale={() => { setHandingOver(null); setRevision((r) => r + 1); }} />}
  </>;
}

/** The per-tab facts the old table columns held (ผู้แจ้ง · ผู้ซ่อม · คาดว่าจะเสร็จ · ส่งกลับ · ปิดอัตโนมัติ · เหตุผล · คะแนน). */
function caption(tab: Tab, t: TicketSummary): ReactNode {
  const fixer = t.technician?.name;
  switch (tab) {
    case "assess": return `ผู้แจ้ง ${t.reporter.name}`;
    case "repair": {
      const late = !!t.expectedDoneOn && t.expectedDoneOn < todayBangkok();
      return <>
        {fixer && <span className="block truncate">ผู้ซ่อม {fixer}</span>}
        {t.expectedDoneOn && <span className={cn("block truncate", late && "font-semibold text-destructive")}>{late ? "เลยกำหนด" : "คาดว่าเสร็จ"} {dayLabel(t.expectedDoneOn)}{t.sendBackCount > 0 && <span className="font-normal text-muted-foreground"> · ส่งกลับ {t.sendBackCount} ครั้ง</span>}</span>}
      </>;
    }
    case "rating": return <>
      {fixer && <span className="block truncate">ผู้ซ่อม {fixer}</span>}
      {t.autoCloseAt && <span className="block truncate">{autoCloseText(t.autoCloseAt)}</span>}
    </>;
    case "closed": return [t.closedReason ? CLOSED_LABELS[t.closedReason] : null, t.rating ? `★ ${t.rating}` : null].filter(Boolean).join(" · ");
  }
}
