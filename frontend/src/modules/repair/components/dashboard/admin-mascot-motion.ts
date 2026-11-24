// Full-character images only. A frame replaces its predecessor; never blend two poses.
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
// A second small wave stays within the raised-paw poses; do not repeat the arm lift. Slot 3 is skipped (it interrupts
// the gesture); the greeting ends on slot 23, the idle pose holding the roll that sheet 3 starts from.
const GREETING = [0, 1, 2, 5, 6, ...range(7, 13), ...range(8, 12).reverse(), ...range(9, 23)];
const GREET_END = GREETING.length * 60;
export const MASCOT_TIMING = {
  intro: 120, greet: GREET_END, read: GREET_END + 1140,
  present: GREET_END + 2040, end: GREET_END + 3240,
} as const;
const frameIn = (frames: readonly number[], elapsed: number, step: number) =>
  frames[Math.max(0, Math.min(frames.length - 1, Math.floor(elapsed / step)))];
// CR-060 amendment 2: the leopard sheets were generated separately, so each sheet change cuts where the two poses are
// closest (34 -> 38, 47 -> 50, 54 -> 60). The sheets carry baked easing: the first frames after a cut are scaled and
// shifted to meet the previous frame and settle back over 5-8 frames (provenance: attachments/admin-hero-motion).
const UNROLL = range(24, 34), READ = range(38, 41), LIFT = range(42, 54).filter(f => f < 48 || f > 49);
const OFFER = range(60, 71);

export function mascotFrameAt(time: number): number {
  const t = Math.max(0, time);
  if (t < GREET_END) return frameIn(GREETING, t, 60);
  if (t < GREET_END + 600) return frameIn(UNROLL, t - GREET_END, 600 / UNROLL.length);
  if (t <= MASCOT_TIMING.read) return frameIn(READ, t - GREET_END - 600, 60); // holds frame 41 while data loads
  if (t < MASCOT_TIMING.present) return frameIn(LIFT, t - MASCOT_TIMING.read, 900 / LIFT.length);
  return frameIn(OFFER, t - MASCOT_TIMING.present, 70);
}
