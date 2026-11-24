"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, FileText, ListChecks, Sparkles } from "lucide-react";
import { Mascot } from "@/components/shared/mascot";
import { cn } from "@/lib/utils";
import { AdminMascotFrames, MASCOT_SHEETS, type MascotFramesHandle } from "./admin-mascot-frames";
import { MASCOT_TIMING } from "./admin-mascot-motion";
import { getRoomPlan } from "../../api";
import { roomCenter } from "../../plan-geometry";
import type { Overview, RoomPlan, TicketSummary } from "../../types";
import { floorLabel, placeLine, ticketTitle } from "../ticket-presentation";
import { attentionBadge, attentionReason, type AttentionReason, type AttentionTone } from "./dashboard-ui";

// S29 owner follow-up (2026-11-24): wave -> briefly read -> open palm towards the problem plan.
// Full-character sprite images replace each other on a single cleared canvas. Never dissolve or stack poses.
// Reduced motion, hidden tabs, offscreen heroes and failed artwork reveal the useful card immediately.
const { intro: INTRO, greet: GREET, read: READ, present: PRESENT, end: END } = MASCOT_TIMING;
type Phase = "intro" | "greet" | "read" | "present" | "zoom" | "done";
const phaseAt = (t: number): Phase => (t < INTRO ? "intro" : t < GREET ? "greet" : t <= READ ? "read" : t < PRESENT ? "present" : t < END ? "zoom" : "done");
const FLIGHT = 900;

const COPY: Record<AttentionReason | "high", { heading: string; line: string; tone: AttentionTone }> = {
  critical: { heading: "จุดนี้ต้องดูแลก่อน", line: "BAM ชี้จุดไว้แล้ว ไปดูงานนี้ด้วยกัน", tone: "critical" },
  back: { heading: "งานนี้ถูกส่งกลับมาแก้", line: "แปลนพร้อมแล้ว แวะติดตามงานนี้กันอีกนิด", tone: "critical" },
  late: { heading: "แวะดูงานนี้กันหน่อย", line: "แปลนพร้อมแล้ว แวะติดตามงานนี้กันอีกนิด", tone: "attention" },
  high: { heading: "งานนี้ควรรีบดูแล", line: "BAM ชี้จุดไว้แล้ว ไปดูงานนี้ด้วยกัน", tone: "attention" },
};

type Props = {
  name: string;
  overview: Overview | null;
  /** #27 failed — the sequence ends on the "no ticket" card. */
  failed: boolean;
  onGoToMap: () => void;
  /** `ดู Ticket นี้` → the S29 choice popup (detail or model). */
  onOpenTicket: (ticket: TicketSummary) => void;
  /** The `ควรติดตาม n งาน` pill → the S29 list popup. */
  onOpenAttention: () => void;
  /** The card has opened (or was shown at once): S29 then shows งานที่ควรติดตาม. */
  onRevealed: () => void;
};

