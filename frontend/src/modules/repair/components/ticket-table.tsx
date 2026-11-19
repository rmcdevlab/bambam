"use client";

import type { ReactNode } from "react";
import { ChevronRight, Clock } from "lucide-react";
import { PriorityBadge } from "@/components/shared/priority-indicator";
import { cn } from "@/lib/utils";
import type { Priority, TicketSummary } from "../types";
import { CategoryTile } from "./category-icon";
import type { Column } from "./list-ui";
import { ListItemCard } from "./list-ui";
import { TicketLink } from "./ticket-navigation";
import { categoryName, placeLine, shortDate, STEP, stepLabel, ticketHref, ticketTitle, todayBangkok } from "./ticket-presentation";

// CR-046 — the cells every repair ticket list shares (S09, S11, S06): title + ticket no + category, place, step
// badge + caption, ระยะเวลาที่แจ้ง (clock, old reports stand out), priority pill (as on S07) and the open link.
// Pages pick the columns; S06 never shows priority or staff fields (S06 spec).

/** The fields a ticket row needs — both #6 rows (`TicketSummary`) and #35 rows (`MyTicket`) fit. */
export type TicketRow = Pick<TicketSummary, "id" | "ticketNo" | "step" | "closedReason" | "category" | "categoryOther" | "building" | "floor" | "room" | "locationDetail" | "awaitingMyConfirmation"> & {
  title: string;
  priority?: Priority;
  createdAt?: string;
};

export const summaryRow = <T extends TicketSummary>(t: T): T & TicketRow => ({ ...t, title: ticketTitle(t) });

// ---- ระยะเวลาที่แจ้ง ----

/** From this many days the report is shown in warning colour; from AGE_OLD it becomes a solid tag (`ค้างนาน`). */
export const AGE_WARN = 3;
export const AGE_OLD = 5;

/** Calendar days (Asia/Bangkok) since the report. */
export function daysSince(iso: string, now = new Date()) {
  const day = (d: Date) => Date.parse(`${todayBangkok(d)}T00:00:00Z`);
  return Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86_400_000));
}

export function Elapsed({ createdAt, inline = false }: { createdAt: string; inline?: boolean }) {
  const days = daysSince(createdAt);
  const old = days >= AGE_OLD;
  const text = days === 0 ? "แจ้งวันนี้" : old ? `${days} วัน · ค้างนาน` : `${days} วันผ่านมาแล้ว`;
  const tag = <span className={cn("inline-flex items-center gap-1.5 text-sm leading-6 font-medium whitespace-nowrap tabular-nums",
    old ? "rounded-md bg-warning px-2 font-semibold text-white" : days >= AGE_WARN ? "font-semibold text-warning" : "text-foreground")}>
    <Clock className={cn("size-4 shrink-0", !old && days < AGE_WARN && "text-muted-foreground")} aria-hidden />{text}
  </span>;
  if (inline) return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">{tag}<span className="text-xs text-muted-foreground">แจ้งเมื่อ {shortDate(createdAt, true)}</span></span>;
  return <><span className="block">{tag}</span><time dateTime={createdAt} className="mt-0.5 block text-xs leading-5 text-muted-foreground">แจ้งเมื่อ {shortDate(createdAt, true)}</time></>;
}

// ---- cells ----

export function StepBadge({ ticket }: { ticket: Pick<TicketRow, "step" | "awaitingMyConfirmation"> }) {
  const mine = ticket.awaitingMyConfirmation;
  return <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-[5px] px-2 py-px text-xs leading-5 font-semibold", mine ? "bg-attention/10 text-attention" : STEP[ticket.step].color)}>
    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /><span className="truncate">{stepLabel(ticket)}</span>
  </span>;
}

