"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, ChevronRight, HardHat, Loader2, Pencil, Phone, Plus, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, ForbiddenState } from "@/components/shared/states";
import { useCurrentUser } from "@/components/shared/me-provider";
import { can, PERM } from "@/lib/platform/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createContractor, createContractorType, getContractor, getContractorJobs, getContractors, getContractorTypes, updateContractor } from "../api";
import { contractorFieldMessages, contractorNameTaken, errorCode, errorMessage, fieldErrors } from "../errors";
import type { Contractor, ContractorJob, ContractorNameTakenDetails, Ref } from "../types";
import { Stars } from "./ticket-ui";
import { ticketHref } from "./ticket-presentation";
import { DataTable, ListCard, ListFooter, ListItemCard, ListSkeleton, ListToolbar, ResultBar, type Column } from "./list-ui";

// S18 ช่างภายนอก (F24, CR-005): the technician adds / edits contractors and their types;
// whoever sees every ticket (`repair.ticket.view_all`) sees job history and scores; `repair.contractor.manage` edits.
// CR-042: the list shows 5 contractors per page — search, แสดงที่ปิดใช้งาน and the page (?page=) go to #15, the API pages.

const LIST_PAGE_SIZE = 5;


function Score({ c }: { c: Pick<Contractor, "avgRating" | "ratedCount"> }) {
  if (c.avgRating === null) return <span className="text-xs text-muted-foreground">ยังไม่มีคะแนน</span>;
  return <span className="inline-flex items-center gap-1.5 text-sm"><Stars value={Math.round(c.avgRating)} label={false} /><span className="font-semibold">{c.avgRating.toFixed(1)}</span><span className="text-xs text-muted-foreground">({c.ratedCount} งาน)</span></span>;
}

function ShopName({ c }: { c: Contractor }) {
  return <div className="flex min-w-0 items-center gap-3">
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><HardHat className="size-5" /></span>
    <div className="min-w-0">
      <span className="flex items-center gap-2"><Link href={`/repair/contractors/${c.id}`} className="truncate text-[15px] leading-6 font-semibold outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/30">{c.name}</Link>{!c.isActive && <Badge variant="secondary">ปิดใช้งาน</Badge>}</span>
      <span className="block truncate text-xs leading-5 text-muted-foreground">{c.types.map((t) => t.name).join(" · ") || "ยังไม่ระบุประเภท"}</span>
    </div>
  </div>;
}