export function AdminHero({ name, overview, failed, onGoToMap, onOpenTicket, onOpenAttention, onRevealed }: Props) {
  const heroRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  const framesRef = useRef<MascotFramesHandle>(null);
  const [sheets, setSheets] = useState<HTMLImageElement[]>([]);
  const [art, setArt] = useState<"loading" | "ready" | "failed">("loading");
  const [phase, setPhase] = useState<Phase>("intro");
  const dataReady = !!overview || failed;
  const readyRef = useRef(dataReady);
  useEffect(() => { readyRef.current = dataReady; }, [dataReady]);

  const ticket = overview?.attention[0] ?? null;
  const reason = ticket ? attentionReason(ticket) : null;
  const copy = ticket ? COPY[reason ?? "high"] : null;

  // the floor plan of the ticket's floor (#36) — the card shows a drawn placeholder until (or unless) it arrives
  const [plan, setPlan] = useState<{ floorId: string; plan: RoomPlan | null } | null>(null);
  const floorId = ticket?.room ? ticket.floor.id : null;
  useEffect(() => {
    if (!floorId) return;
    let alive = true;
    getRoomPlan(floorId)
      .then((p) => { if (alive) setPlan({ floorId, plan: p }); })
      .catch(() => { if (alive) setPlan({ floorId, plan: null }); });
    return () => { alive = false; };
  }, [floorId]);
  const floorPlan = floorId && plan?.floorId === floorId ? plan.plan : null;

  const elapsed = useRef(0);
  const launched = useRef(false);
  const finish = useCallback(() => {
    elapsed.current = END;
    boardRef.current?.getAnimations().forEach((animation) => animation.cancel());
    framesRef.current?.paint(END);
    setPhase("done");
  }, []);

  // Decode every sheet first, so crossing a sheet boundary never waits for an image download.
  useEffect(() => {
    let alive = true;
    const images = MASCOT_SHEETS.map((src) => { const image = new Image(); image.src = src; return image; });
    Promise.all(images.map((image) => image.decode())).then(() => {
      if (!alive) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) finish();
      setSheets(images);
      setArt("ready");
    }, () => { if (alive) { finish(); setArt("failed"); } });
    return () => { alive = false; };
  }, [finish]);

  // Paint before the first visible frame, including when reduced motion skips the introduction.
  useLayoutEffect(() => { if (art === "ready") framesRef.current?.paint(elapsed.current); }, [art]);
  useLayoutEffect(() => {
    if (art !== "ready" || elapsed.current >= END) return;
    const board = boardRef.current;
    let raf = 0, last: number | null = null;
    let currentPhase = phaseAt(elapsed.current);
    const tick = (now: number) => {
      if (elapsed.current >= END) return;
      if (last !== null) elapsed.current += now - last;
      last = now;
      // Hold the downward-looking reading frame while overview data is pending, then resume the sequence.
      if (!readyRef.current && elapsed.current > READ) elapsed.current = READ;
      const t = elapsed.current;
      if (t >= END) { finish(); return; }
      const nextPhase = phaseAt(t);
      if (nextPhase !== currentPhase) { currentPhase = nextPhase; setPhase(nextPhase); }
      framesRef.current?.paint(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) finish(); });
    if (heroRef.current) io.observe(heroRef.current);
    const onHidden = () => { if (document.hidden) finish(); };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => { if (motion.matches) finish(); };
    document.addEventListener("visibilitychange", onHidden);
    motion.addEventListener("change", onMotion);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
      motion.removeEventListener("change", onMotion);
      board?.getAnimations().forEach((animation) => animation.cancel());
    };
  }, [art, finish]);

  // Start after React commits the visible card. The card settles before BAM finishes his open-palm gesture.
  // It opens beside the held paper, so no second blueprint flies across BAM's paws or face.
  useLayoutEffect(() => {
    if (phase !== "zoom" || launched.current) return;
    const board = boardRef.current;
    if (!board) return;
    launched.current = true;
    const animation = board.animate([
      { opacity: 0, transform: "translate(-14px, 12px) scale(.94)" },
      { opacity: 1, transform: "none" },
    ], { duration: FLIGHT, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
    animation.currentTime = Math.max(0, elapsed.current - PRESENT);
  }, [phase]);

  const open = phase === "zoom" || phase === "done";
  const done = phase === "done";
  const revealed = useRef(false);
  useEffect(() => {
    if (done && dataReady && !revealed.current) { revealed.current = true; onRevealed(); }
  }, [done, dataReady, onRevealed]);

  const speech = phase === "greet" || phase === "read"
    ? { heading: `สวัสดี คุณ${name}`, line: "มาดูแปลนกัน" }
    : done ? (copy ? { heading: copy.heading, line: copy.line } : { heading: "มาดูแลพื้นที่กัน", line: "BAM กางแปลนให้แล้ว วันนี้เริ่มจากอาคารไหนดี?" })
    : null;

  const n = overview?.attention.length ?? 0;
  const visual = <BoardVisual ticket={ticket} plan={floorPlan} />;

  return <section ref={heroRef} aria-labelledby="admin-hero-title" data-phase={phase}
    className={cn("admin-hero", "s29-hero", open && "ah-open", done && copy && `ah-tone-${copy.tone}`)}>
    <div className="ah-grid" aria-hidden />
    <div className={"s29-orbit"} aria-hidden="true"><Sparkles /><span /><span /></div>
    <div className="ah-top">
      <h2 id="admin-hero-title"><Building2 aria-hidden />BAM เพื่อนดูแลอาคาร</h2>
      {done && n > 0
        ? <button type="button" onClick={onOpenAttention} className="ah-pill ah-pill-alert" aria-label={`ควรติดตาม ${n} งาน`} aria-haspopup="dialog"><ListChecks aria-hidden /><span>ควรติดตาม</span><b>{n}</b><span className="sr-only">งาน</span><ArrowRight aria-hidden /></button>
        : <span className="ah-pill"><i aria-hidden />พร้อมช่วยดูแล</span>}
    </div>
    <div className="ah-world">
      <div className="ah-actor" aria-hidden>
        <span className="ah-shadow" />
        {art === "failed"
          ? <span className="ah-still"><Mascot pose="welcome" size={150} priority className="max-h-full w-auto" /></span>
          : art === "ready" && <AdminMascotFrames ref={framesRef} sheets={sheets} />}
      </div>

      <div className={cn("ah-speech", !speech && "ah-quiet")} role="status" aria-live="polite">
        {speech && <>
          <h3>{speech.heading}</h3>
          <p>{speech.line}</p>
        </>}
      </div>

      <article ref={boardRef} className="ah-board" style={{ visibility: open ? "visible" : "hidden" }} aria-hidden={!open} inert={!done} aria-label="งานที่ BAM ชวนดูแล">
        <div className="ah-board-head">
          <span>{ticket ? "งานที่ควรดูแลตอนนี้" : "วันนี้เริ่มจากที่ไหนดี"}</span>
          <span className="ah-badge">{ticket ? attentionBadge(ticket).label : "แปลนพร้อมแล้ว"}</span>
        </div>
        <div className="ah-visual">{visual}</div>
        <div className="ah-board-copy">
          <h3>{ticket ? ticketTitle(ticket) : "อาคารและพื้นที่ของเรา"}</h3>
          <p>{ticket ? `${ticket.building.name} · ${placeLine(ticket)}` : "เลือกอาคาร แล้วไปสำรวจพื้นที่ด้วยกัน"}</p>
          {ticket
            ? <button type="button" onClick={() => onOpenTicket(ticket)} className="ah-go" aria-haspopup="dialog"><FileText aria-hidden /><span>ดู Ticket นี้</span><span className={"s29-goArrow"}><ArrowRight aria-hidden /></span></button>
            : <button type="button" onClick={onGoToMap} className="ah-go"><span>ไปดูแปลนอาคาร</span><ArrowRight aria-hidden /></button>}
        </div>
      </article>
    </div>
  </section>;
}

/** Building drawing (decorative) beside the floor plan: the ticket's room marked on #36, else a drawn plan. */
function BoardVisual({ ticket, plan }: { ticket: TicketSummary | null; plan: RoomPlan | null }) {
  return <>
    <div className="ah-visual-building"><BuildingArt /></div>
    <div className="ah-visual-plan">
      {plan && ticket?.room ? <MiniPlan plan={plan} roomId={ticket.room.id} /> : <DrawnPlan marked={!!ticket} />}
    </div>
  </>;
}

function MiniPlan({ plan, roomId }: { plan: RoomPlan; roomId: string }) {
  const rooms = useMemo(() => plan.rooms.filter((r) => r.shape && r.shape.length >= 3), [plan]);
  const room = rooms.find((r) => r.id === roomId);
  if (plan.widthM == null || plan.depthM == null || !room) return <DrawnPlan marked />;
  const W = plan.widthM, D = plan.depthM, pad = Math.max(W, D) * 0.04;
  const c = roomCenter(room, rooms);
  const r = Math.max(W, D) * 0.035;
  return <svg viewBox={`${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}`} role="img" aria-label={`แปลน${floorLabel(plan.floor.name)} · ${room.name}`}>
    {rooms.map((x) => <polygon key={x.id} points={x.shape!.map(([px, pz]) => `${px},${pz}`).join(" ")} vectorEffect="non-scaling-stroke"
      className={x.id === roomId ? "ah-plan-room-on" : x.areaType === "common_area" ? "ah-plan-common" : "ah-plan-room"} />)}
    {c && <>
      <circle cx={c[0]} cy={c[1]} r={r * 2} className="ah-plan-halo" />
      <circle cx={c[0]} cy={c[1]} r={r} className="ah-plan-pin" strokeWidth={r * 0.35} />
    </>}
  </svg>;
}

/** A plain plan drawing for the "no ticket" card or a floor without an outline. */
function DrawnPlan({ marked }: { marked: boolean }) {
  return <svg viewBox="0 0 175 105" aria-hidden>
    <path className="ah-plan-room" d="M17 20h140v65H17z" />
    <path className="ah-plan-line" d="M17 57h140M69 20v37m40-37v37M88 57v28M17 38h24" />
    {marked && <rect x="18" y="21" width="50" height="35" className="ah-plan-room-on" />}
    <circle cx={marked ? 43 : 88} cy={marked ? 38 : 63} r="12" className="ah-plan-halo" />
    <circle cx={marked ? 43 : 88} cy={marked ? 38 : 63} r="6" className={marked ? "ah-plan-pin" : "ah-plan-pin-calm"} strokeWidth="2" />
  </svg>;
}

function BuildingArt() {
  return <svg viewBox="0 0 130 105" aria-hidden>
    <path className="ah-b-ground" d="m8 83 56-29 58 26-54 22z" />
    <path className="ah-b-side" d="M20 40 76 16l35 15v48L55 99 20 81z" />
    <path className="ah-b-roof" d="m20 40 56-24 35 15-56 25z" />
    <path className="ah-b-left" d="m20 40 35 16v43L20 81z" />
    <path className="ah-b-front" d="m55 56 56-25v48L55 99z" />
    <path className="ah-b-glass" d="m60 62 45-20M60 73l45-20M60 84l45-20" />
    <path className="ah-b-trunk" d="M14 75v15m104-19v14" />
    <circle className="ah-b-tree" cx="14" cy="73" r="7" />
    <circle className="ah-b-tree" cx="118" cy="69" r="6" />
  </svg>;
}
