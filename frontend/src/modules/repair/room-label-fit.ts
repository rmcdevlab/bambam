import { roomAt } from "./plan-geometry";
import type { PlanRoom } from "./types";

// CR-043: S03 floor-plan room names never spill out of their room. A name that does not fit is shortened
// ("RMC Exc… 1" — the trailing number is kept so numbered rooms stay apart); a room too small for even one
// letter shows no name. The picked room always shows its full name (the plan draws it on top).

/** Free space around a label point, in plan metres: how far the room (as `roomAt` owns it) reaches left / right / up / down. */
export type LabelRoom = { left: number; right: number; up: number; down: number };

const STEP = 0.2;

/** Walks from the label point until the point is no longer this room's (a smaller room inside a common area stops it). */
export function labelRoom(room: PlanRoom, at: [number, number], rooms: PlanRoom[]): LabelRoom {
  const reach = (dx: number, dz: number) => {
    let d = 0;
    for (let i = 1; i < 2000; i++) {
      const x = at[0] + dx * i * STEP, z = at[1] + dz * i * STEP;
      if (roomAt(x, z, rooms)?.id !== room.id) break;
      d = i * STEP;
    }
    return d + STEP / 2;
  };
  return { left: reach(-1, 0), right: reach(1, 0), up: reach(0, -1), down: reach(0, 1) };
}

const graphemes = (s: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s)].map((g) => g.segment);
  }
  return [...s];
};

/** The full name first, then ever shorter forms ending in "…" (+ the trailing room number). */
export function labelCandidates(name: string): string[] {
  const full = name.trim();
  const m = /^(.*\S)\s+(\d+[A-Za-z]?)$/.exec(full);
  const head = m ? m[1] : full;
  const tail = m ? ` ${m[2]}` : "";
  const g = graphemes(head);
  const out = [full];
  for (let n = g.length - 1; n >= 1; n--) {
    const cut = g.slice(0, n).join("").trimEnd();
    const c = `${cut}…${tail}`;
    if (c !== out[out.length - 1]) out.push(c);
  }
  if (tail) out.push(tail.trim());
  return out;
}

let ctx: CanvasRenderingContext2D | null | undefined;

/** Text width in px for a CSS `font` shorthand (canvas measure; a rough estimate where canvas is missing). */
export function textWidth(text: string, font: string): number {
  if (ctx === undefined) ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!ctx) return text.length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12") * 0.6);
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** The longest candidate whose width fits `max` (null = nothing fits). `widths` is in the same order as `candidates`. */
export function pickFit(candidates: string[], widths: number[], max: number): string | null {
  for (let i = 0; i < candidates.length; i++) if (widths[i] <= max) return candidates[i];
  return null;
}
