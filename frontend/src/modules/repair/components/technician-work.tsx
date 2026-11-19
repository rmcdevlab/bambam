"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, RotateCcw, Wrench } from "lucide-react";
import { MascotPanel } from "@/components/shared/mascot";
import { ErrorState, ForbiddenState } from "@/components/shared/states";
import { useCurrentUser } from "@/components/shared/me-provider";
import { can, PERM } from "@/lib/platform/permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getBuildings, getCategories, getTicketCounts, getTickets } from "../api";
import { errorCode } from "../errors";
import { PRIORITIES, type Building, type Category, type Priority, type TicketCounts, type TicketCountsQuery, type TicketStep, type TicketSummary } from "../types";
import { DataTable, ListCard, ListFooter, ListSkeleton, ListTabs, ListToolbar, ResultBar, type FilterDef, type FilterValues } from "./list-ui";
import { OpenTicketLink, summaryRow, TicketCard, ticketColumns, type TicketRow } from "./ticket-table";
import { addDays, dayLabel, PRIORITY_LABELS, todayBangkok } from "./ticket-presentation";

// S09 งานซ่อม — the in-house technician sees every open ticket (CR-005, BR-F21-1), oldest report first (CR-015: no
// priority ordering; CR-049 lets the sheet flip it to newest first), 5 per page from #6 (CR-042). CR-046 (owner draft output/technician-ui/index.html): mascot hero
// with the step summary, the shared list layout (list-ui / ticket-table), search + filter sheet (อาคาร · หมวดงาน ·
// ความเร่งด่วน · ระยะเวลาที่แจ้ง), priority pill, ระยะเวลาที่แจ้ง with a clock; phones get cards.

type Tab = "assess" | "repair" | "rating";
const TABS: Record<Tab, { label: string; short?: string; hero: string; steps: TicketStep[]; count: (c: TicketCounts) => number; empty: string; tone: string }> = {
  assess: { label: "รับเรื่อง", hero: "รอเริ่มงาน", steps: ["awaiting_assessment"], count: (c) => c.awaitingAssessment, empty: "ไม่มีงานที่รอเริ่มดำเนินการ", tone: "text-status-new" },
  repair: { label: "กำลังดำเนินการ", short: "กำลังซ่อม", hero: "กำลังซ่อม", steps: ["in_repair", "reworking"], count: (c) => c.inRepair, empty: "ไม่มีงานที่กำลังดำเนินการ", tone: "text-status-in-progress" },
  rating: { label: "รอประเมินตรวจงาน", short: "รอตรวจงาน", hero: "รอตรวจงาน", steps: ["awaiting_rating"], count: (c) => c.resolved, empty: "ไม่มีงานที่รอผู้แจ้งประเมินตรวจงาน", tone: "text-status-resolved" },
};
const TAB_KEYS = Object.keys(TABS) as Tab[];
const PAGE_SIZE = 5;
const AGES = [{ value: "all", label: "ทั้งหมด" }, { value: "5", label: "5 วันขึ้นไป" }, { value: "7", label: "7 วันขึ้นไป" }];
const FILTER_KEYS = ["building", "category", "priority", "age"] as const;
// CR-049: order by report date, oldest first by default; `?sort=newest` flips it. CR-050: its own เรียงลำดับ button.
const SORTS = [{ value: "oldest", label: "งานเก่าสุดก่อน" }, { value: "newest", label: "งานใหม่สุดก่อน" }];
type Sort = "oldest" | "newest";

type Change = (values: Record<string, string | null>) => void;

