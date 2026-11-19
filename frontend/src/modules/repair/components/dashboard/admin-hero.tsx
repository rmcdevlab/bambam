"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, FileText, ListChecks, Sparkles } from "lucide-react";
import { Mascot } from "@/components/shared/mascot";
import { cn } from "@/lib/utils";
import { getRoomPlan } from "../../api";
import { roomCenter } from "../../plan-geometry";
import type { Overview, RoomPlan, TicketSummary } from "../../types";
import { floorLabel, placeLine, ticketTitle } from "../ticket-presentation";
import { attentionBadge, attentionReason, type AttentionReason, type AttentionTone } from "./dashboard-ui";

// CR-055 — S29 hero from the owner draft output/admin-home-v3/index.html (+ owner changes 2026-11-18): BAM greets the
// user (wave, speech bubble beside BAM), reads the blueprint, holds it up, and the plan grows from BAM's hands into the
// "งานที่ควรดูแลตอนนี้" card (#27 attention[0]: title, place, the floor plan from #36 with the room marked, → S07).
// BAM does not walk; no replay / motion buttons. Plays once (6.8 s). Reduced motion, a
// hidden tab, the hero leaving the screen or a sprite that fails to decode → the finished card at once.
// The sequence waits in the reading pose until #27 has answered (or failed → the "no ticket" card).
// Owner follow-up: 24 newly generated consecutive poses keep the same blueprint throughout the greeting,
// unrolling, reading and presenting. Short blends connect the actual in-between frames.
// `ดู Ticket นี้` and the `ควรติดตาม n งาน` pill open the S29 choice popups (detail S07 or the model).
// Amendment 2 preserved: the last pose has an open palm towards the card, after the plan has opened.

const ATLAS = "/brand/bam-mascot-admin-sequence-v3.webp"; // 6 × 4, 256px square frames, genuine alpha.
type Pose = { frame: number };

// Time for the finer gestures, a readable greeting and a pause to study the open plan.
const INTRO = 200, GREET = 1700, READ = 4400, PRESENT = 5200, ZOOM = 6800;
type Phase = "intro" | "greet" | "read" | "present" | "zoom" | "done";

