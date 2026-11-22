"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Building2, Check, ChevronRight, Move } from "lucide-react";
import { Mascot } from "@/components/shared/mascot";
import { useCurrentUser } from "@/components/shared/me-provider";
import { can, PERM, sees3D, usesService } from "@/lib/platform/permissions";
import { Picker } from "@/components/shared/picker";
import { PriorityIndicator } from "@/components/shared/priority-indicator";
import { SERVICES, type Service } from "@/components/shared/service-icon";
import { ErrorState, ForbiddenState } from "@/components/shared/states";
import { useIsDesktop } from "@/components/shared/use-media-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getOverview } from "../../api";
import { errorCode } from "../../errors";
import type { Overview, TicketSummary } from "../../types";
import { placeLine, ticketHref, ticketTitle } from "../ticket-presentation";
import { AdminHero } from "./admin-hero";
import { attentionReason, autoCloseSoonest, greeting, hasWebGL, oldestText, REASON_CHIP, SITE_SIDES, type SiteSide } from "./dashboard-ui";
import type { ModelFocus } from "./building-card";
import { FloorList } from "./floor-list";
import { TicketChoiceDialog, type TicketChoice } from "./ticket-choice-dialog";
import { hasShape } from "./scene/registry";
import { DashboardDate } from "./dashboard-date";
import "./dashboard-polish.css";

// S29 หน้าแรก Admin. CR-051 layout = the owner draft output/admin-home/index.html: page heading · blue welcome panel
// (walking BAM) beside the 3 repair numbers · บริการในที่ทำงาน (3 service cards; the picked one drives the right column)
// · building card อาคารและพื้นที่ (ภาพรวม / รายอาคาร + building select + จัดวางอุปกรณ์ above the 3D site / building /
// floor views, CR-016 / CR-027) · right column ภาพรวมงานซ่อม + งานที่ควรติดตาม. Phones / no WebGL: the floor list in the
// building card. Every number comes from #27 (CR-017); car / room show only `ยังไม่เปิดใช้งาน`.
// `settings.assets.manage` toggles จัดวางอุปกรณ์; `settings.locations.manage` renames buildings / rooms on the model.

