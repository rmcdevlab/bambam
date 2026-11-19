"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { DoorOpen, List, Map as MapIcon } from "lucide-react";
import { useIsDesktop } from "@/components/shared/use-media-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getRoomPlan } from "../api";
import { roomCenter, shapeArea } from "../plan-geometry";
import { labelCandidates, labelRoom, pickFit, textWidth } from "../room-label-fit";
import type { PlanRoom, RoomPlan } from "../types";
import { hasWebGL } from "./dashboard/dashboard-ui";

// CR-038: S03 picks the room on the floor plan (#36) instead of by name. Desktop with WebGL and a building
// shape → the S29 3D engine's plan view; phones / no WebGL / no shape → a flat SVG plan from the same room
// outlines (D-124: no 3D on phones). The name list stays behind "เลือกจากรายชื่อ" for rooms without an
// outline, floors without a plan, keyboard and screen-reader users.
// CR-043: names stay inside their room (shortened when they do not fit); the picked room shows its full name on
// the plan and in a card right under the field label "ห้องหรือจุดที่เกิด".

const RoomPlan3D = dynamic(() => import("./room-plan-3d"), { ssr: false, loading: () => <Skeleton className="size-full rounded-none" /> });

type Load = { floorId: string; plan: RoomPlan | null };

export function RoomPlanPicker({ floorId, value, onPick, list, label }: {
  floorId: string; value: string; onPick: (roomId: string) => void; list: ReactNode;
  /** The field label row; CR-044: the plan / list switch sits at its right end. */
  label: (action?: ReactNode) => ReactNode;
}) {
  const desktop = useIsDesktop();
  const [webgl] = useState(() => typeof window !== "undefined" && hasWebGL());
  const [load, setLoad] = useState<Load | null>(null);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    let alive = true;
    getRoomPlan(floorId)
      .then((plan) => { if (alive) setLoad({ floorId, plan }); })
      .catch(() => { if (alive) setLoad({ floorId, plan: null }); }); // no plan → the list, the form still works
    return () => { alive = false; };
  }, [floorId]);

  const plan = load?.floorId === floorId ? load.plan : undefined;
  const shaped = useMemo(() => plan?.rooms.filter((r) => r.shape && r.shape.length >= 3) ?? [], [plan]);
  if (plan === undefined) return <>{label()}<Skeleton className="h-72 w-full rounded-lg" /></>;
  const usable = !!plan && plan.widthM != null && plan.depthM != null && shaped.length > 0;
  if (!usable) return <>{label()}{list}</>;

  const picked = plan.rooms.find((r) => r.id === value);
  const unshaped = plan.rooms.length - shaped.length;
  const in3D = desktop && webgl && !!plan.model;
  const mode = (list: boolean, Icon: typeof MapIcon, text: string, short: string) =>
    <Button type="button" variant="ghost" size="sm" aria-pressed={showList === list} aria-label={text} onClick={() => setShowList(list)}
      className={cn("h-9 gap-1.5 rounded-md px-2.5 font-medium", showList === list ? "bg-card text-primary shadow-xs hover:bg-card" : "text-muted-foreground")}>
      <Icon aria-hidden /><span className="sm:hidden">{short}</span><span className="max-sm:hidden">{text}</span>
    </Button>;
  const toggle = <span className="inline-flex shrink-0 rounded-lg bg-muted p-0.5">
    {mode(false, MapIcon, "เลือกจากแปลน", "แปลน")}{mode(true, List, "เลือกจากรายชื่อ", "รายชื่อ")}
  </span>;
  return <>{label(toggle)}<div className="space-y-2.5">
    <PickedRoom name={picked?.name} hint={showList ? "เลือกห้องจากรายชื่อ" : "กดที่ห้องในแปลนเพื่อเลือก"} />
    {!showList && <div className={cn("relative overflow-hidden rounded-lg border bg-muted/40", in3D ? "h-105" : "")}>
      {in3D
        ? <RoomPlan3D plan={plan} value={value} onPick={onPick} />
        : <FlatPlan plan={plan} rooms={shaped} value={value} onPick={onPick} />}
    </div>}
    {showList && list}
    {!showList && unshaped > 0 && <p className="text-[13px] text-muted-foreground">ไม่พบห้องในแปลน? เลือกจากรายชื่อได้</p>}
  </div></>;
}

/** CR-043: the picked room, right under the field label — the full name, in the primary colour. */
function PickedRoom({ name, hint }: { name?: string; hint: string }) {
  return <div aria-live="polite" className={cn("flex min-h-14 items-center gap-3 rounded-lg border px-3.5 py-2.5",
    name ? "border-primary bg-secondary text-secondary-foreground ring-1 ring-primary" : "border-dashed bg-card text-muted-foreground")}>
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", name ? "bg-primary text-primary-foreground" : "bg-muted")}>
      <DoorOpen className="size-5" aria-hidden />
    </span>
    {name
      ? <p className="min-w-0"><span className="block text-xs text-muted-foreground">ห้องที่เลือก</span><span className="block text-base font-semibold break-words text-foreground">{name}</span></p>
      : <p className="text-sm">{hint}</p>}
  </div>;
}

type Fitted = { id: string; x: number; y: number; text: string | null; size: number };

/**
 * Top-down plan in metres (phones, no WebGL, no 3D shape). Bigger rooms first, so a small room drawn inside a common area wins the tap.
 * CR-045: without `onPick` it is a picture (S07): the reported room is highlighted with a pin on it, its name in a pill under the pin;
 * `pulse` animates the pin while the job is open.
 */