export function TechnicianWorkScreen() {
  const me = useCurrentUser();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "repair" || params.get("tab") === "rating" ? (params.get("tab") as Tab) : "assess";
  const q = (params.get("q") ?? "").slice(0, 50);
  const values: FilterValues = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? "all"]));
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const sort: Sort = params.get("sort") === "newest" ? "newest" : "oldest";
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    getBuildings().then(setBuildings, () => setBuildings([]));
    getCategories().then(setCategories, () => setCategories([]));
  }, []);
  // Every filter change starts again at page 1; tab, search, filters and page live in the URL.
  const change: Change = useCallback((next) => {
    const url = new URL(window.location.href);
    if (!("page" in next)) url.searchParams.delete("page");
    for (const [k, v] of Object.entries(next)) { if (v === null || v === "" || v === "all") url.searchParams.delete(k); else url.searchParams.set(k, v); }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const [draft, setDraft] = useState({ query: q, value: q });
  if (draft.query !== q) setDraft({ query: q, value: q });
  const text = draft.query === q ? draft.value : q;
  useEffect(() => {
    if (text === q) return;
    const timer = window.setTimeout(() => change({ q: text.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [text, q, change]);

  if (!can(me, PERM.ticketWork)) return <ForbiddenState reason="หน้านี้สำหรับช่างเท่านั้น" />;
  const defs: FilterDef[] = [
    // CR-048: several buildings at once (`?building=a,b` → #6 / #7 `buildingId=a,b`).
    { key: "building", label: "อาคาร", multiple: true, options: [{ value: "all", label: "ทุกอาคาร" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))] },
    { key: "category", label: "หมวดงาน", options: [{ value: "all", label: "ทุกหมวดงาน" }, ...categories.map((c) => ({ value: c.id, label: c.name }))] },
    { key: "priority", label: "ความเร่งด่วน", options: [{ value: "all", label: "ทุกระดับ" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))] },
    { key: "age", label: "ระยะเวลาที่แจ้ง", options: AGES },
  ];
  const filtered = q !== "" || FILTER_KEYS.some((k) => values[k] !== "all");
  const reset = () => { setDraft({ query: q, value: "" }); change({ q: null, building: null, category: null, priority: null, age: null }); };
  const firstName = me.name.split(" ")[0];

  return <div className="space-y-4 px-4 pt-3 pb-8 lg:space-y-5 lg:px-0 lg:pt-0">
    <nav aria-label="เส้นทางหน้า">
      <ol className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <li><Link href="/" className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">หน้าแรก</Link></li>
        <li aria-hidden><ChevronRight className="size-3.5" /></li>
        <li aria-current="page" className="text-foreground">งานซ่อม</li>
      </ol>
    </nav>
    <Hero name={firstName} tab={tab} onTab={(t) => change({ tab: t === "assess" ? null : t })} />
    <Board tab={tab} q={q} values={values} sort={sort} page={page} filtered={filtered} onReset={reset} change={change}
      toolbar={<ListToolbar search={{ label: "ค้นหาเลขงาน หรือสถานที่", value: text, onChange: (v) => setDraft({ query: q, value: v }) }}
        sort={{ value: sort, options: SORTS, onChange: (v) => change({ sort: v === "newest" ? v : null }) }}
        filters={{ title: "ตัวกรองงานซ่อม", defs, values, onApply: (v) => change(v) }} />} />
  </div>;
}

/** Mascot panel + the open-work summary (every building, no filters); a tile opens its tab. */
function Hero({ name, tab, onTab }: { name: string; tab: Tab; onTab: (t: Tab) => void }) {
  const [counts, setCounts] = useState<TicketCounts>();
  useEffect(() => {
    let active = true;
    const load = () => getTicketCounts({ scope: "all" }).then((c) => { if (active) setCounts(c); }, () => undefined);
    load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, []);
  return <MascotPanel as="header" pose="guide" size={[96, 150]} priority className="min-h-44 lg:min-h-52"
    aside={<div className="rounded-xl bg-card p-3 text-foreground sm:w-80 sm:p-4">
      <p className="mb-2.5 text-sm font-semibold">ภาพรวมงานซ่อม</p>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {TAB_KEYS.map((t) => <button key={t} type="button" aria-pressed={tab === t} onClick={() => onTab(t)}
          className={cn("min-h-16 rounded-lg border px-1 py-2 text-center text-xs leading-5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
            tab === t ? "border-primary bg-secondary" : "bg-muted/40 hover:border-primary/40")}>
          <strong className={cn("block font-heading text-2xl leading-8 font-semibold tabular-nums", TABS[t].tone)}>{counts ? String(TABS[t].count(counts)).padStart(2, "0") : "–"}</strong>{TABS[t].hero}
        </button>)}
      </div>
    </div>}>
    <h1 className="text-2xl leading-9 font-semibold tracking-tight lg:text-[30px] lg:leading-11">งานซ่อม</h1>
    <p className="mt-1 text-sm leading-6 text-primary-foreground/88">สวัสดี คุณ{name}<span className="hidden sm:inline"> · ทุกงานที่ยังไม่ปิด จัดการได้ในที่เดียว</span></p>
    <span className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary-foreground/30 px-2.5 py-0.5 text-[13px]"><Wrench className="size-3.5" aria-hidden />ช่างเทคนิค</span>
  </MascotPanel>;
}

type BoardProps = { tab: Tab; q: string; values: FilterValues; sort: Sort; page: number; filtered: boolean; onReset: () => void; change: Change; toolbar: React.ReactNode };

function Board({ tab, q, values, sort, page, filtered, onReset, change, toolbar }: BoardProps) {
  const key = JSON.stringify({ tab, q, sort, page, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, values[k]])) });
  const [data, setData] = useState<{ key: string; counts?: TicketCounts; items?: TicketSummary[]; total?: number; error?: unknown }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const { tab, q, sort, page, building, category, priority, age } = JSON.parse(key) as { tab: Tab; q: string; sort: Sort; page: number } & Record<(typeof FILTER_KEYS)[number], string>;
    const base: TicketCountsQuery = {
      scope: "all", q: q || undefined,
      buildingId: building === "all" ? undefined : building,
      categoryId: category === "all" ? undefined : category,
      priority: priority === "all" ? undefined : (priority as Priority),
      // "n วันขึ้นไป" = reported on or before the end of (today − n), Asia/Bangkok (#6 createdTo is inclusive).
      createdTo: age === "all" ? undefined : new Date(`${addDays(todayBangkok(), -Number(age))}T23:59:59+07:00`).toISOString(),
    };
    Promise.all([
      getTicketCounts(base),
      getTickets({ ...base, step: TABS[tab].steps, sort: sort === "newest" ? "createdAt:desc" : "createdAt:asc", page, pageSize: PAGE_SIZE }),
    ]).then(([counts, list]) => { if (active) setData({ key, counts, items: list.items, total: list.meta.total }); },
      (error: unknown) => { if (active) setData((d) => ({ key, counts: d?.counts, error })); });
    return () => { active = false; };
  }, [key, revision]);
  useEffect(() => {
    const reload = () => setRevision((r) => r + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);
  // Tab counts stay on screen while the next page loads; the rows show a skeleton.
  const current = data?.key === key ? data : undefined;
  const ready = !!current?.items && current.error === undefined;
  const counts = data?.counts;
  const goTo = (p: number) => { change({ page: p > 1 ? String(p) : null }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const rows = (current?.items ?? []).map(summaryRow);
  const total = current?.total ?? 0;

  return <ListCard title="รายการงานซ่อม" count={ready ? total : undefined}>
    <ListTabs label="ขั้นของงาน" value={tab} fill onChange={(v) => change({ tab: v === "assess" ? null : v })}
      tabs={TAB_KEYS.map((t) => ({ value: t, label: TABS[t].label, short: TABS[t].short, count: counts ? TABS[t].count(counts) : undefined }))} />
    {toolbar}
    {ready && <ResultBar>พบ {total} งาน</ResultBar>}
    {current?.error !== undefined
      ? (errorCode(current.error) === "FORBIDDEN" ? <ForbiddenState /> : <div className="border-t px-4 py-6 lg:px-6"><ErrorState variant="inline" title="โหลดงานซ่อมไม่สำเร็จ" onRetry={() => setRevision((r) => r + 1)} /></div>)
      : !ready ? <ListSkeleton label="กำลังโหลดงานซ่อม" />
      : <>
        <DataTable caption="งานซ่อมที่ยังไม่ปิด" rows={rows} rowKey={(t) => t.id}
          empty={page > 1 ? { hint: "ไม่มีงานในหน้านี้", action: <Button variant="outline" onClick={() => goTo(1)}><RotateCcw aria-hidden />กลับหน้าแรก</Button> }
            : filtered ? { hint: q ? `ไม่พบงานที่ตรงกับ "${q}"` : "ไม่พบงานตามตัวกรองนี้", action: <Button variant="outline" onClick={onReset}><RotateCcw aria-hidden />ล้างตัวกรอง</Button> }
            : { hint: TABS[tab].empty }}
          columns={[ticketColumns.title(), ticketColumns.place(), ticketColumns.status(caption), ticketColumns.elapsed(), ticketColumns.priority(),
            ticketColumns.action((t) => <OpenTicketLink ticket={t} dense />, "รายละเอียด", "w-[10%] text-right")]}
          card={(t) => <TicketCard ticket={t} caption={caption(t)} action={<OpenTicketLink ticket={t} />} />} />
        {rows.length > 0 && <ListFooter page={page} pageSize={PAGE_SIZE} total={total} unit="งาน" onPage={goTo} />}
      </>}
  </ListCard>;
}

/** What happens at this step for the technician (owner draft), with the promised date while repairing. */
function caption(t: TicketRow & TicketSummary) {
  switch (t.step) {
    case "awaiting_assessment": return "รอเริ่มดำเนินการ";
    case "awaiting_rating": return "ซ่อมเสร็จ รอผู้แจ้งตรวจงาน";
    default: {
      if (!t.expectedDoneOn) return t.step === "reworking" ? "แก้ไขตามที่ส่งกลับ" : "ช่างกำลังดำเนินการซ่อม";
      const late = t.expectedDoneOn < todayBangkok();
      return <span className={cn(late && "font-semibold text-destructive")}>{late ? "เลยกำหนด" : "คาดว่าเสร็จ"} {dayLabel(t.expectedDoneOn)}</span>;
    }
  }
}