function Contact({ c }: { c: Contractor }) {
  if (!c.contactName && !c.phone) return <span className="text-sm text-muted-foreground">ยังไม่มีผู้ติดต่อ</span>;
  return <>
    {c.contactName && <span className="flex items-center gap-1.5 truncate text-sm"><UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />{c.contactName}</span>}
    {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:underline"><Phone className="size-3.5 shrink-0" aria-hidden />{c.phone}</a>}
  </>;
}

function OpenShop({ c, dense }: { c: Contractor; dense?: boolean }) {
  return <Link href={`/repair/contractors/${c.id}`} aria-label={`ดูข้อมูล ${c.name}`}
    className={cn("inline-flex items-center gap-0.5 rounded-lg border bg-card pr-2 pl-3 text-sm font-medium whitespace-nowrap text-primary outline-none hover:border-primary/40 hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30", dense ? "h-9" : "h-11")}>
    ดูข้อมูล<ChevronRight className="size-4" aria-hidden />
  </Link>;
}

const CONTRACTOR_COLUMNS: Column<Contractor>[] = [
  { key: "name", header: "ร้าน / บริษัท", className: "w-[34%]", cell: (c) => <ShopName c={c} /> },
  { key: "contact", header: "ผู้ติดต่อ", className: "w-[22%]", cell: (c) => <Contact c={c} /> },
  { key: "score", header: "คะแนน", className: "w-[20%]", cell: (c) => <Score c={c} /> },
  { key: "jobs", header: "จำนวนงาน", className: "w-[12%]", cell: (c) => <span className="text-sm tabular-nums">{c.jobCount} งาน</span> },
  { key: "open", header: "รายละเอียด", className: "w-[12%] text-right", cell: (c) => <OpenShop c={c} dense /> },
];

function ContractorCard({ c }: { c: Contractor }) {
  return <ListItemCard>
    <ShopName c={c} />
    <div className="mt-2.5 space-y-0.5 pl-13"><Contact c={c} /></div>
    <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><Score c={c} /><span className="text-xs text-muted-foreground">· {c.jobCount} งาน</span></span>
      <OpenShop c={c} />
    </div>
  </ListItemCard>;
}

export function ContractorsScreen() {
  const me = useCurrentUser();
  const params = useSearchParams();
  // Search, แสดงที่ปิดใช้งาน and the page live in the URL, so one change sends one request (a new filter = page 1).
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const query = (params.get("q") ?? "").slice(0, 50);
  const inactive = params.get("inactive") === "1";
  const [q, setQ] = useState(query);
  // `key` = the request the list answers; a different key (new page / search) shows the skeleton.
  const [list, setList] = useState<{ key: string; items: Contractor[]; total: number }>();
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const change = useCallback((values: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(values)) { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const goTo = (p: number) => change({ page: p > 1 ? String(p) : null });
  useEffect(() => {
    const next = q.trim();
    if (next === query) return;
    const t = window.setTimeout(() => change({ q: next, page: null }), 300);
    return () => window.clearTimeout(t);
  }, [q, query, change]);
  const key = `${query}|${inactive}|${page}`;
  useEffect(() => {
    if (!can(me, PERM.ticketViewAll)) return;
    let active = true;
    getContractors({ q: query || undefined, includeInactive: inactive, page, pageSize: LIST_PAGE_SIZE }).then(
      (res) => { if (active) { setList({ key, items: res.items, total: res.meta.total }); setError(undefined); } },
      (err: unknown) => { if (active) setError(err); });
    return () => { active = false; };
  }, [key, query, inactive, page, revision, me]);
  if (!can(me, PERM.ticketViewAll)) return <><PageHeader title="ช่างภายนอก" variant="bar" /><ForbiddenState /></>;
  const canEdit = can(me, PERM.contractorManage);
  // PageHeader shows `action` on phones and `search` on desktop: the same button in both.
  const add = canEdit ? <Button size="sm" onClick={() => setFormOpen(true)}><Plus aria-hidden />เพิ่มช่างภายนอก</Button> : undefined;
  return <>
    <PageHeader title="ช่างภายนอก" variant="service" service="repair" subtitle="ประวัติงานและคะแนนของช่างนอกระบบ" action={add} search={add} />
    {/* CR-046: the shared list layout (list-ui) — search + แสดงที่ปิดใช้งาน, table from lg, cards below. */}
    <div className="px-4 py-4 lg:px-0 lg:py-0">
      <ListCard title="รายชื่อช่างภายนอก" count={list?.key === key ? list.total : undefined}>
        <ListToolbar search={{ label: "ค้นหาชื่อร้าน หรือผู้ติดต่อ", value: q, onChange: setQ }}
          extra={<label className="flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm"><input type="checkbox" checked={inactive} onChange={(e) => change({ inactive: e.target.checked ? "1" : null, page: null })} className="size-4 accent-primary" />
            <span className="hidden sm:inline">แสดงที่ปิดใช้งาน</span><span className="sm:hidden">ปิดใช้งาน</span></label>} />
        {error !== undefined ? (errorCode(error) === "FORBIDDEN" ? <ForbiddenState /> : <div className="border-t px-4 py-6 lg:px-6"><ErrorState variant="inline" title="โหลดรายชื่อช่างภายนอกไม่สำเร็จ" onRetry={() => setRevision((r) => r + 1)} /></div>)
          : list?.key !== key ? <ListSkeleton />
          : <>
            <ResultBar>พบ {list.total} ร้าน</ResultBar>
            <DataTable caption="ช่างภายนอก" rows={list.items} rowKey={(c) => c.id} columns={CONTRACTOR_COLUMNS} card={(c) => <ContractorCard c={c} />}
              empty={page > 1 ? { hint: "ไม่มีรายการในหน้านี้", action: <Button variant="outline" onClick={() => goTo(1)}><RotateCcw aria-hidden />กลับหน้าแรก</Button> }
                : query ? { hint: `ไม่พบช่างภายนอกที่ตรงกับ "${query}"` }
                : { hint: canEdit ? "ยังไม่มีช่างภายนอก เพิ่มได้จากปุ่มด้านบน หรือตอนบันทึกผลซ่อม" : "ยังไม่มีช่างภายนอก" }} />
            {list.items.length > 0 && <ListFooter page={page} pageSize={LIST_PAGE_SIZE} total={list.total} unit="ร้าน" onPage={(p) => { goTo(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
          </>}
      </ListCard>
    </div>
    {canEdit && <ContractorFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={() => { setFormOpen(false); setRevision((r) => r + 1); toast.success("เพิ่มช่างภายนอกแล้ว"); }} />}
  </>;
}

export function ContractorDetailScreen({ id }: { id: string }) {
  const me = useCurrentUser();
  const [contractor, setContractor] = useState<Contractor>();
  const [jobs, setJobs] = useState<{ items: ContractorJob[]; total: number }>();
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!can(me, PERM.ticketViewAll)) return;
    let active = true;
    Promise.all([getContractor(id), getContractorJobs(id, 1, 20)]).then(([c, j]) => {
      if (active) { setContractor(c); setJobs({ items: j.items, total: j.meta.total }); setPage(1); setError(undefined); }
    }, (err: unknown) => { if (active) setError(err); });
    return () => { active = false; };
  }, [id, revision, me]);
  async function more() {
    setMoreBusy(true);
    try { const next = await getContractorJobs(id, page + 1, 20); setPage(page + 1); setJobs((old) => ({ items: [...(old?.items ?? []), ...next.items], total: next.meta.total })); }
    catch { toast.error("โหลดเพิ่มไม่สำเร็จ ลองอีกครั้ง"); }
    finally { setMoreBusy(false); }
  }
  const header = <PageHeader title="ช่างภายนอก" variant="bar" backHref="/repair/contractors" />;
  if (!can(me, PERM.ticketViewAll)) return <>{header}<ForbiddenState /></>;
  if (error !== undefined) {
    return <>{header}{errorCode(error) === "CONTRACTOR_NOT_FOUND" ? <ForbiddenState title="ไม่พบช่างภายนอกนี้" /> : errorCode(error) === "FORBIDDEN" ? <ForbiddenState /> : <ErrorState onRetry={() => setRevision((r) => r + 1)} />}</>;
  }
  if (!contractor || !jobs) return <>{header}<div className="space-y-3 px-4 py-4 lg:px-0"><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-60 w-full rounded-xl" /></div></>;
  const canEdit = can(me, PERM.contractorManage);
  return <>{header}
    <div className="space-y-3 px-4 py-4 lg:px-0 lg:py-0">
      <Card className="gap-3 p-4 shadow-card lg:p-5">
        <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-primary"><HardHat className="size-6" aria-hidden /></span>
          <div className="min-w-0 flex-1"><h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold">{contractor.name}{!contractor.isActive && <Badge variant="secondary">ปิดใช้งาน</Badge>}</h2>
            <div className="mt-1 flex flex-wrap gap-1">{contractor.types.map((t) => <Badge key={t.id} variant="outline">{t.name}</Badge>)}</div></div>
          {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden />แก้ไข</Button>}</div>
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">คะแนนเฉลี่ย</p><Score c={contractor} /></div>
          <div><p className="text-xs text-muted-foreground">จำนวนงาน</p><p className="font-heading text-lg font-semibold">{contractor.jobCount}</p></div>
          <div className="space-y-1 text-sm">{contractor.contactName && <p className="flex items-center gap-1.5"><UserRound className="size-4 text-muted-foreground" aria-hidden />{contractor.contactName}</p>}
            {contractor.phone && <p className="flex items-center gap-1.5"><Phone className="size-4 text-muted-foreground" aria-hidden /><a href={`tel:${contractor.phone}`} className="underline-offset-2 hover:underline">{contractor.phone}</a></p>}</div>
        </div>
        {contractor.note && <p className="whitespace-pre-wrap rounded-sm bg-muted/60 p-3 text-sm">{contractor.note}</p>}
      </Card>
      <Card className="gap-0 p-0 shadow-card"><h2 className="px-4 pt-4 pb-2 font-heading text-base font-semibold">ประวัติงาน ({jobs.total})</h2>
        {jobs.items.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">ยังไม่มีงานที่ช่างเจ้านี้ทำ</p>
          : <ul className="divide-y">{jobs.items.map((j) => <li key={j.ticketId}><Link href={ticketHref(j.ticketId)} className="flex items-start gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className="min-w-0 flex-1 space-y-1"><span className="block text-sm font-semibold">{j.ticketNo} · {j.category.name}</span>
              <span className="block text-xs text-muted-foreground">{j.resolvedAt ? `เสร็จเมื่อ ${formatDateTime(j.resolvedAt)}` : "ยังไม่เสร็จ"}</span>
              {j.contractorRating ? <Stars value={j.contractorRating} /> : <span className="text-xs text-muted-foreground">ไม่มีคะแนน</span>}
              {j.contractorRatingComment && <span className="block whitespace-pre-wrap text-sm">{j.contractorRatingComment}</span>}
              {j.reporterRating && <span className="block text-xs text-muted-foreground">ผู้แจ้งให้ {j.reporterRating} ดาว</span>}</span>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /></Link></li>)}</ul>}
        {jobs.items.length < jobs.total && <div className="p-3"><Button variant="outline" className="w-full" disabled={moreBusy} onClick={more}>{moreBusy && <Loader2 className="animate-spin" aria-hidden />}โหลดเพิ่ม</Button></div>}
      </Card>
    </div>
    {canEdit && <ContractorFormDialog contractor={contractor} open={editing} onOpenChange={setEditing} onSaved={(c) => { setEditing(false); setContractor(c); toast.success("บันทึกแล้ว"); }} />}
  </>;
}

// ---- add / edit (technician) ----

/** `onPickExisting` (S17 เพิ่มช่างภายนอกใหม่): a name that an active contractor has offers เลือกร้านนี้ instead of ดูร้านนี้ (CR-023). */
export function ContractorFormDialog({ contractor, open, onOpenChange, onSaved, onPickExisting }: {
  contractor?: Contractor; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (c: Contractor) => void;
  onPickExisting?: (c: Contractor) => void;
}) {
  const [types, setTypes] = useState<Ref[]>();
  const [values, setValues] = useState({ name: "", contactName: "", phone: "", note: "", typeIds: [] as string[], isActive: true });
  const [newType, setNewType] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [taken, setTaken] = useState<ContractorNameTakenDetails | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    getContractorTypes().then(setTypes, () => setTypes([]));
  }, [open]);
  // Reset each time the dialog opens — the parent opens it (`open`), so onOpenChange does not fire on open.
  const [seen, setSeen] = useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setValues(contractor
        ? { name: contractor.name, contactName: contractor.contactName ?? "", phone: contractor.phone ?? "", note: contractor.note ?? "", typeIds: contractor.types.map((t) => t.id), isActive: contractor.isActive }
        : { name: "", contactName: "", phone: "", note: "", typeIds: [], isActive: true });
      setNewType(""); setErrors({}); setTaken(null);
    }
  }
  const toggle = (id: string) => setValues((v) => ({ ...v, typeIds: v.typeIds.includes(id) ? v.typeIds.filter((x) => x !== id) : [...v.typeIds, id] }));
  async function addType() {
    const name = newType.trim();
    if (!name) return;
    setAddingType(true);
    try {
      const t = await createContractorType(name);
      setTypes((old) => old?.some((x) => x.id === t.id) ? old : [...(old ?? []), t].sort((a, b) => a.name.localeCompare(b.name, "th")));
      setValues((v) => ({ ...v, typeIds: v.typeIds.includes(t.id) ? v.typeIds : [...v.typeIds, t.id] }));
      setNewType(""); setErrors((e) => { const n = { ...e }; delete n.typeIds; return n; });
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setAddingType(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!values.name.trim()) local.name = "กรุณากรอกชื่อร้าน / บริษัท";
    if (values.typeIds.length === 0) local.typeIds = "เลือกประเภทอย่างน้อย 1 ประเภท";
    if (Object.keys(local).length) { setErrors(local); return; }
    setBusy(true); setErrors({});
    const req = { name: values.name.trim(), typeIds: values.typeIds, contactName: values.contactName.trim(), phone: values.phone.trim(), note: values.note.trim(), isActive: values.isActive };
    try { onSaved(contractor ? await updateContractor(contractor.id, req) : await createContractor(req)); }
    catch (err) {
      // CR-023: the name belongs to another contractor — offer that one (re-activate it when inactive).
      const owner = contractorNameTaken(err);
      const fields = owner ? { name: owner.isActive ? "มีช่างภายนอกชื่อนี้แล้ว" : "มีร้านชื่อนี้แต่ปิดใช้งานอยู่ — เปิดใช้งานร้านเดิมแทนการเพิ่มใหม่" } : fieldErrors(err, contractorFieldMessages);
      setTaken(owner);
      if (Object.keys(fields).length) setErrors(fields); else toast.error(errorMessage(err));
    } finally { setBusy(false); }
  }
  async function pickExisting() {
    if (!taken || !onPickExisting) return;
    setBusy(true);
    try { onPickExisting(await getContractor(taken.contractorId)); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }
  const field = (name: "name" | "contactName" | "phone", label: string, opts: { required?: boolean; max: number; type?: string; placeholder?: string }) =>
    <div className="space-y-1.5"><label htmlFor={`contractor-${name}`} className="text-sm font-medium">{label}{opts.required && <span className="text-destructive">*</span>}</label>
      <Input id={`contractor-${name}`} type={opts.type} value={values[name]} maxLength={opts.max} placeholder={opts.placeholder} onChange={(e) => { setValues((v) => ({ ...v, [name]: e.target.value })); if (name === "name") setTaken(null); }} aria-invalid={!!errors[name]} className="h-11" />
      {errors[name] && <p role="alert" className="flex items-center gap-1 text-sm text-destructive"><AlertCircle className="size-4" aria-hidden />{errors[name]}</p>}</div>;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <DialogHeader><DialogTitle>{contractor ? "แก้ไขช่างภายนอก" : "เพิ่มช่างภายนอก"}</DialogTitle><DialogDescription>ข้อมูลนี้เห็นเฉพาะช่างและ Admin</DialogDescription></DialogHeader>
        {field("name", "ชื่อร้าน / บริษัท", { required: true, max: 100, placeholder: "เช่น ร้านแอร์เย็นฉ่ำ หรือ ร้านแอร์เย็นฉ่ำ สาขาบางนา" })}
        {taken && <div className="-mt-2">{taken.isActive && onPickExisting
          ? <Button type="button" variant="link" className="h-9 px-0" disabled={busy} onClick={pickExisting}>เลือกร้านนี้</Button>
          : <Button asChild variant="link" className="h-9 px-0"><Link href={`/repair/contractors/${taken.contractorId}`} onClick={() => onOpenChange(false)}>{taken.isActive ? "ดูร้านนี้" : "ไปหน้าร้านนี้"}</Link></Button>}</div>}
        <fieldset className="space-y-2"><legend className="text-sm font-medium">ประเภท<span className="text-destructive">*</span> <span className="font-normal text-muted-foreground">เลือกได้หลายประเภท</span></legend>
          {!types ? <Skeleton className="h-10 w-full" /> : <div className="flex flex-wrap gap-2">{types.map((t) => {
            const on = values.typeIds.includes(t.id);
            return <button key={t.id} type="button" aria-pressed={on} onClick={() => toggle(t.id)} className={cn("inline-flex min-h-10 items-center gap-1 rounded-full border px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-foreground bg-foreground text-white" : "border-input bg-card")}>{on && <Check className="size-4" aria-hidden />}{t.name}</button>;
          })}{types.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีประเภท เพิ่มด้านล่างได้เลย</p>}</div>}
          <div className="flex gap-2"><Input aria-label="เพิ่มประเภทใหม่" placeholder="เพิ่มประเภทใหม่ เช่น แอร์" value={newType} maxLength={50} onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addType(); } }} className="h-10" />
            <Button type="button" variant="outline" onClick={addType} disabled={addingType || !newType.trim()}>{addingType ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}เพิ่ม</Button></div>
          {errors.typeIds && <p role="alert" className="flex items-center gap-1 text-sm text-destructive"><AlertCircle className="size-4" aria-hidden />{errors.typeIds}</p>}
        </fieldset>
        {field("contactName", "ผู้ติดต่อ", { max: 100 })}
        {field("phone", "เบอร์โทร", { max: 30, type: "tel" })}
        <div className="space-y-1.5"><label htmlFor="contractor-note" className="text-sm font-medium">หมายเหตุ</label>
          <Textarea id="contractor-note" value={values.note} maxLength={500} rows={3} onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))} /></div>
        {contractor && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={values.isActive} onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))} className="size-4 accent-primary" />ใช้งานอยู่ (ปิดไว้เมื่อเลิกจ้าง ประวัติยังอยู่)</label>}
        <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>ยกเลิก</Button>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden />}บันทึก</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