export function TicketStatus({ ticket, caption }: { ticket: TicketRow; caption?: ReactNode }) {
  return <><StepBadge ticket={ticket} />{caption && <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">{caption}</span>}</>;
}

export function TicketPlace({ ticket }: { ticket: TicketRow }) {
  return <>
    <span className="block truncate text-sm">{ticket.building.name}</span>
    <span className="block truncate text-[13px] text-muted-foreground">{placeLine(ticket)}</span>
  </>;
}

/** Category tile + title link (one line on desktop, full text on hover) over `{ticket no} · {category}{note}`. */
export function TicketTitle({ ticket, compact, note }: { ticket: TicketRow; compact?: boolean; note?: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-3.5">
    {compact && <CategoryTile icon={ticket.category?.icon} />}
    <div className="min-w-0">
      <TicketLink href={ticketHref(ticket.id)} title={compact ? ticket.title : undefined}
        className={cn("block text-[15px] leading-6 font-semibold outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/30", compact ? "truncate" : "line-clamp-2")}>{ticket.title}</TicketLink>
      <span className="block truncate text-xs leading-5 text-muted-foreground"><span className="tracking-wide">{ticket.ticketNo}</span> · {categoryName(ticket)}{note}</span>
    </div>
  </div>;
}

/** `ดูงาน ›` — bordered, ≥ 44px on touch; `dense` for desktop rows. */
export function OpenTicketLink({ ticket, dense, className }: { ticket: TicketRow; dense?: boolean; className?: string }) {
  return <TicketLink href={ticketHref(ticket.id)} aria-label={`ดูงาน ${ticket.ticketNo}`}
    className={cn("inline-flex items-center gap-0.5 rounded-lg border bg-card pr-2 pl-3 text-sm font-medium whitespace-nowrap text-primary outline-none hover:border-primary/40 hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30", dense ? "h-9" : "h-11", className)}>
    ดูงาน<ChevronRight className="size-4" aria-hidden />
  </TicketLink>;
}

// ---- columns ----

export const ticketColumns = {
  title: <T extends TicketRow>(note?: (t: T) => ReactNode): Column<T> => ({ key: "title", header: "เรื่องที่แจ้ง / เลขที่งาน", className: "w-[30%]", cell: (t) => <TicketTitle ticket={t} compact note={note?.(t)} /> }),
  place: <T extends TicketRow>(): Column<T> => ({ key: "place", header: "สถานที่", className: "w-[17%]", cell: (t) => <TicketPlace ticket={t} /> }),
  status: <T extends TicketRow>(caption: (t: T) => ReactNode): Column<T> => ({ key: "status", header: "สถานะล่าสุด", className: "w-[19%]", cell: (t) => <TicketStatus ticket={t} caption={caption(t)} /> }),
  elapsed: <T extends TicketRow>(): Column<T> => ({ key: "elapsed", header: "ระยะเวลาที่แจ้ง", className: "w-[16%]", cell: (t) => t.createdAt ? <Elapsed createdAt={t.createdAt} /> : null }),
  priority: <T extends TicketRow>(): Column<T> => ({ key: "priority", header: "ความเร่งด่วน", className: "w-[10%]", cell: (t) => t.priority ? <PriorityBadge priority={t.priority} /> : null }),
  action: <T extends TicketRow>(render: (t: T) => ReactNode, header = "รายละเอียด", className = "w-[8%] text-right"): Column<T> => ({ key: "action", header, className, cell: render }),
};

// ---- phone / tablet card ----

/**
 * One ticket on phones / tablets (owner draft): ticket no + priority pill · title · place · category ·
 * ระยะเวลาที่แจ้ง, then step badge + caption beside the action.
 */
export function TicketCard({ ticket, caption, meta, action, highlight }: {
  ticket: TicketRow; caption?: ReactNode; meta?: ReactNode; action: ReactNode; highlight?: boolean;
}) {
  return <ListItemCard highlight={highlight}>
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-xs font-medium tracking-wide text-muted-foreground">{ticket.ticketNo}</span>
      {ticket.priority && <PriorityBadge priority={ticket.priority} className="text-xs" />}
    </div>
    <div className="mt-1.5 flex gap-3">
      <CategoryTile icon={ticket.category?.icon} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <TicketLink href={ticketHref(ticket.id)} className="line-clamp-2 text-base leading-6 font-semibold outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/30">{ticket.title}</TicketLink>
        <p className="text-sm leading-6">{ticket.building.name} · {placeLine(ticket)}</p>
        <p className="text-xs leading-5 text-muted-foreground">{categoryName(ticket)}</p>
        {ticket.createdAt && <div className="mt-1.5"><Elapsed createdAt={ticket.createdAt} inline /></div>}
        {meta && <div className="mt-1 text-xs leading-5 text-muted-foreground">{meta}</div>}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3">
      <div className="min-w-0 flex-1 basis-36"><TicketStatus ticket={ticket} caption={caption} /></div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
    </div>
  </ListItemCard>;
}
