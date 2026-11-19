"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, ClipboardCheck, Plus } from "lucide-react";
import { Mascot } from "@/components/shared/mascot";

// CR-047 — S06 hero, ported from the owner draft output/repair-hero/index.html (v2, character animation). Markup and the
// `.repair-hero` / `.rh-*` styles (globals.css) follow the draft; the sprite sheet lives in the app
// (/brand/bam-mascot-actions-white.webp, 4 × 3 poses), so nothing depends on output/. Leads keep `บันทึกงานที่ทีมแก้แล้ว`.
// The sequence plays once on mount: 12 walk frames while BAM walks in → turn → wave with the speech bubble → present
// (the report button glows) → attentive pose. Amendment 2: no held beat before the end (the draft held the present
// pose 1.6s) — the glow overlaps the final pose. Timers pause when the hero is offscreen or the tab hidden. Reduced
// motion or a sprite that fails to decode: the static pose + bubble.

const SPRITE = "/brand/bam-mascot-actions-white.webp";
type Beat = { frame: number; ms: number; phase: "walk" | "turn" | "greet" | "present" | "idle" };
const SEQUENCE: Beat[] = [
  ...Array.from({ length: 12 }, (_, i): Beat => ({ frame: i % 6, ms: 140, phase: "walk" })),
  { frame: 6, ms: 200, phase: "turn" },
  { frame: 7, ms: 220, phase: "greet" },
  { frame: 8, ms: 200, phase: "greet" },
  { frame: 9, ms: 200, phase: "greet" },
  { frame: 8, ms: 200, phase: "greet" },
  { frame: 9, ms: 200, phase: "greet" },
  { frame: 6, ms: 200, phase: "present" },
  { frame: 11, ms: 0, phase: "idle" },
];
const IDLE_FRAME = 11;

export function RepairHero({ lead }: { lead: boolean }) {
  const heroRef = useRef<HTMLElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current, sprite = spriteRef.current, speech = speechRef.current;
    if (!hero || !sprite || !speech) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motion = !reduce.matches, ready = false, visible = true, disposed = false;
    let step = -1, timer: number | null = null, remaining = 0, scheduledAt = 0;

    const setFrame = (f: number) => {
      sprite.style.backgroundPosition = `${((f % 4) * 100) / 3}% ${Math.floor(f / 4) * 50}%`;
      sprite.dataset.frame = String(f);
    };
    const speak = (on: boolean) => speech.classList.toggle("rh-visible", on);
    const paused = () => document.hidden || !visible;
    const cancel = () => {
      if (timer === null) return;
      remaining = Math.max(0, remaining - (performance.now() - scheduledAt));
      window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      if (!motion || !ready || paused() || step < 0 || step >= SEQUENCE.length - 1 || timer !== null) return;
      scheduledAt = performance.now();
      timer = window.setTimeout(() => { timer = null; advance(); }, remaining);
    };
    const advance = () => {
      step += 1;
      const beat = SEQUENCE[step];
      setFrame(beat.frame);
      hero.dataset.phase = beat.phase;
      if (beat.phase === "greet" || beat.phase === "present" || beat.phase === "idle") speak(true);
      if (beat.phase === "present") hero.classList.add("rh-cta");
      if (beat.phase === "idle") { hero.classList.remove("rh-performing"); return; }
      remaining = beat.ms;
      schedule();
    };
    const staticPose = () => {
      cancel();
      step = SEQUENCE.length - 1;
      hero.classList.remove("rh-performing", "rh-cta");
      hero.dataset.phase = "idle";
      setFrame(IDLE_FRAME);
      speak(true);
    };
    const sync = () => {
      const p = paused();
      hero.classList.toggle("rh-paused", p);
      if (p) cancel(); else schedule();
    };
    const start = () => {
      if (!ready || !motion) return;
      cancel();
      hero.classList.remove("rh-performing", "rh-cta");
      speak(false);
      void hero.offsetWidth; // restart the CSS walk-in
      hero.classList.add("rh-performing");
      step = -1;
      advance();
      sync();
    };
    const onReduce = () => { motion = !reduce.matches; if (motion) start(); else staticPose(); };

    reduce.addEventListener("change", onReduce);
    document.addEventListener("visibilitychange", sync);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    io.observe(hero);
    if (!motion) staticPose();
    const img = new Image();
    img.src = SPRITE;
    img.decode().then(() => {
      if (disposed) return;
      ready = true;
      hero.classList.add("rh-art-ready");
      if (motion) start(); else staticPose();
    }, () => { if (!disposed) staticPose(); }); // keep the original still mascot

    return () => {
      disposed = true;
      cancel();
      reduce.removeEventListener("change", onReduce);
      document.removeEventListener("visibilitychange", sync);
      io.disconnect();
    };
  }, []);

  return <div className="rh-wrap">
    <header ref={heroRef} aria-labelledby="hero-title" className="repair-hero">
      <div className="rh-ambient" aria-hidden><div className="rh-light" /></div>
      {/* Amendment 2: the bubble avoids gendered particles (no ครับ / ค่ะ) and invites a report. */}
      <div ref={speechRef} className="rh-speech">มีอะไรให้ BAM ช่วยไหม? <strong>แจ้งได้เลย</strong></div>
      <div className="rh-stage" aria-hidden>
        <div className="rh-halo" />
        <div className="rh-ground" />
        <div className="rh-body">
          <div className="rh-still"><Mascot pose="tracking" size={224} priority /></div>
          <div ref={spriteRef} className="rh-sprite" />
        </div>
      </div>
      <div className="rh-copy">
        <p className="rh-eyebrow"><span className="rh-dot" aria-hidden />BAM พร้อมดูแลพื้นที่ทำงานของคุณ</p>
        <h1 id="hero-title" className="rh-title">
          <span className="sr-only">ติดตามงานซ่อม · </span>
          <span className="rh-hl-start">เรื่องซ่อม...</span>{" "}
          <span className="rh-hl-end">ให้เราช่วยดูแล<svg className="rh-underline" viewBox="0 0 240 12" fill="none" aria-hidden><path d="M2 9 Q110 -1 238 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></span>
        </h1>
        <p className="rh-subtitle"><span>แจ้งปัญหาไว้</span> <span>แล้วติดตามความคืบหน้าได้ที่นี่</span></p>
      </div>
      <div className="rh-card">
        <div className="rh-actions">
          <Link href="/repair/new" className="rh-report">
            <Plus className="rh-icon rh-plus" strokeWidth={1.7} aria-hidden />
            <span>แจ้งซ่อมใหม่</span>
            <ArrowRight className="rh-icon rh-arrow" strokeWidth={1.7} aria-hidden />
          </Link>
          {lead && <Link href="/repair/new?mode=team" className="rh-team">
            <ClipboardCheck className="rh-icon rh-plus" strokeWidth={1.7} aria-hidden />
            <span>บันทึกงานที่ทีมแก้แล้ว</span>
            <ArrowRight className="rh-icon rh-arrow" strokeWidth={1.7} aria-hidden />
          </Link>}
        </div>
        <p className="rh-caption">{lead ? "แจ้งช่าง หรือบันทึกงานที่ทีมแก้ไขแล้ว" : "แจ้งง่าย พร้อมส่งต่อถึงทีมช่าง"}</p>
      </div>
    </header>
  </div>;
}
