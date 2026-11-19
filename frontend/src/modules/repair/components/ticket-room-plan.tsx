"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getRoomPlan } from "../api";
import type { RoomPlan, TicketDetail } from "../types";
import { FlatPlan } from "./room-plan-picker";
import { floorLabel } from "./ticket-presentation";

// CR-045: S07 "สถานที่เกิดเหตุ" shows the floor plan (#36) with the reported room highlighted and a pin on it,
// read-only, 2D on every screen. No plan for the floor, a room without an outline, or a failed load → nothing
// (the place line above already says where).

type Load = { floorId: string; plan: RoomPlan | null };

export function TicketRoomPlan({ ticket }: { ticket: Pick<TicketDetail, "floor" | "room" | "status"> }) {
  const floorId = ticket.floor.id;
  const [load, setLoad] = useState<Load | null>(null);
  useEffect(() => {
    let alive = true;
    getRoomPlan(floorId)
      .then((plan) => { if (alive) setLoad({ floorId, plan }); })
      .catch(() => { if (alive) setLoad({ floorId, plan: null }); });
    return () => { alive = false; };
  }, [floorId]);

  const plan = load?.floorId === floorId ? load.plan : undefined;
  const shaped = useMemo(() => plan?.rooms.filter((r) => r.shape && r.shape.length >= 3) ?? [], [plan]);
  if (plan === undefined) return <Skeleton className="mt-4 h-56 w-full rounded-lg" />;
  const roomId = ticket.room?.id ?? "";
  if (!plan || plan.widthM == null || plan.depthM == null || !shaped.some((r) => r.id === roomId)) return null;

  const open = ticket.status !== "closed";
  return <figure className="mt-4">
    <div className="overflow-hidden rounded-lg border bg-muted/40 p-2 sm:p-3">
      <FlatPlan plan={plan} rooms={shaped} value={roomId} pulse={open} className="max-h-80" />
    </div>
    <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-muted-foreground">
      <span>แปลน{floorLabel(plan.floor.name)}</span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full bg-destructive ring-2 ring-card" />
        {open ? "ห้องที่กำลังมีปัญหา" : "ห้องที่แจ้งซ่อม"}
      </span>
    </figcaption>
  </figure>;
}
