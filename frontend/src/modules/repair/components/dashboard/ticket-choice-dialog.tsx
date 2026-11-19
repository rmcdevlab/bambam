"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Box, ChevronRight, FileText, ListChecks, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TicketSummary } from "../../types";
import { floorLabel, placeLine, ticketHref, ticketTitle } from "../ticket-presentation";
import { attentionBadge, type AttentionTone } from "./dashboard-ui";

// CR-055 amendment 1 (owner 2026-11-18): the S29 hero buttons open a popup instead of leaving the page.
// - `ดู Ticket นี้` → one ticket: `ดูรายละเอียดงาน` (S07) or `ดูที่โมเดล` (scroll to the building card, open its floor,
//   light the room).
// - `ควรติดตาม n งาน` → the #27 attention list (≤ 5), each row with `รายละเอียด` and `ดูที่โมเดล`, + `ดูรายการงานทั้งหมด` → S11.
// `ดูที่โมเดล` reads `ดูที่แปลนชั้น` where the page shows the floor list instead of the 3D model (phones, no model).

export type TicketChoice = { kind: "ticket"; ticket: TicketSummary } | { kind: "list"; tickets: TicketSummary[] };

type Props = {
  choice: TicketChoice | null;
  onClose: () => void;
  onShowOnModel: (ticket: TicketSummary) => void;
  /** The label of the model action for this ticket, or null when its building is not on S29 (no floors). */
  modelLabel: (ticket: TicketSummary) => string | null;
  queueHref: string;
};

const TONE: Record<AttentionTone, string> = {
  critical: "bg-priority-critical/10 text-priority-critical",
  attention: "bg-attention/10 text-attention",
};

function Badge({ ticket }: { ticket: TicketSummary }) {
  const b = attentionBadge(ticket);
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", TONE[b.tone])}><span aria-hidden className="size-1.5 rounded-full bg-current" />{b.label}</span>;
}

const place = (t: TicketSummary) => `${t.building.name} · ${placeLine(t)}`;

export function TicketChoiceDialog({ choice, onClose, onShowOnModel, modelLabel, queueHref }: Props) {
  // going to the model: the page scrolls to the building card, so focus must not jump back to the hero button
  const toModel = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const showOnModel = (t: TicketSummary) => { toModel.current = true; onShowOnModel(t); };
  return <Dialog open={!!choice} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent showCloseButton={false} className={cn("s29-dialog", "gap-0 p-0 sm:max-w-xl")}
      onOpenAutoFocus={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        if (toModel.current) toModel.current = false;
        else trigger.current?.focus({ preventScroll: true });
      }}>
      <DialogClose asChild><Button variant="ghost" size="icon" className={"s29-close"} aria-label="ปิดหน้าต่าง"><X aria-hidden /></Button></DialogClose>
      {choice?.kind === "ticket" && <OneTicket ticket={choice.ticket} onShowOnModel={showOnModel} modelLabel={modelLabel(choice.ticket)} />}
      {choice?.kind === "list" && <TicketList tickets={choice.tickets} onShowOnModel={showOnModel} modelLabel={modelLabel} queueHref={queueHref} />}
    </DialogContent>
  </Dialog>;
}

function OneTicket({ ticket, onShowOnModel, modelLabel }: { ticket: TicketSummary; onShowOnModel: (t: TicketSummary) => void; modelLabel: string | null }) {
  return <>
    <DialogHeader className={cn("s29-dialogHeader", "text-left")}>
      <span className={"s29-dialogEyebrow"}><FileText aria-hidden />TICKET OVERVIEW</span>
      <DialogTitle className="text-xl font-semibold">ดูแลงานนี้ต่อ</DialogTitle>
      <DialogDescription>เลือกดูรายละเอียด หรือไปยังตำแหน่งที่แจ้งซ่อม</DialogDescription>
    </DialogHeader>
    <div className={"s29-dialogBody"}>
      <section className={"s29-ticketSummary"} aria-label="ข้อมูล Ticket">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge ticket={ticket} />
        <span className="text-xs text-muted-foreground tabular-nums">{ticket.ticketNo}</span>
      </div>
      <h3 className="mt-3 text-base leading-relaxed font-semibold">{ticketTitle(ticket)}</h3>
      <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />{place(ticket)}</p>
      </section>
      <p className="text-xs font-medium text-muted-foreground">เลือกสิ่งที่ต้องการดู</p>
      <ChoiceLink href={ticketHref(ticket.id)} icon={FileText} title="ดูรายละเอียดงาน" sub="ขั้นตอน รูปภาพ และความคืบหน้าของงาน" />
      {modelLabel && <ChoiceButton onClick={() => onShowOnModel(ticket)} icon={Box} title={modelLabel}
        sub={`ไปที่${ticket.building.name} ${floorLabel(ticket.floor.name)}${ticket.room ? ` แล้วชี้${ticket.room.name}ให้ดู` : ""}`} />}
    </div>
  </>;
}