export function FlatPlan({ plan, rooms, value, onPick, pulse, className }: {
  plan: RoomPlan; rooms: PlanRoom[]; value: string; onPick?: (id: string) => void; pulse?: boolean; className?: string;
}) {
  const readOnly = !onPick;
  const W = plan.widthM!, D = plan.depthM!;
  const ordered = useMemo(() => [...rooms].sort((a, b) => shapeArea(b.shape!) - shapeArea(a.shape!)), [rooms]);
  const pad = 0.6;
  const font = Math.max(0.55, Math.min(1.1, Math.max(W, D) / 34));
  // CR-043: each name fitted to the free space around its label point (measured in viewBox metres)
  const labels = useMemo(() => {
    const family = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif";
    const width = (t: string, size: number, weight = 400) => textWidth(t, `${weight} 100px ${family}`) * size / 100;
    const out: Fitted[] = [];
    for (const r of ordered) {
      const c = roomCenter(r, rooms);
      if (!c) continue;
      const free = labelRoom(r, c, rooms);
      const maxW = 2 * Math.min(free.left, free.right) - 0.3;
      const maxH = 2 * Math.min(free.up, free.down);
      const cands = labelCandidates(r.name);
      let size = Math.min(font, maxH / 1.25);
      let text: string | null = null;
      if (size >= font * 0.6) {
        text = pickFit(cands, cands.map((t) => width(t, size)), maxW);
        const smaller = size * 0.8;
        if (text !== cands[0] && smaller >= font * 0.6 && width(cands[0], smaller) <= maxW) {
          text = cands[0];
          size = smaller;
        }
      }
      out.push({ id: r.id, x: c[0], y: c[1], text, size });
    }
    return { out, width };
  }, [ordered, rooms, font]);
  const pickedLabel = labels.out.find((l) => l.id === value);
  const pickedRoom = rooms.find((r) => r.id === value);
  const pickedBox = useMemo(() => {
    if (!pickedLabel || !pickedRoom) return null;
    const size = font * 1.05;
    const w = labels.width(pickedRoom.name, size, 600) + size * 1.2;
    const h = size * 1.7;
    const x = Math.min(Math.max(pickedLabel.x, -pad + w / 2), W + pad - w / 2);
    if (!readOnly) return { x, y: pickedLabel.y, w, h, size };
    // CR-045: the pin sits on the room's label point; the name goes under it (above it near the bottom edge).
    const below = pickedLabel.y + size * 0.9 + h / 2;
    const y = below + h / 2 <= D + pad ? below : pickedLabel.y - size * 0.9 - h / 2;
    return { x, y, w, h, size };
  }, [pickedLabel, pickedRoom, labels, font, W, D, readOnly]);

  return <svg viewBox={`${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}`} role={readOnly ? "img" : "radiogroup"}
    aria-label={readOnly ? `แปลนชั้น ${plan.floor.name}${pickedRoom ? ` · ห้องที่แจ้ง ${pickedRoom.name}` : ""}` : `แปลนชั้น ${plan.floor.name}`}
    className={cn("block h-auto max-h-[60svh] w-full touch-manipulation select-none", className)}>
    {ordered.map((r) => {
      const on = r.id === value;
      const shape = r.shape!.map(([x, z]) => `${x},${z}`).join(" ");
      if (readOnly) return <polygon key={r.id} points={shape} vectorEffect="non-scaling-stroke" aria-hidden
        className={cn("stroke-[1.5]", on ? "fill-primary/25 stroke-primary stroke-[2.5]" : r.areaType === "common_area" ? "fill-card stroke-border" : "fill-background stroke-muted-foreground/50")} />;
      const pick = () => onPick?.(r.id);
      return <g key={r.id} role="radio" aria-checked={on} aria-label={r.name} tabIndex={0} onClick={pick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
        className="group cursor-pointer outline-none">
        <polygon points={shape} vectorEffect="non-scaling-stroke"
          className={cn("stroke-[1.5] transition-colors motion-reduce:transition-none",
            on ? "fill-primary/25 stroke-primary stroke-[2.5]" : r.areaType === "common_area" ? "fill-card stroke-border group-hover:fill-secondary" : "fill-background stroke-muted-foreground/50 group-hover:fill-secondary",
            "group-focus-visible:stroke-ring group-focus-visible:stroke-[3]")} />
      </g>;
    })}
    {labels.out.map((l) => l.id === value || !l.text ? null
      : <text key={l.id} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={l.size} aria-hidden
        className="pointer-events-none fill-foreground">{l.text}</text>)}
    {pickedBox && pickedRoom && <g aria-hidden className="pointer-events-none">
      <rect x={pickedBox.x - pickedBox.w / 2} y={pickedBox.y - pickedBox.h / 2} width={pickedBox.w} height={pickedBox.h} rx={pickedBox.h / 2}
        className="fill-primary stroke-card" strokeWidth={pickedBox.size * 0.12} />
      <text x={pickedBox.x} y={pickedBox.y} textAnchor="middle" dominantBaseline="central" fontSize={pickedBox.size}
        className="fill-primary-foreground font-semibold">{pickedRoom.name}</text>
    </g>}
    {readOnly && pickedLabel && <g aria-hidden className="pointer-events-none">
      {pulse && <circle cx={pickedLabel.x} cy={pickedLabel.y} r={font * 0.55} className="fill-destructive/40 motion-safe:animate-ping"
        style={{ transformBox: "fill-box", transformOrigin: "center" }} />}
      <circle cx={pickedLabel.x} cy={pickedLabel.y} r={font * 0.55} className="fill-destructive stroke-card" strokeWidth={font * 0.16} />
    </g>}
  </svg>;
}
