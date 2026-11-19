"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { useCurrentUser } from "@/components/shared/me-provider";
import { can, canReport, PERM } from "@/lib/platform/permissions";
import { ErrorState, ForbiddenState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMyTickets } from "../api";
import { errorCode } from "../errors";
import type { MyTicket, MyTicketPage, MyTicketsQuery, TicketSort } from "../types";
import { DataTable, ListCard, ListFooter, ListSkeleton, ListTabs, ListToolbar, type Column, type FilterDef } from "./list-ui";
import { OpenTicketLink, TicketCard, ticketColumns } from "./ticket-table";
import { autoCloseText } from "./ticket-progress";
import { CLOSED_LABELS, dayLabel, listDate, ticketHref } from "./ticket-presentation";
import { TicketLink } from "./ticket-navigation";
import { RepairHero } from "./repair-hero";

// S06 ติดตามงานซ่อม (CR-019, layout from bam-workplace-mascot-v4-refined.html): a hero card with the tracking
// mascot beside the แจ้งซ่อมใหม่ card, then one workspace card — relation tabs, search, status dropdown, sort,
// and one paged table with the category icon on every row. The API puts the reporter's own tickets awaiting the
// rating first (BR-F06-2); their row keeps the ตรวจงาน button. Contractor and other staff-side
// fields are left out on purpose; the priority pill shows since CR-052.
// CR-021 (layout from maintenance-demo.html, no stats row): the list card opens with its own heading row; leads
// also get บันทึกงานที่ทีมแก้แล้ว (locked team form) and the ทีมแก้เอง tab. CR-035: top row from repair-my-option-b.html.

type Option = { value: string; label: string };
const STATUSES: (Option & { query?: Pick<MyTicketsQuery, "status" | "step"> })[] = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "new", label: "รับเรื่องแล้ว", query: { step: ["awaiting_assessment"] } },
  { value: "doing", label: "กำลังดำเนินการ", query: { step: ["in_repair", "reworking"] } },
  { value: "review", label: "รอประเมินตรวจงาน", query: { status: ["resolved"] } },
  { value: "closed", label: "ปิดงานแล้ว", query: { status: ["closed"] } },
];
const SORTS: (Option & { sort?: TicketSort })[] = [
  { value: "updated", label: "อัปเดตล่าสุดก่อน" },
  { value: "newest", label: "แจ้งล่าสุดก่อน", sort: "createdAt:desc" },
  { value: "oldest", label: "แจ้งเก่าสุดก่อน", sort: "createdAt:asc" },
];
type Relation = { value: string; label: string; query: Pick<MyTicketsQuery, "relation" | "closedReason"> };
const RELATIONS: Relation[] = [
  { value: "all", label: "ทั้งหมด", query: { relation: "all" } },
  { value: "reported", label: "ที่ฉันแจ้ง", query: { relation: "reported" } },
  { value: "following", label: "ที่ฉันติดตาม", query: { relation: "following" } },
];
/** Leads only (CR-021): their records still closed as team handled — a handed-over one moves back to ที่ฉันแจ้ง. */
const TEAM_RELATION: Relation = { value: "team", label: "ทีมแก้เอง", query: { relation: "reported", closedReason: "team_handled" } };
/** Server-side paging (#35 page / pageSize): one page of slim rows per request, never the whole list. */
const PAGE_SIZE = 10;
const FOCUS_REFRESH_MS = 30_000;

type Change = (values: Record<string, string | null>, replace?: boolean) => void;
type Filters = { q: string; scope: string; status: string; sort: string; page: number };

const pick = (list: { value: string }[], value: string | null) => (list.some((o) => o.value === value) ? value! : list[0].value);

