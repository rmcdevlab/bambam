"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatLongDate } from "@/lib/format";

/** A Bangkok calendar and clock; refreshes across midnight without reloading the dashboard. */
export function DashboardDate() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000 * 30);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const parts = now ? new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", weekday: "long",
  }).formatToParts(now) : [];
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "–";
  return <time className={"s29-date"} dateTime={now?.toISOString()} aria-label={now ? formatLongDate(now) : "กำลังโหลดวันที่"}>
    <span className={"s29-calendar"} aria-hidden="true"><span>{part("month")}</span><strong>{part("day")}</strong></span>
    <span className={"s29-dateCopy"}>
      <strong>{part("weekday")} <span className="font-normal text-muted-foreground">{part("year")}</span></strong>
      <span><Clock3 aria-hidden="true" className="size-3.5" />{now ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now) : "–:–"} น. <span className="text-muted-foreground">· วันนี้</span></span>
    </span>
  </time>;
}