const BuildingCard = dynamic(() => import("./building-card"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

const QUEUE = "/repair/admin/queue";
/** Picker values of the S29 site view sides (CR-027, CR-028). */
const SITE = { 1: "site-1", 2: "site-2" } as const;
const sideOf = (v: string): SiteSide | null => (v === SITE[1] ? 1 : v === SITE[2] ? 2 : null);
const noop = () => () => {};

type Rail = "repair" | "car" | "room";

export function AdminDashboard() {
  const me = useCurrentUser();
  const desktop = useIsDesktop();
  const webgl = useSyncExternalStore(noop, hasWebGL, () => false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [buildingId, setBuildingId] = useState("");
  const [editing, setEditing] = useState(false);
  const [rail, setRail] = useState<Rail>("repair");
  const [revealed, setRevealed] = useState(false);
  const onRevealed = useCallback(() => setRevealed(true), []);
  const workspaceRef = useRef<HTMLElement>(null);

  const [rev, setRev] = useState(0);
  useEffect(() => {
    let alive = true;
    getOverview()
      .then((o) => { if (alive) { setOverview(o); setState("ready"); } })
      .catch((err) => { if (alive) setState(errorCode(err) === "FORBIDDEN" ? "forbidden" : "error"); });
    return () => { alive = false; };
  }, [rev]);
  const load = () => { setState("loading"); setRev((n) => n + 1); };

  const isAdmin = can(me, PERM.settingsAssets);
  const canRename = can(me, PERM.settingsLocations);
  // settings CR-006: the 3D models and the site view need `repair.building3d.view` (the API leaves them out too)
  const with3D = sees3D(me);
  const buildings = useMemo(() => overview?.buildings.filter((b) => b.floors.length > 0) ?? [], [overview]);
  // CR-027: buildings drawn in 3D (a registered shape + floor plans); stable between renders (the 3D card keys on it)
  const modelBuildings = useMemo(() => with3D ? buildings.filter((b) => b.hasModel && hasShape(b.modelKey) && b.widthM !== null && b.depthM !== null) : [],
    [buildings, with3D]);
  const siteView = with3D && desktop && webgl && !!overview?.site.length;
  const onSite = siteView && (!!sideOf(buildingId) || !buildingId);
  const building = onSite ? null : buildings.find((b) => b.id === buildingId) ?? modelBuildings[0] ?? buildings[0];
  const sideOfBuilding = (id: string | undefined) => (overview?.site.find((s) => s.buildingId === id)?.side ?? 1) as SiteSide;
  const side: SiteSide = sideOf(buildingId) ?? sideOfBuilding(building?.id);
  const show3D = desktop && webgl && (onSite || (!!building && modelBuildings.includes(building)));
  const firstName = me.name.split(/\s+/)[0];
  // the building รายอาคาร returns to (the last one opened)
  const [lastBuilding, setLastBuilding] = useState<string | null>(null);
  const openBuilding = (id: string) => { setBuildingId(id); if (!sideOf(id)) setLastBuilding(id); };
  const pick = (v: string) => { openBuilding(v); setEditing(false); };

  // CR-051: a rename on the model updates this copy of #27 (names only — the 3D geometry stays)
  const onRenamed = (t: { kind: "building" | "room"; id: string }, name: string) => setOverview((o) => o && (t.kind === "building"
    ? {
        ...o,
        buildings: o.buildings.map((b) => (b.id === t.id ? { ...b, name } : b)),
        attention: o.attention.map((a) => (a.building.id === t.id ? { ...a, building: { ...a.building, name } } : a)),
      }
    : { ...o, attention: o.attention.map((a) => (a.room?.id === t.id ? { ...a, room: { ...a.room, name } } : a)) }));

  const goToMap = () => {
    const el = workspaceRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  // CR-055 amendment 1: hero popups — a ticket (detail or model) and the attention list
  const [choice, setChoice] = useState<TicketChoice | null>(null);
  const [focus, setFocus] = useState<ModelFocus | null>(null);
  const modelLabel = (t: TicketSummary) => {
    const b = buildings.find((x) => x.id === t.building.id);
    if (!b) return null;
    return desktop && webgl && modelBuildings.includes(b) ? "ดูที่โมเดล" : "ดูที่แปลนชั้น";
  };
  // open the ticket's building, then its floor (room lit + room card on the model; the floor sheet in the list)
  const showOnModel = (t: TicketSummary) => {
    setChoice(null);
    setEditing(false);
    openBuilding(t.building.id);
    setFocus({ buildingId: t.building.id, floorId: t.floor.id, roomId: t.room?.id ?? null, nonce: Date.now() });
    requestAnimationFrame(goToMap);
  };

  if (state === "forbidden") return <ForbiddenState />;

  const services = (["repair", "car", "room"] as const).filter((s) => s === "repair" || usesService(me, s));
  const options = onSite
    ? ([1, 2] as const).map((s) => ({ value: SITE[s], label: `ทุกอาคาร · ${SITE_SIDES[s]}` }))
    : buildings.map((b) => ({ value: b.id, label: b.name, description: !with3D || modelBuildings.includes(b) ? undefined : "ยังไม่มีโมเดล" }));

  return <div className="px-4 pb-8 lg:px-0">
    {/* page heading */}
    <div className="mt-2 mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">YOUR WORKPLACE, TOGETHER</p>
        <h1 className="font-heading text-[22px] leading-normal font-semibold tracking-tight sm:text-2xl">พื้นที่พร้อม งานก็พร้อม</h1>
      </div>
      <DashboardDate />
    </div>

    {state === "error" && <ErrorState variant="inline" title="โหลดภาพรวมไม่สำเร็จ" onRetry={load} className="mb-5" />}

    {/* CR-055: BAM hero left · greeting, the 3 numbers and the service cards right */}
    <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(440px,2fr)_minmax(0,3fr)] lg:gap-5.5">
      <AdminHero name={firstName} overview={overview} failed={state === "error"} onGoToMap={goToMap} onRevealed={onRevealed}
        onOpenTicket={(ticket) => setChoice({ kind: "ticket", ticket })}
        onOpenAttention={() => overview && setChoice({ kind: "list", tickets: overview.attention })} />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-heading text-lg font-semibold sm:text-xl">{greeting()} คุณ{firstName}</h2>
          <p className="text-xs text-muted-foreground">ภาพรวมงานซ่อม · ทุกอาคาร</p>
        </div>
        {/* the numbers card takes any height left over, so the service cards stay as tall as their content */}
        <section aria-label="ภาพรวมงานซ่อมทุกอาคาร" className="grid flex-1 grid-cols-3 items-center rounded-2xl border bg-card px-1 py-4 shadow-card sm:px-2 sm:py-5">
          {!overview ? [...Array(3)].map((_, i) => <div key={i} className="px-3 sm:px-4"><Skeleton className="h-20" /></div>) : <>
            <Metric href={`${QUEUE}?tab=assess`} label="แจ้งซ่อมวันนี้" value={overview.counts.reportedToday} />
            <Metric href={QUEUE} label="งานค้างทั้งหมด" value={overview.counts.open} tone="primary" />
            <Metric href={`${QUEUE}?tab=repair`} label="เลยกำหนดเสร็จ" value={overview.counts.overdue} tone={overview.counts.overdue > 0 ? "attention" : undefined} />
          </>}
        </section>
        <p className="text-xs text-muted-foreground">เลือกบริการที่อยากดูแลวันนี้</p>
        <div role="group" aria-label="เลือกบริการ" className={cn("grid gap-2 sm:gap-2.5", services.length === 3 ? "grid-cols-3" : services.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {services.map((s) => <ServiceCard key={s} service={s} picked={rail === s} onPick={() => setRail(s)} />)}
        </div>
      </div>
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4.5">
      {/* building card */}
      <section ref={workspaceRef} tabIndex={-1} aria-labelledby="map-title" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-card outline-none">
        <div className="px-4 pt-4.5 pb-3 sm:px-5">
          <h2 id="map-title" className="font-heading text-[17px] font-semibold">อาคารและพื้นที่</h2>
          <p className="text-xs text-muted-foreground">ดูงานซ่อมที่ค้างอยู่ตามอาคาร ชั้น และห้อง</p>
        </div>
        {buildings.length > 0 && <div className="flex flex-wrap items-center gap-2.5 px-4 pb-4 sm:px-5">
          {siteView && <div role="group" aria-label="มุมมองแปลน" className="flex h-11 rounded-lg border bg-muted/50 p-1">
            {([["site", "ภาพรวม"], ["building", "รายอาคาร"]] as const).map(([k, label]) => {
              const on = (k === "site") === onSite;
              return <button key={k} type="button" aria-pressed={on}
                onClick={() => pick(k === "site" ? SITE[side] : (lastBuilding ?? modelBuildings[0]?.id ?? buildings[0].id))}
                className={cn("rounded-md px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  on ? "bg-card text-primary shadow-card" : "text-muted-foreground hover:text-foreground")}>{label}</button>;
            })}
          </div>}
          <div className="min-w-0 flex-1 basis-56 sm:max-w-72">
            <Picker id="s29-place" title={onSite ? "ฝั่ง" : "อาคาร"} placeholder="เลือกอาคาร" icon={Building2} value={building?.id ?? SITE[side]} onValueChange={pick} options={options} />
          </div>
          {isAdmin && show3D && <Button aria-pressed={editing} onClick={() => setEditing((e) => !e)} variant={editing ? "secondary" : "default"} className="ml-auto h-11">
            {editing ? <Check aria-hidden /> : <Move aria-hidden />}{editing ? "เสร็จสิ้น" : "จัดวางอุปกรณ์"}
          </Button>}
        </div>}
        {!overview ? <Skeleton className="h-60 rounded-none lg:h-140" />
          : show3D ? <div className="h-140 border-t">
              {/* Building the WebGL scene blocks the main thread. Wait until the greeting finishes (or the
                  hero scrolls out of view) so its finer sprite frames can actually be painted. */}
              {revealed ? <BuildingCard buildings={modelBuildings} site={overview.site} buildingId={building?.id ?? null}
                side={side} onOpenBuilding={openBuilding} onShowSite={(s) => setBuildingId(SITE[s])} canEdit={isAdmin} editing={editing}
                canRename={canRename} onRenamed={onRenamed} focus={focus} />
                : <Skeleton className="size-full rounded-none" />}
            </div>
          : building ? <FloorList embedded building={building} focus={focus?.buildingId === building.id ? focus : null} note={!with3D ? undefined : desktop
              ? (webgl ? "อาคารนี้ยังไม่มีโมเดล 3 มิติ" : "เบราว์เซอร์นี้แสดงภาพ 3 มิติไม่ได้")
              : "ภาพ 3 มิติและการแก้ชื่อบนแปลนใช้ได้บนคอมพิวเตอร์"} />
          : <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">ยังไม่มีอาคารที่มีข้อมูลชั้น</p>}
        {overview && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
          <span>{buildings.length} อาคาร · งานค้าง {overview.counts.open}</span>
          {show3D && <span>{canRename ? "กดอาคารเพื่อดูรายชั้น · กดชื่ออาคารหรือห้องบนแปลนเพื่อแก้ชื่อ" : "กดอาคารเพื่อดูรายชั้น · กดห้องบนแปลนเพื่อดูงานในห้อง"}</span>}
        </div>}
      </section>

      {/* right column */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
        {rail === "repair" ? <>
          <RepairPanel overview={overview} />
          {/* CR-055: shown once BAM has opened the plan (at once with reduced motion) */}
          {revealed && <AttentionPanel overview={overview} />}
        </> : <FuturePanel service={rail} />}
      </div>
    </div>

    <TicketChoiceDialog choice={choice} onClose={() => setChoice(null)} onShowOnModel={showOnModel} modelLabel={modelLabel} queueHref={QUEUE} />
  </div>;
}

/** One of the 3 numbers (CR-055 draft `.hero-stat`): label, number, `งาน · ทุกอาคาร` → S11. */
function Metric({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "primary" | "attention" }) {
  return <Link href={href} className="group flex min-h-20 flex-col justify-center border-r px-3 py-1 outline-none last:border-r-0 focus-visible:ring-3 focus-visible:ring-ring/40 sm:px-5">
    <span className="text-xs leading-snug text-muted-foreground">{label}</span>
    <span className={cn("text-[28px] leading-tight font-semibold tracking-tight tabular-nums group-hover:underline sm:text-[34px]",
      tone === "primary" && "text-primary", tone === "attention" && "text-attention")}>{value}</span>
    <span className="text-[11px] text-muted-foreground">งาน · ทุกอาคาร</span>
  </Link>;
}

const SERVICE_TEXT: Record<Rail, { title: string; sub: string; tint: string }> = {
  repair: { title: "ระบบแจ้งซ่อม", sub: "ติดตามงานและดูแลอุปกรณ์", tint: "bg-svc-repair/10 text-svc-repair" },
  car: { title: "ระบบจองรถ", sub: "การเดินทางและรถส่วนกลาง", tint: "bg-svc-car/10 text-svc-car" },
  room: { title: "ระบบจองห้องประชุม", sub: "พื้นที่สำหรับการประชุม", tint: "bg-svc-room/10 text-svc-room" },
};

/**
 * Service card (CR-055 amendment 1 = the owner draft output/admin-home-v2 `.daily-column .service`): icon, title,
 * sub-line (+ `ยังไม่เปิดใช้งาน`); the picked one has a primary outline, a 1px ring and a bottom bar, and drives the
 * right column. Hover lifts the card 4px with a soft shadow (the arrow nudges right); none under reduced motion.
 */
function ServiceCard({ service, picked, onPick }: { service: Service; picked: boolean; onPick: () => void }) {
  const Icon = SERVICES[service].icon;
  const t = SERVICE_TEXT[service];
  return <button type="button" aria-pressed={picked} onClick={onPick}
    className={cn("s29-service", "svc-card group relative flex min-w-0 flex-col items-start gap-2.5 rounded-xl border bg-card px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:px-3.75 sm:py-3.25",
      picked ? "svc-card-on border-primary/55" : "hover:border-primary/40")}>
    <span aria-hidden className={cn("grid size-8.25 shrink-0 place-items-center rounded-[10px]", t.tint)}><Icon className="size-4.5" /></span>
    <span className="min-w-0">
      <b className="block text-[13px] leading-snug font-semibold">{t.title}</b>
      <small className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">{t.sub}</small>
      {service !== "repair" && <span className="mt-1.5 inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-[10.5px] font-medium whitespace-nowrap text-muted-foreground">ยังไม่เปิดใช้งาน</span>}
    </span>
    {service === "repair" && <ArrowRight className="absolute top-5 right-3.5 hidden size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary sm:block" aria-hidden />}
  </button>;
}

function Panel({ title, chip, chipTone, children, labelledBy, className }: {
  title: string; chip?: ReactNode; chipTone?: "attention"; children: ReactNode; labelledBy: string; className?: string;
}) {
  return <section aria-labelledby={labelledBy} className={cn("overflow-hidden rounded-2xl border bg-card shadow-card", className)}>
    <div className="flex items-center justify-between gap-2.5 px-4.5 pt-4.5 pb-3">
      <h2 id={labelledBy} className="font-heading text-base font-semibold">{title}</h2>
      {chip !== undefined && <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap tabular-nums",
        chipTone === "attention" ? "bg-attention/10 text-attention" : "bg-muted text-muted-foreground")}>{chip}</span>}
    </div>
    {children}
  </section>;
}

function RepairPanel({ overview }: { overview: Overview | null }) {
  const c = overview?.counts;
  const rows = c ? [
    { href: `${QUEUE}?tab=assess`, n: c.awaitingAssessment, label: "รับเรื่อง", sub: oldestText(c), dot: "bg-status-new" },
    { href: `${QUEUE}?tab=repair`, n: c.inRepair, label: "กำลังดำเนินการ", sub: `เลยกำหนด ${c.overdue} · ส่งกลับ ${c.reworking}`, dot: "bg-status-in-progress" },
    { href: `${QUEUE}?tab=rating`, n: c.awaitingRating, label: "รอประเมินตรวจงาน", sub: autoCloseSoonest(c), dot: "bg-status-resolved" },
    { href: `${QUEUE}?tab=closed`, n: c.closedLast7Days, label: "ปิดแล้ว 7 วัน", sub: c.ratingAvgLast7Days !== null ? `คะแนนเฉลี่ย ${c.ratingAvgLast7Days.toFixed(1)}` : "ยังไม่มีคะแนน", dot: "bg-status-closed" },
  ] : [];
  return <Panel title="ภาพรวมงานซ่อม" chip="ทุกอาคาร" labelledBy="repair-title">
    {!c ? <div className="space-y-2 px-4.5 pb-4.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
      : <div className="px-4.5 pb-2">
          {rows.map((r) => <Link key={r.label} href={r.href} className="group flex items-center gap-2.5 border-t py-3 outline-none first:border-t-0 focus-visible:ring-3 focus-visible:ring-ring/40">
            <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 self-start rounded-sm", r.dot)} />
            <span className="min-w-0 flex-1 text-[13px] group-hover:text-primary">{r.label}{r.sub && <small className="mt-0.5 block text-[11px] text-muted-foreground">{r.sub}</small>}</span>
            <span className="text-lg font-semibold tabular-nums">{r.n}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>)}
        </div>}
  </Panel>;
}

function AttentionPanel({ overview }: { overview: Overview | null }) {
  const list = overview?.attention.slice(0, 4);
  const n = overview?.attention.length;
  return <Panel title="งานที่ควรติดตาม" chip={n !== undefined ? `${n} งาน` : undefined} chipTone={n ? "attention" : undefined} labelledBy="attention-title" className="flex flex-col">
    {!list ? <div className="space-y-2 px-4.5 pb-4.5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      : list.length === 0 ? <div className="flex items-center gap-4 px-4.5 pb-4">
          <span aria-hidden className="grid shrink-0 place-items-end overflow-hidden rounded-xl bg-primary px-2 pt-2"><Mascot pose="review" size={56} /></span>
          <p className="text-sm text-muted-foreground">ไม่มีงานที่ต้องติดตาม</p>
        </div>
      : <div className="px-4.5">
          {list.map((t) => {
            const reason = attentionReason(t);
            return <Link key={t.id} href={ticketHref(t.id)} className="group block border-t py-3.5 outline-none first:border-t-0 first:pt-0.5 focus-visible:ring-3 focus-visible:ring-ring/40">
              {reason ? <span className={cn("inline-flex h-5.5 items-center rounded-sm px-1.5 text-xs font-medium", REASON_CHIP[reason].className)}>{REASON_CHIP[reason].label}</span>
                : <PriorityIndicator priority={t.priority} className="text-xs" />}
              <b className="mt-1.5 mb-0.5 block truncate text-[13px] font-semibold group-hover:text-primary">{ticketTitle(t)}</b>
              <small className="block truncate text-[11px] text-muted-foreground">{t.building.name} {placeLine(t)}</small>
            </Link>;
          })}
        </div>}
    <Link href={QUEUE} className="mt-auto flex items-center gap-1.5 border-t px-4.5 py-3 text-[13px] font-semibold text-primary outline-none hover:bg-muted/50 focus-visible:bg-muted">
      ดูรายการงานทั้งหมด<ArrowRight className="size-3.5" aria-hidden />
    </Link>
  </Panel>;
}

/** Car / room picked (CR-017: no numbers until those modules exist). */
function FuturePanel({ service }: { service: "car" | "room" }) {
  const Icon = SERVICES[service].icon;
  const t = SERVICE_TEXT[service];
  return <section aria-label={t.title} className="rounded-2xl border bg-card p-5 shadow-card md:col-span-2 lg:col-span-1">
    <span aria-hidden className={cn("mb-3 grid size-11 place-items-center rounded-xl", t.tint)}><Icon className="size-5" /></span>
    <h2 className="font-heading text-base font-semibold">{t.title}</h2>
    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">ยังไม่เปิดใช้งาน ภาพรวมของบริการนี้จะแสดงที่นี่เมื่อระบบพร้อมใช้งาน</p>
    <span className="mt-3 inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">ยังไม่มีข้อมูลบริการ</span>
  </section>;
}