export function MyTicketsScreen() {
  const params = useSearchParams();
  const me = useCurrentUser();
  const lead = can(me, PERM.ticketTeamHandle);
  // settings CR-006: without `repair.ticket.report` there is no แจ้งซ่อมใหม่ (a lead keeps the team record)
  const reports = canReport(me);
  // F13-B: สแกน QR moved to the bottom tab bar (CR-040).
  const relations = lead ? [...RELATIONS, TEAM_RELATION] : RELATIONS;
  const q = (params.get("q") ?? "").slice(0, 50);
  const scope = pick(relations, params.get("scope"));
  const status = pick(STATUSES, params.get("status"));
  const sort = pick(SORTS, params.get("sort"));
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const [draft, setDraft] = useState({ query: q, value: q });
  if (draft.query !== q) setDraft({ query: q, value: q });
  const text = draft.query === q ? draft.value : q;
  // Every filter change starts again at page 1; filters and page live in the URL.
  const change: Change = useCallback((values, replace = false) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) { if (value === null || value === "") url.searchParams.delete(key); else url.searchParams.set(key, value); }
    if (!("page" in values)) url.searchParams.delete("page");
    url.searchParams.delete("range"); // CR-019 dropped the date-range filter
    const href = url.pathname + url.search;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }, []);
  useEffect(() => {
    if (text === q) return;
    const timer = window.setTimeout(() => change({ q: text }, true), 300);
    return () => window.clearTimeout(timer);
  }, [text, q, change]);
  const filters = { q, scope, status, sort, page };
  const reset = () => { setDraft({ query: q, value: "" }); change({ q: null, status: null, scope: null }); };

  // CR-046: the shared list layout — relation tabs, search + filter sheet (สถานะ), chips; CR-050: เรียงลำดับ is
  // its own button beside ตัวกรอง.
  const defs: FilterDef[] = [{ key: "status", label: "สถานะ", options: STATUSES }];
  const toolbar = <>
    <ListTabs label="งานที่แสดง" value={scope} tabs={relations.map((r) => ({ value: r.value, label: r.label }))} onChange={(v) => change({ scope: v === "all" ? null : v })} />
    <ListToolbar search={{ label: "ค้นหาเลขงาน หรือสถานที่", value: text, onChange: (v) => setDraft({ query: q, value: v }) }}
      sort={{ value: sort, options: SORTS, onChange: (v) => change({ sort: v === "updated" ? null : v }) }}
      filters={{ title: "ตัวกรองงานซ่อม", defs, values: { status }, onApply: (v) => change({ status: v.status === "all" ? null : v.status }) }} />
  </>;

  // CR-034: tracking belongs to reporting — #35 answers 403 without `repair.ticket.report`.
  if (!reports) return <ForbiddenState title="ไม่มีสิทธิ์ดูหน้านี้" />;

  return <div className="space-y-4 px-4 pt-3 pb-8 lg:space-y-5 lg:px-0 lg:pt-0">
    <nav aria-label="เส้นทางหน้า">
      <ol className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <li><Link href="/" className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">หน้าแรก</Link></li>
        <li aria-hidden><ChevronRight className="size-3.5" /></li>
        <li aria-current="page" className="text-foreground">ติดตามงานซ่อม</li>
      </ol>
    </nav>
    {/* CR-047: one hero banner from output/repair-hero/index.html (replaces the CR-035 mascot panel + navy card). */}
    <RepairHero lead={lead} />
    <Board key={`${q}|${scope}|${status}|${sort}|${page}`} filters={filters} relation={relations.find((r) => r.value === scope)!} onReset={reset} toolbar={toolbar} onPage={(p) => change({ page: p > 1 ? String(p) : null })} />
  </div>;
}

// ---- data: one page of the viewer's tickets ----

type Data = { revision: number; page?: MyTicketPage; at?: string; error?: unknown };

