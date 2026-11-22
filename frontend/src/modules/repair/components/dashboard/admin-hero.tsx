"use client";

import { appPath } from "@/lib/app-path";

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
// Owner follow-up: 72 generated poses keep the same blueprint throughout the greeting,
// unrolling, reading and presenting. Six HD sheets keep each pose sharp at the rendered size; 70 of them play.
// `ดู Ticket นี้` and the `ควรติดตาม n งาน` pill open the S29 choice popups (detail S07 or the model).
// Amendment 2 preserved: the last pose has an open palm towards the card, after the plan has opened.
// Handover polish: the card flies on the compositor (Web Animations) along a soft arc, BAM's arm sweep overlaps the
// card settling, the close sweep poses blend continuously and a small body lean follows the arm movement.

// Keep the generated native detail: 12 poses per sheet instead of shrinking all 72 into one image.
// v6 = the owner's v5 sheets re-registered (slots unchanged): each sheet scaled uniformly so BAM keeps one size, with
// his feet on one ground line and shoe centre in every slot (v5 changed size per sheet and sheet 6 drifted ~8 px per
// column). Provenance: docs/modules/repair/attachments/admin-hero-motion/README.md.
const ATLASES = Array.from({ length: 6 }, (_, i) => appPath(`/brand/bam-mascot-admin-hd-v6-${i + 1}.webp`));
const COLUMNS = 4, ROWS = 3, FRAMES_PER_SHEET = COLUMNS * ROWS;
const slots = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
// Playback order by slot, one list per phase. The greeting rests (0, 4), brings the fist forward and up (1, 2, 5),
// then opens the paw into the wave. Skipped: slot 3 (paw opened at the waist, which made the paw open, close and open
// again) and slot 23 (paper already pulled sideways; sheet 3 restarts from the one-hand hold, so 23 → 24 snapped back).
const GREET_POSES = [0, 4, 1, 2, 5, ...slots(6, 22)];
const READ_POSES = slots(24, 47), PRESENT_POSES = slots(48, 59), HANDOVER_POSES = slots(60, 71);
type Pose = { frame: number };

// Time for the finer gestures, a readable greeting and a pause to study the open plan.
const INTRO = 200, GREET = 1700, READ = 4400, PRESENT = 5200, ZOOM = 6800;
type Phase = "intro" | "greet" | "read" | "present" | "zoom" | "done";

// The handover, in ms from PRESENT: the plan lifts off BAM's hands and flies to the card's place (FLIGHT) while he
// lowers his hands; his arm sweeps out as the card slows down and the palm opens as it settles (amendment 2: the
// palm stays last, once the plan has opened). The lean starts just before the sweep and ends before "done".
const FLIGHT = 1150, LEAN_AT = 420, LEAN = 900;
// Each phase uses its own authored in-betweens rather than repeating a handful of wave poses.
// The palm settles before the end, leaving a short readable hold beside the opened card.
const WAVE_STEP = GREET / GREET_POSES.length, READ_STEP = (READ - GREET) / READ_POSES.length;
const PRESENT_STEP = (PRESENT - READ) / PRESENT_POSES.length, HANDOVER_STEP = 100;
const nth = (poses: number[], i: number) => poses[Math.min(poses.length - 1, Math.floor(i))];
function poseAt(t: number): Pose {
  if (t < GREET) return { frame: nth(GREET_POSES, t / WAVE_STEP) };
  if (t < READ) return { frame: nth(READ_POSES, (t - GREET) / READ_STEP) };
  if (t < PRESENT) return { frame: nth(PRESENT_POSES, (t - READ) / PRESENT_STEP) };
  return { frame: nth(HANDOVER_POSES, (t - PRESENT) / HANDOVER_STEP) };
}
const phaseAt = (t: number): Phase => (t < INTRO ? "intro" : t < GREET ? "greet" : t < READ ? "read" : t < PRESENT ? "present" : t < ZOOM ? "zoom" : "done");
const framePos = (p: Pose) => {
  const cell = p.frame % FRAMES_PER_SHEET;
  return `${(cell % COLUMNS) * 100 / (COLUMNS - 1)}% ${Math.floor(cell / COLUMNS) * 100 / (ROWS - 1)}%`;
};
/** The last pose: BAM's open palm towards the opened plan card (amendment 2). */
const PRESENTING: Pose = { frame: 71 };
const frameDuration = (frame: number) => frame < 24 ? WAVE_STEP : frame < 48 ? READ_STEP : frame < 60 ? PRESENT_STEP : HANDOVER_STEP;
// Keep each pose crisp for most of its interval; long dissolves create doubled eyes, stripes and paws.
const POSE_BLEND_MS = 24;
const EASE_IN_OUT = "cubic-bezier(.45,0,.55,1)";

type Zoom = { x: number; y: number; sx: number; sy: number };
/** The card's flight from the sheet BAM holds (`z`: its offset and scale relative to the card) to its own place,
 *  sampled so it runs on the compositor: it slides out ahead of rising (a soft arc that keeps clear of BAM's face)
 *  and grows a little past full size before settling. */