const choiceClass = "group flex min-h-20 w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left outline-none transition duration-200 hover:border-primary/50 hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/40 motion-safe:hover:-translate-y-0.5";

function ChoiceInner({ icon: Icon, title, sub }: { icon: typeof FileText; title: string; sub: string }) {
  return <>
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Icon className="size-5" /></span>
    <span className="min-w-0 flex-1">
      <b className="block text-sm font-semibold">{title}</b>
      <small className="mt-1 block text-xs leading-relaxed text-muted-foreground">{sub}</small>
    </span>
    <ArrowRight aria-hidden className="size-4 shrink-0 text-primary transition-transform motion-safe:group-hover:translate-x-0.5" />
  </>;
}

function ChoiceLink(props: { href: string; icon: typeof FileText; title: string; sub: string }) {
  return <Link href={props.href} className={cn(choiceClass, "s29-primaryChoice")}><ChoiceInner {...props} /></Link>;
}

function ChoiceButton({ onClick, ...props }: { onClick: () => void; icon: typeof FileText; title: string; sub: string }) {
  return <button type="button" onClick={onClick} className={choiceClass}><ChoiceInner {...props} /></button>;
}

function TicketList({ tickets, onShowOnModel, modelLabel, queueHref }: {
  tickets: TicketSummary[]; onShowOnModel: (t: TicketSummary) => void; modelLabel: (t: TicketSummary) => string | null; queueHref: string;
}) {
  return <>
    <DialogHeader className={cn("s29-dialogHeader", "text-left")}>
      <span className={"s29-dialogEyebrow"}><ListChecks aria-hidden />FOLLOW-UP LIST</span>
      <DialogTitle className="flex flex-wrap items-center gap-3 text-xl font-semibold">งานที่ควรติดตาม <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">{tickets.length} งาน</span></DialogTitle>
      <DialogDescription>เลยกำหนด ส่งกลับแก้ และงานเร่งด่วน</DialogDescription>
    </DialogHeader>
    <ul className={"s29-ticketList"} aria-label="รายการงานที่ควรติดตาม">
      {tickets.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">ไม่มีงานที่ควรติดตามในตอนนี้</li>}
      {tickets.map((t, index) => {
        const model = modelLabel(t);
        return <li key={t.id} className={"s29-ticketItem"}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={"s29-listNumber"} aria-hidden>{String(index + 1).padStart(2, "0")}</span>
            <Badge ticket={t} />
            <span className="text-xs text-muted-foreground tabular-nums">{t.ticketNo}</span>
          </div>
          <h3 className="mt-3 text-sm leading-relaxed font-semibold">{ticketTitle(t)}</h3>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />{place(t)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button asChild variant="secondary" size="sm" className="h-11 rounded-xl">
              <Link href={ticketHref(t.id)} aria-label={`รายละเอียด ${t.ticketNo}`}><FileText aria-hidden />รายละเอียด</Link>
            </Button>
            {model && <Button variant="outline" size="sm" className="h-11 rounded-xl" aria-label={`${model} ${t.ticketNo}`} onClick={() => onShowOnModel(t)}><Box aria-hidden />{model}</Button>}
          </div>
        </li>;
      })}
    </ul>
    <Link href={queueHref} className="flex min-h-14 items-center justify-center gap-2 border-t px-5 py-4 text-sm font-semibold text-primary outline-none hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
      ดูรายการงานทั้งหมด<ChevronRight className="size-4" aria-hidden />
    </Link>
  </>;
}