// Quick changes of direction, with a little extra time at the outside of each wave.
const waveSweep: [number, number][] = [[3, 90], [4, 65], [5, 105], [4, 65]];
const WAVE_BEATS: [frame: number, ms: number][] = [
  [0, 120], [1, 100], [2, 100],
  ...waveSweep, ...waveSweep, ...waveSweep,
  [6, 100], [7, 130], [8, 0],
];
function waveFrame(t: number) {
  let at = 0;
  for (const [frame, ms] of WAVE_BEATS) { if (ms === 0 || t < at + ms) return frame; at += ms; }
  return 8;
}
function poseAt(t: number): Pose {
  if (t < GREET) return { frame: waveFrame(t) };
  if (t < READ) return { frame: Math.min(15, 9 + Math.floor((t - GREET) / 220)) };
  if (t < PRESENT) return { frame: Math.min(19, 16 + Math.floor((t - READ) / 200)) };
  if (t < PRESENT + 400) return { frame: 19 };
  return { frame: Math.min(22, 20 + Math.floor((t - PRESENT - 400) / 400)) };
}
const phaseAt = (t: number): Phase => (t < INTRO ? "intro" : t < GREET ? "greet" : t < READ ? "read" : t < PRESENT ? "present" : t < ZOOM ? "zoom" : "done");
const framePos = (p: Pose) => `${(p.frame % 6) * 20}% ${Math.floor(p.frame / 6) * 100 / 3}%`;
/** The last pose: BAM's open palm towards the opened plan card (amendment 2). */
const PRESENTING: Pose = { frame: 23 };
/** Shorter than each pose, avoiding doubled hands/eyes during the finer movements. */
const FADE = 120;
function paint(el: HTMLElement, p: Pose) {
  el.style.backgroundImage = `url(${ATLAS})`;
  el.style.backgroundSize = "600% 400%";
  el.style.backgroundPosition = framePos(p);
}

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
  const signRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  const [art, setArt] = useState<"loading" | "ready" | "failed">("loading");
  const [phase, setPhase] = useState<Phase>("intro");
  // Two sprite layers, driven imperatively (React never rewrites their style). A pose change dissolves without a dip:
  // the new pose fades in ON TOP of the old one, which stays fully opaque until the new one is, then fades out — so BAM
  // is never see-through (a plain cross-fade made him flicker).
  const layerA = useRef<HTMLDivElement>(null);
  const layerB = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const front = useRef<0 | 1>(0);
  const shown = useRef<Pose>({ frame: 0 });
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

  const show = useCallback((p: Pose) => {
    const s = shown.current;
    if (s.frame === p.frame) return;
    shown.current = p;
    // Brief overlaps soften the authored wave frames; longer blends connect the blueprint poses.
    const waving = s.frame <= 8 && p.frame <= 8;
    const duration = waving ? 45 : FADE;
    const next = front.current === 0 ? 1 : 0;
    const inc = next === 0 ? layerA.current : layerB.current, out = next === 0 ? layerB.current : layerA.current;
    front.current = next;
    if (!inc || !out) return;
    [inc, out].forEach((l) => l.getAnimations().forEach((a) => a.cancel()));
    paint(inc, p);
    inc.style.zIndex = "2";
    out.style.zIndex = "1";
    out.style.opacity = "1";
    inc.style.opacity = "1";
    out.style.opacity = "0";
    inc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.55, easing: "ease-in-out", fill: "backwards" });
    out.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration, easing: "ease-in-out", fill: "backwards" });
  }, []);

  // show one pose at once, no fade (start, reduced motion, end of the run)
  const restOn = useCallback((p: Pose) => {
    const a = front.current === 0 ? layerA.current : layerB.current, b = front.current === 0 ? layerB.current : layerA.current;
    if (!a || !b) return;
    [a, b].forEach((l) => l.getAnimations().forEach((x) => x.cancel()));
    bodyRef.current?.getAnimations().forEach((x) => x.cancel());
    paint(a, p);
    a.style.opacity = "1";
    b.style.opacity = "0";
  }, []);

  // ---- the sequence (rAF; ends for good on "done") ----
  const elapsed = useRef(0);
  const zoomFrom = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  // `played`: the run reached its end → dissolve into the gesture once the card has opened; otherwise (reduced motion,
  // hidden tab, off screen, sprite failure) the gesture shows at once.
  const finish = useCallback((played = false) => {
    elapsed.current = ZOOM;
    zoomFrom.current = null;
    if (boardRef.current) { boardRef.current.style.transform = ""; boardRef.current.style.opacity = ""; }
    if (signRef.current) signRef.current.style.opacity = "";
    if (played) show(PRESENTING);
    else { shown.current = PRESENTING; restOn(PRESENTING); }
    setPhase("done");
  }, [restOn, show]);

  // Decode the entire atlas before playback: no missing frames or mid-sequence asset requests.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = ATLAS;
    img.decode()
      .then(() => {
        if (!alive) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) finish();
        setArt("ready");
      }, () => { if (alive) { finish(); setArt("failed"); } });
    return () => { alive = false; };
  }, [finish]);

  // the first painted frame of the sprite = the current pose (the greeting, or the finished pose)
  useLayoutEffect(() => { if (art === "ready") restOn(shown.current); }, [art, restOn]);

  useLayoutEffect(() => {
    if (art !== "ready" || elapsed.current >= ZOOM) return;
    let raf = 0, last = 0;
    // BAM eases in (the S06 hero walks in; here he only rises and fades in)
    if (elapsed.current === 0) bodyRef.current?.animate(
      [{ opacity: 0, transform: "translateY(14px) scale(0.97)" }, { opacity: 1, transform: "none" }],
      { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
    const tick = (now: number) => {
      if (elapsed.current >= ZOOM) return;
      if (last) elapsed.current += Math.min(60, now - last);
      last = now;
      // wait in the reading pose until #27 has answered
      if (!readyRef.current && elapsed.current > READ - 1) elapsed.current = READ - 1;
      const t = elapsed.current;
      const p = phaseAt(t);
      if (p === "done") { finish(true); return; }
      setPhase(p);
      show(poseAt(t));
      if (p === "zoom") zoom((t - PRESENT) / (ZOOM - PRESENT));
      raf = requestAnimationFrame(tick);
    };
    // the plan grows from the sheet BAM holds (measured once the card is laid out) to the card's own place
    const zoom = (progress: number) => {
      const board = boardRef.current, sign = signRef.current;
      if (!board || !sign || board.offsetParent === null) return;
      if (!zoomFrom.current) {
        board.style.transform = "none";
        const s = sign.getBoundingClientRect(), d = board.getBoundingClientRect();
        if (!d.width || !d.height) return;
        zoomFrom.current = { x: s.left - d.left, y: s.top - d.top, sx: s.width / d.width, sy: s.height / d.height };
      }
      const k = 1 - Math.pow(1 - progress, 3), z = zoomFrom.current;
      board.style.transform = `translate(${z.x * (1 - k)}px, ${z.y * (1 - k)}px) scale(${z.sx + (1 - z.sx) * k}, ${z.sy + (1 - z.sy) * k})`;
      board.style.opacity = String(0.6 + 0.4 * k);
      sign.style.opacity = String(Math.max(0, 1 - progress * 4));
    };
    raf = requestAnimationFrame(tick);
    // leaving the screen or the tab ends the sequence
    const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) finish(); });
    if (heroRef.current) io.observe(heroRef.current);
    const onHidden = () => { if (document.hidden) finish(); };
    document.addEventListener("visibilitychange", onHidden);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => { if (motion.matches) finish(); };
    motion.addEventListener("change", onMotion);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
      motion.removeEventListener("change", onMotion);
    };
  }, [art, finish, show]);

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
          : art === "ready" && <div className={cn("ah-art", phase === "read" && "ah-reading")}>
              <div ref={bodyRef} className="ah-body">
                <div ref={layerA} className="ah-pose" />
                <div ref={layerB} className="ah-pose" />
              </div>
              <div ref={signRef} className={cn("ah-sign", (phase === "present" || phase === "zoom") && "ah-sign-up")}>
                <div className="ah-sign-art">{visual}</div>
                <strong>{ticket ? `${ticket.building.name} · ${floorLabel(ticket.floor.name)}` : "BAM"}</strong>
              </div>
            </div>}
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