function flightKeyframes(z: Zoom): Keyframe[] {
  const N = 72, frames: Keyframe[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N - 1;
    const grow = 1 + 2 * u * u * u + u * u; // ease-out-back (c = 1): ~4% of the growth past full size
    const sx = z.sx + (1 - z.sx) * grow, sy = z.sy + (1 - z.sy) * grow;
    frames.push({ transform: `translate(${(z.x * u * u).toFixed(2)}px, ${(-z.y * u).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` });
  }
  return frames;
}
function paint(el: HTMLElement, p: Pose) {
  el.style.backgroundImage = `url(${ATLASES[Math.floor(p.frame / FRAMES_PER_SHEET)]})`;
  el.style.backgroundSize = `${COLUMNS * 100}% ${ROWS * 100}%`;
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
  // Where the blueprint sits in BAM's hands as the handover starts (slot 60); the card grows from there. The sprite's
  // own blueprint stays visible: the old HTML sign covered the 12 lifting poses and BAM's paws.
  const planRef = useRef<HTMLDivElement>(null);
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

  const show = useCallback((p: Pose, at = 0) => {
    const s = shown.current;
    if (s.frame === p.frame) return;
    shown.current = p;
    const duration = POSE_BLEND_MS;
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
    const blends = [
      inc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.55, easing: "ease-in-out", fill: "backwards" }),
      out.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration, easing: "ease-in-out", fill: "backwards" }),
    ];
    blends.forEach((animation) => { animation.currentTime = at; });
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
  const launched = useRef(false);
  const leaned = useRef(false);
  // `played`: the run reached its end (the gesture is already showing); otherwise (reduced motion, hidden tab, off
  // screen, sprite failure) the gesture and the opened card show at once.
  const finish = useCallback((played = false) => {
    elapsed.current = ZOOM;
    boardRef.current?.getAnimations().forEach((a) => a.cancel());
    if (played) show(PRESENTING);
    else { shown.current = PRESENTING; restOn(PRESENTING); }
    setPhase("done");
  }, [restOn, show]);

  // Decode every sheet before playback: no blurry low-resolution fallback or mid-gesture asset swap.
  useEffect(() => {
    let alive = true;
    const images = ATLASES.map((src) => { const image = new Image(); image.src = src; return image; });
    Promise.all(images.map((image) => image.decode()))
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
    let currentPhase = phaseAt(elapsed.current);
    // BAM eases in (the S06 hero walks in; here he only rises and fades in)
    if (elapsed.current === 0) bodyRef.current?.animate(
      [{ opacity: 0, transform: "translateY(14px) scale(0.97)" }, { opacity: 1, transform: "none" }],
      { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
    const tick = (now: number) => {
      if (elapsed.current >= ZOOM) return;
      // Keep the sprite and compositor animations on the same wall clock, including slow frames.
      if (last) elapsed.current += now - last;
      last = now;
      // wait in the reading pose until #27 has answered
      if (!readyRef.current && elapsed.current > READ - 1) elapsed.current = READ - 1;
      const t = elapsed.current;
      const p = phaseAt(t);
      if (p === "done") { finish(true); return; }
      if (p !== currentPhase) { currentPhase = p; setPhase(p); }
      const pose = poseAt(t);
      const phaseStart = t < GREET ? 0 : t < READ ? GREET : t < PRESENT ? READ : PRESENT;
      show(pose, (t - phaseStart) % frameDuration(pose.frame));
      if (p === "zoom") {
        if (!launched.current) launch(t - PRESENT);
        if (!leaned.current && t >= PRESENT + LEAN_AT) { leaned.current = true; lean(t - PRESENT - LEAN_AT); }
      }
      raf = requestAnimationFrame(tick);
    };
    // The plan grows from the blueprint in BAM's hands (measured once the card is laid out) to the card's own place.
    // Started once and left to the compositor, so React renders at the phase changes cannot stall it.
    const launch = (at: number) => {
      const board = boardRef.current, from = planRef.current;
      if (!board || !from || board.offsetParent === null) return;
      const s = from.getBoundingClientRect(), d = board.getBoundingClientRect();
      if (!d.width || !d.height) return;
      launched.current = true;
      const z = { x: s.left - d.left, y: s.top - d.top, sx: s.width / d.width, sy: s.height / d.height };
      // The card fades in over the drawn blueprint as it lifts off; BAM then lowers and rolls his copy (slots 61–65).
      const anims = [
        board.animate(flightKeyframes(z), { duration: FLIGHT, easing: "ease", fill: "both" }),
        board.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "ease-out", fill: "both" }),
      ];
      anims.forEach((a) => { a.currentTime = at; }); // in step with the sprite clock
    };
    // BAM gathers, leans into the sweep towards the card, then settles upright (feet stay put: origin 50% 92%)
    const lean = (at: number) => {
      const animation = bodyRef.current?.animate([
        { transform: "none", easing: EASE_IN_OUT },
        { transform: "translate(-1px, 1px) rotate(-0.8deg)", offset: 0.16, easing: EASE_IN_OUT },
        { transform: "translate(3px, -1px) rotate(1.6deg)", offset: 0.5, easing: EASE_IN_OUT },
        { transform: "translate(1px, 0) rotate(0.5deg)", offset: 0.78, easing: EASE_IN_OUT },
        { transform: "none" },
      ], { duration: LEAN });
      if (animation) animation.currentTime = at;
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
              <div ref={planRef} className="ah-plan-from" />
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