function useTicketPage(filters: Filters, relation: Relation) {
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Data>();
  const reload = useCallback(() => setRevision((r) => r + 1), []);
  const { q, scope, status, sort, page } = filters;
  // Also re-runs when a hidden route is shown again (cacheComponents), which refreshes the list.
  useEffect(() => {
    let active = true;
    const query: MyTicketsQuery = {
      ...relation.query, q: q || undefined, page, pageSize: PAGE_SIZE,
      sort: SORTS.find((s) => s.value === sort)?.sort, ...STATUSES.find((s) => s.value === status)?.query,
    };
    getMyTickets(query).then(
      (result) => { if (active) setData({ revision, page: result, at: new Date().toISOString() }); },
      (error: unknown) => { if (active) setData({ revision, error }); },
    );
    return () => { active = false; };
  }, [q, scope, status, sort, page, revision, relation]);
  useEffect(() => {
    // Refresh when the tab comes back, at most once per FOCUS_REFRESH_MS (only the current page is refetched).
    let last = Date.now();
    const onFocus = () => { if (Date.now() - last >= FOCUS_REFRESH_MS) { last = Date.now(); reload(); } };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
  // Skeleton on the first load and on retry after an error; focus refreshes keep the list on screen.
  const loading = !data || (data.revision !== revision && !!data.error);
  return { data, loading, reload };
}

type BoardProps = { filters: Filters; relation: Relation; onReset: () => void; toolbar: ReactNode; onPage: (page: number) => void };

function Board({ filters, relation, onReset, toolbar, onPage }: BoardProps) {
  const { data, loading, reload } = useTicketPage(filters, relation);
  const result = data?.page;
  const failure = !loading && data?.error !== undefined
    && (errorCode(data.error) === "FORBIDDEN" ? <ForbiddenState /> : <div className="px-4 py-6 lg:px-6"><ErrorState variant="inline" title="โหลดงานของคุณไม่สำเร็จ" onRetry={reload} /></div>);
  const ready = !loading && !failure && result;
  const total = result?.meta.total ?? 0;

  // CR-050: no tickets at all → the same list card and table with `ไม่มีข้อมูล` (no separate mascot panel);
  // แจ้งซ่อมใหม่ stays in the hero above.
  const teamEmpty = relation.value === "team" && !filters.q && filters.status === "all" && filters.page === 1;
  return <ListCard title="รายการงานซ่อม" count={ready ? total : undefined}
    meta={ready && data.at ? <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><span aria-hidden className="size-1.5 rounded-full bg-success" />อัปเดตล่าสุด {listDate(data.at)}</p> : undefined}>
    {toolbar}
    <div aria-busy={loading}>
      {loading ? <ListSkeleton label="กำลังโหลดงานซ่อม" /> : failure ? failure : ready && <>
          <DataTable caption="งานซ่อมของคุณ" rows={result.items} rowKey={(t) => t.id} columns={COLUMNS}
            empty={filters.page > 1 ? { hint: "ไม่มีงานในหน้านี้", action: <Button variant="outline" onClick={() => onPage(1)}><RotateCcw aria-hidden />กลับหน้าแรก</Button> }
              : teamEmpty ? { hint: "ยังไม่มีงานที่ทีมแก้เอง บันทึกได้จากปุ่มด้านบน" }
              : filters.q || filters.status !== "all" ? { hint: filters.q ? `ไม่พบงานที่ตรงกับ "${filters.q}"` : "ไม่พบงานตามตัวกรองนี้", action: <Button variant="outline" onClick={onReset}><RotateCcw aria-hidden />ล้างตัวกรอง</Button> }
              : { hint: relation.value === "following" ? "ยังไม่มีงานที่คุณติดตาม" : "ยังไม่มีงานที่คุณแจ้ง" }}
            rowClassName={(t) => t.awaitingMyConfirmation ? "bg-attention/4 [&>td:first-child]:border-l-3 [&>td:first-child]:border-l-attention" : undefined}
            card={(t) => { const due = dueText(t); return <TicketCard ticket={t} caption={statusCaption(t)} highlight={t.awaitingMyConfirmation} action={<OpenLink ticket={t} />}
              meta={<>{due.label} <span className={due.muted ? "" : "font-semibold text-foreground"}>{due.value}</span> · อัปเดต <time dateTime={t.updatedAt}>{listDate(t.updatedAt)}</time></>} />; }} />
          {result.items.length > 0 && <ListFooter page={filters.page} pageSize={PAGE_SIZE} total={total} unit="งาน" onPage={onPage} />}
        </>}
    </div>
  </ListCard>;
}

// ---- one ticket ----

/** Second line under the status: what the viewer is waiting for at this step. */
function statusCaption(ticket: MyTicket): ReactNode {
  switch (ticket.step) {
    case "awaiting_assessment": return "รอช่างกำหนดวันเสร็จ";
    case "in_repair": return "ช่างกำลังดำเนินการ";
    case "reworking": return "ช่างแก้ไขตามที่ส่งกลับ";
    case "awaiting_rating": return ticket.awaitingMyConfirmation ? (ticket.autoCloseAt ? autoCloseText(ticket.autoCloseAt) : "ตรวจผลซ่อมและให้คะแนน") : "รอผู้แจ้งประเมินตรวจงาน";
    default:
      // How it closed; the score itself lives on S07 (owner, 2026-10-19).
      if (ticket.closedReason === "confirmed" && ticket.rating) {
        return <>{CLOSED_LABELS.confirmed} · <span className="font-medium text-foreground tabular-nums">{ticket.rating}/5</span></>;
      }
      return ticket.closedReason ? CLOSED_LABELS[ticket.closedReason] : "";
  }
}

/** The date the viewer cares about at this step. A send back keeps the old date on the ticket, so it is not shown here. */
function dueText(ticket: MyTicket): { label: string; value: string; muted: boolean } {
  switch (ticket.step) {
    case "awaiting_assessment": return { label: "คาดว่าจะเสร็จ", value: "รอช่างกำหนด", muted: true };
    case "in_repair": return ticket.expectedDoneOn ? { label: "คาดว่าจะเสร็จ", value: dayLabel(ticket.expectedDoneOn, true), muted: false } : { label: "คาดว่าจะเสร็จ", value: "—", muted: true };
    case "reworking": return { label: "คาดว่าจะเสร็จ", value: "ดูวันใหม่ในรายละเอียด", muted: true };
    default: return ticket.resolvedAt ? { label: "ผลซ่อม", value: "ซ่อมเสร็จแล้ว", muted: false } : { label: "สถานะ", value: "ปิดงานแล้ว", muted: false };
  }
}

/** S06 never shows contractor or staff fields (S06 spec); priority shows since CR-052 (reverses CR-011 for this list). */
const titleNote = (t: MyTicket) => <>{t.closedReason === "team_handled" && " · ทีมแก้เอง"}{t.viewerRelation === "subscriber" && " · คุณติดตามเคสนี้"}</>;
const COLUMNS: Column<MyTicket>[] = [
  { ...ticketColumns.title<MyTicket>(titleNote), className: "w-[30%]" },
  { ...ticketColumns.place<MyTicket>(), className: "w-[17%]" },
  { ...ticketColumns.status<MyTicket>(statusCaption), className: "w-[18%]" },
  ticketColumns.priority<MyTicket>(),
  { key: "due", header: "กำหนด / อัปเดต", className: "w-[13%]", cell: (t) => { const due = dueText(t); return <>
    <span className={cn("block truncate text-sm leading-5", due.muted ? "text-muted-foreground" : "font-medium")}>{due.value}</span>
    <time dateTime={t.updatedAt} className="block text-xs leading-5 text-muted-foreground">อัปเดต {listDate(t.updatedAt)}</time>
  </>; } },
  ticketColumns.action<MyTicket>((t) => <OpenLink ticket={t} dense />, "รายละเอียด", "w-[12%] text-right"),
];

/** The reporter's awaiting ticket keeps the attention-coloured ตรวจงาน button; others get ดูงาน. */
function OpenLink({ ticket, dense }: { ticket: MyTicket; dense?: boolean }) {
  if (!ticket.awaitingMyConfirmation) return <OpenTicketLink ticket={ticket} dense={dense} />;
  return <Button asChild className={dense ? "h-9 px-3" : "h-11"}>
    <TicketLink href={ticketHref(ticket.id)} aria-label={`ตรวจงาน ${ticket.ticketNo}`}>ตรวจงาน<ChevronRight aria-hidden /></TicketLink>
  </Button>;
}
