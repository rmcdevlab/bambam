"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/http";

// CR-051: rename a building (its tag on the model) or a room (its card on the floor plan) from S29. Saving goes
// through `renamePlace` (repair api → settings #15 / #27; the server checks `settings.locations.manage` and audits).
// Rules = settings #15 / #27: required, ≤ 100, unique (buildings: among buildings; rooms: on the same floor).

const MAX = 100;

function renameError(err: unknown, kind: "building" | "room") {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === "NAME_TAKEN") return kind === "building" ? "มีอาคารชื่อนี้แล้ว" : "ชั้นนี้มีห้องชื่อนี้แล้ว";
  if (code === "VALIDATION_FAILED") return err instanceof ApiError && err.fields.name === "TOO_LONG" ? `ชื่อยาวได้ไม่เกิน ${MAX} ตัวอักษร` : "กรุณากรอกชื่อ";
  if (code === "VERSION_CONFLICT") return "ข้อมูลนี้เพิ่งถูกแก้โดยผู้ใช้อื่น ลองบันทึกอีกครั้ง";
  if (code === "BUILDING_NOT_FOUND" || code === "ROOM_NOT_FOUND") return kind === "building" ? "ไม่พบอาคารนี้แล้ว" : "ไม่พบห้องนี้แล้ว";
  if (code === "FORBIDDEN") return "คุณไม่มีสิทธิ์แก้ชื่อสถานที่";
  return "บันทึกไม่สำเร็จ ลองอีกครั้ง";
}

/** Name field + ยกเลิก / บันทึกชื่อ. `onSave` resolves when the server accepted the name. */
export function RenameForm({ kind, initial, onSave, onCancel }: {
  kind: "building" | "room";
  initial: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = kind === "building" ? "ชื่ออาคาร" : "ชื่อห้อง / พื้นที่";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("กรุณากรอกชื่อ");
    if ([...n].length > MAX) return setError(`ชื่อยาวได้ไม่เกิน ${MAX} ตัวอักษร`);
    if (n === initial) return onCancel();
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
    } catch (err) {
      setError(renameError(err, kind));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} noValidate className="space-y-2">
    <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">{label}</label>
    <Input id={id} value={name} maxLength={MAX + 20} autoFocus onChange={(e) => { setName(e.target.value); setError(null); }}
      aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="h-11" />
    {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="outline" size="sm" className="h-10" onClick={onCancel} disabled={busy}>ยกเลิก</Button>
      <Button type="submit" size="sm" className="h-10" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden />}บันทึกชื่อ</Button>
    </div>
  </form>;
}
