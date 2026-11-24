"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import { appPath } from "@/lib/app-path";
import { mascotFrameAt } from "./admin-mascot-motion";

export const MASCOT_SHEETS = Array.from({ length: 6 }, (_, i) => appPath(`/brand/bam-leopard-admin-${i + 1}.webp`));
export type MascotFramesHandle = { paint: (time: number) => void };
const CELL = 362, COLUMNS = 4, PER_SHEET = 12;

/** One canvas, one complete image. Clear transparent pixels too, so the previous silhouette cannot remain. */
export function AdminMascotFrames({ ref, sheets }: { ref: Ref<MascotFramesHandle>; sheets: readonly HTMLImageElement[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef(-1);
  useImperativeHandle(ref, () => ({ paint(time) {
    const frame = mascotFrameAt(time);
    if (frame === shown.current) return;
    const target = canvas.current, sheet = sheets[Math.floor(frame / PER_SHEET)];
    const context = target?.getContext("2d");
    if (!target || !context || !sheet) return;
    const cell = frame % PER_SHEET;
    // Both operations finish in the same animation frame, without a blank painted frame between them.
    context.clearRect(0, 0, CELL, CELL);
    context.drawImage(sheet, (cell % COLUMNS) * CELL, Math.floor(cell / COLUMNS) * CELL, CELL, CELL, 0, 0, CELL, CELL);
    shown.current = frame;
    target.dataset.frame = String(frame);
  } }), [sheets]);
  return <canvas ref={canvas} width={CELL} height={CELL} className="ah-frames" aria-hidden="true" data-mascot-frames="single" />;
}
