# S09 — คิวงานช่าง

> **CR-050 (2026-11-17):** order moves out of the filter sheet to its own `เรียงลำดับ` button beside `ตัวกรอง` (menu: งานเก่าสุดก่อน default · งานใหม่สุดก่อน; icon only on phones, current order from `sm`); the result-bar order note is dropped. Empty list → the same table with one `ไม่มีข้อมูล` row (+ why / `ล้างตัวกรอง` / `กลับหน้าแรก`), an empty card frame on phones.

> **CR-049 (2026-11-17):** filter sheet starts with `เรียงตาม`: `งานเก่าสุดก่อน` (default, `createdAt:asc`) · `งานใหม่สุดก่อน` (`createdAt:desc`, `?sort=newest`) — not counted, no chip, kept by `ล้างตัวกรอง`. Hero line `เรียงงานตามวันที่แจ้ง · งานเก่าสุดก่อน` removed. Sheet: fixed header and buttons, only the options scroll.

> **CR-048 (2026-11-17):** `อาคาร` in the filter sheet is multi-select (`เลือกได้หลายรายการ`, `ทุกอาคาร` clears), one chip per building, `?building=a,b` → #6 / #7 `buildingId=a,b`.

> **CR-046 (2026-11-17):** layout from the owner draft `output/technician-ui/index.html`. Mascot hero (`guide`) with `งานซ่อม`, greeting and a 3-tile summary (รอเริ่มงาน · กำลังซ่อม · รอตรวจงาน; a tile opens its tab) replaces the service header and the CR-041 phone tiles. Shared list card (`list-ui` / `ticket-table`): underline step tabs (equal grid with count on phones), search `ค้นหาเลขงาน หรือสถานที่` (`q`) + `ตัวกรอง (n)` sheet — อาคาร · หมวดงาน · ความเร่งด่วน · ระยะเวลาที่แจ้ง (5 / 7 วันขึ้นไป → `createdTo`) — with removable chips and `พบ n งาน`. Desktop table: เรื่องที่แจ้ง / เลขที่งาน · สถานที่ · สถานะล่าสุด (caption: รอเริ่มดำเนินการ / คาดว่าเสร็จ or เลยกำหนด {date} / ซ่อมเสร็จ รอผู้แจ้งตรวจงาน) · ระยะเวลาที่แจ้ง · ความเร่งด่วน (`PriorityBadge` pill as on S07, no bars) · `ดูงาน ›`. Phones / tablets: one card per ticket. ระยะเวลาที่แจ้ง: clock + `n วันผ่านมาแล้ว` / `แจ้งวันนี้` + `แจ้งเมื่อ {date}`; 3–4 days orange text, 5+ days solid orange tag `n วัน · ค้างนาน`. Order (oldest first), 5 per page and permissions unchanged.

Status: APPROVED (2026-10-14) · CR-024 applied 2026-10-26 (block below)

> **CR-042 (2026-11-10, owner):** the list shows **5 tickets per page** with numbered pages (`?page=`, the S06 pager) instead of โหลดเพิ่ม; tab, อาคาร and page go to #6 (`page`, `pageSize=5`), the API pages. Footer `แสดง {from}–{to} จาก {total} งาน`. New tab / building → page 1.

> **CR-041 (2026-11-10, owner):** phones / tablets pick the step from **three equal tiles** (count + step colour dot on top, label below, may wrap; selected = filled `foreground`) instead of the segmented tabs; the อาคาร filter sits under them. Desktop keeps the toolbar card. The header action "ช่างภายนอก" is **removed** (S18 via the repair section nav).

> **CR-024 (approved 2026-10-26):** empty copy per `_common.md` §9; there is no bell (the admin-close case simply disappears on the next refetch).

> **CR-015 (approved 2026-10-19):** the list is ordered **oldest report first** (`sort=createdAt:asc`), not by priority; the priority chip on each row stays as information. Replaces 'most urgent first' below.

> **CR-009 (approved 2026-10-18):** tabs `รับเรื่อง` (`awaiting_assessment`) · `กำลังดำเนินการ` (`in_repair`, `reworking` — row badge `ส่งกลับให้แก้`) · `รอประเมินตรวจงาน` (`awaiting_rating`).


> **CR-008 (approved 2026-10-16):** restyle to the new tokens; copy `รอประเมิน` → `รอช่างรับเรื่อง`, `รอผู้แจ้งประเมิน` → `รอผู้แจ้งให้คะแนน`, `ประเมินงาน` → `รับเรื่อง`. A "วันนี้" list is a later proposal (CR-008 open question 12).


> **CR-005 (2026-10-15) — replaces this spec.** S09 is now **งานซ่อม** at `/repair/work` (`technician-work.tsx`): the one technician sees every open ticket, most urgent first then oldest. Header action "ช่างภายนอก" → S18. Segmented tabs with counts: **รอประเมิน** (`step=awaiting_assessment`) · **กำลังซ่อม** (`in_repair,reworking`) · **รอผู้แจ้งประเมิน** (`awaiting_rating`); FilterPill อาคาร ("ทุกอาคาร"). Row: thumb, title + priority, category · location, ticketNo · reporter · แจ้ง {time}, mini tracker, "คาดว่าเสร็จ {d MMM}" or red "เลยกำหนด". Paging "โหลดเพิ่ม" (20). Empty per tab; filter-empty "ไม่มีงานในอาคารนี้" + ดูทุกอาคาร. No claim, no one-job rule, no reserved card, no categories state. Mobile bottom nav: the technician's 2nd slot is "งานซ่อม".


- **Flows:** F21 (queue, building filter, claim, current job, reserved job, give back), BR-F21-1 … BR-F21-8, CR-001 (see ../../02-flows.md)
- **Persona:** technician on mobile, all day, hands busy (see ../../01-users.md)
- **Purpose of this screen (one sentence):** show the queue of my categories in queue order, my one current job on top, and let me claim the next job.
- **Route:** `/repair/queue` (`?building={id}`)
- **Mockup:** `../mockups/S09-technician-queue.html` (holding, reserved, free, filter empty, queue empty, no categories, desktop)
- **Data:** my queue (`new` tickets in my categories, not reserved for others, queue order, filter by building), my current job, my reserved job, buildings list; claim / start / give back → `modules/repair/api.ts` (names fixed in 04-api-contract.md)

## Layout — mobile first

```
┌────────────────────────────┐
│ ServiceHeader (repair, orange, curved)   │
│ (🔧) คิวงาน                    [↻] │ ← refresh icon button (white/20)
│      ระบบปรับอากาศ · ไฟฟ้าและแสงสว่าง  │ ← my categories
│┌──────────────────────────┐│ ← pinned card overlaps header, shadow-float (one of 4 states)
││ [● งานที่กำลังทำ]     รับงาน 09:20 ││
││ ไฟกะพริบ · ไฟไม่ติด            ││
││ 📍 อาคารหลัก ชั้น 3 · หน้าลิฟต์ฝั่งตะวันออก ││
││ RP-2569-000138               ││
││ [ คืนงาน ]  [ บันทึกผลซ่อม ]   ││
│└──────────────────────────┘│
│ ┌ (when also reserved) ────────┐│
│ │ ↺ มีงานส่งกลับให้แก้รออยู่ 1 งาน — เริ่มได้หลังจบงานนี้ › │
│ └──────────────────────────┘│
│ คิวงาน 12 งาน     [🏢 ทุกอาคาร ▾] │ ← H2 (18) + building filter pill (Select)
│ ⓘ จบงานปัจจุบันก่อน (บันทึกผล หรือ คืนงาน) จึงรับงานใหม่ได้ │ ← only while holding, Caption text-warning
│┌ queue list card ───────────┐│
││ 1  ▮▮▮ ฉุกเฉิน      แจ้งเมื่อ 08:52 ││ ← order number circle 28px (Prompt 600)
││    น้ำรั่ว · ท่อตัน               ││   title H3, 1 line
││    อาคารหลัก ชั้น 2 · ห้องน้ำหญิง   ││   location Small
││    ประปาและสุขภัณฑ์   [ รับงาน ] ││   category Caption + Button default sm (disabled while holding)
││────────────────────────────││
││ 2  ▮▮▮ สูง …                 ││
││ …                            ││
│└──────────────────────────┘│
│ [ โหลดเพิ่ม ]                 │
├────────────────────────────┤
│ BottomNav (no slot active; Home is the technician's entry) │
└────────────────────────────┘
```

Pinned card states (same rules on S02 technician):

| State | Card |
|---|---|
| Holding `in_progress` | badge "งานที่กำลังทำ" (status-in-progress) · title · location · ticket no · "รับงาน {time}" · "คืนงาน" (outline sm) + "บันทึกผลซ่อม" (default sm) |
| Reserved, not holding | tinted `bg-status-resolved/5 border-status-resolved/15`; badge "ส่งกลับให้แก้ · งานถัดไปของคุณ" · title · location · reason "ผู้แจ้ง: {reason}" (2 lines max) · button "เริ่มงาน" (default sm, full width) |
| Holding and reserved | holding card + the one-line strip under it (links to the reserved ticket's S07) |
| Neither | no pinned card; the list starts right under the header (the header gets its normal bottom padding) |

Queue rows show tickets in **queue order** (admin order, else priority then report time — BR-F22-1/2). The filter only hides rows; it never reorders (BR-F21-7). Order numbers are the position in my full queue, so with a filter they may skip (e.g. 1, 4, 7).

Desktop (≥1024px): sidebar ("คิวงาน" active) + top bar (title "คิวงาน", subtitle my categories). Grid `minmax(0,1fr) 340px`:
- left `Card`: header "คิวงาน {n} งาน" + building `Select` (right) + holding note; `Table`: ลำดับ · เรื่อง / สถานที่ · หมวดงาน · ความเร่งด่วน · แจ้งเมื่อ · (รับงาน button)
- right column: pinned card (same states) + reserved strip

## Components

| Area | Component (design-system.md) | Notes |
|---|---|---|
| Header | `ServiceHeader` repair + `Button` icon (refresh, `RefreshCw`) | mobile |
| Pinned card | `Card` `shadow-float` + `Badge` + `Button`s | |
| Filter | `Select` styled as pill (`Building2` icon) | options: ทุกอาคาร + buildings that exist |
| Holding note | Caption with `Info` icon, `text-warning` | |
| Queue list | list card rows with order circle + `PriorityIndicator` + `Button` sm | rows are links to S07; the button stops propagation |
| Claim | claim dialog (`_common.md` §7) | |
| Give back | give-back dialog (`_common.md` §7) | |
| Paging | `Button` outline "โหลดเพิ่ม" (30 per page) | |

## Content and copy (exact Thai text)

| Element | Text |
|---|---|
| Title | คิวงาน |
| Header subtitle | {หมวดงาน, คั่นด้วย " · "} |
| Refresh aria-label | โหลดคิวใหม่ |
| Pinned holding | งานที่กำลังทำ · รับงาน {time} · คืนงาน · บันทึกผลซ่อม |
| Pinned reserved | ส่งกลับให้แก้ · งานถัดไปของคุณ · ผู้แจ้ง: {reason} · เริ่มงาน |
| Reserved strip | มีงานส่งกลับให้แก้รออยู่ 1 งาน — เริ่มได้หลังจบงานนี้ |
| List heading | คิวงาน {n} งาน (n = rows matching the filter) |
| Filter | ทุกอาคาร · {ชื่ออาคาร} |
| Holding note | จบงานปัจจุบันก่อน (บันทึกผล หรือ คืนงาน) จึงรับงานใหม่ได้ |
| Reserved note (not holding, has reserved) | เริ่มงานที่ส่งกลับให้แก้ก่อน จึงรับงานใหม่ได้ |
| Row | {order} · {priority} · แจ้งเมื่อ {time} · {title} · {location} · {category} · รับงาน |
| Desktop columns | ลำดับ · เรื่อง / สถานที่ · หมวดงาน · ความเร่งด่วน · แจ้งเมื่อ |
| Empty — queue | ยังไม่มีงานในหมวดของคุณ / ~~งานใหม่จะแจ้งเตือนที่กระดิ่ง~~ งานใหม่จะแสดงที่หน้านี้ (CR-024) |
| Empty — filter | ไม่มีงานในอาคารนี้ / button ดูทุกอาคาร |
| No categories | ยังไม่ได้กำหนดหมวดงาน ติดต่อ Admin |
| Error | Alert: โหลดคิวงานไม่สำเร็จ / ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง · button ลองอีกครั้ง |
| Toasts | รับงานแล้ว · เริ่มงานแล้ว · คืนงานแล้ว |
| Error — already claimed | toast: งานนี้มีช่างรับไปแล้ว → row removed (refetch) |
| Error — holding another job (other device) | toast: จบงานปัจจุบันก่อน (บันทึกผล หรือ คืนงาน) → refetch |
| Error — must start reserved first | toast: เริ่มงานที่ส่งกลับให้แก้ก่อน จึงรับงานใหม่ได้ → refetch |
| Forbidden reason | หน้านี้สำหรับช่างเทคนิค |

## States

| State | What shows |
|---|---|
| Loading | Header renders; skeleton pinned card + 4 skeleton rows. Refresh shows a spinning icon. "โหลดเพิ่ม" spinner. |
| Empty | Queue empty → mascot empty card (copy above), pinned card still shows if any. Filter empty → small card + "ดูทุกอาคาร". No categories → mascot `bust` card with the text, no list, no filter. |
| Error | Inline Alert under the heading + "ลองอีกครั้ง"; pinned card area shows its own Alert if that part fails. |
| Forbidden | Not a technician → `_common.md` §6 with the reason above. |
| Success feedback | Toasts; after claim the list refetches, the pinned card shows the new job and the page scrolls to the top. |

## Interactions

- Tap row → S07. Tap "รับงาน" → claim dialog → success: toast "รับงานแล้ว", pinned card = that job, all other "รับงาน" buttons disabled (BR-F21-3).
- Claim buttons are disabled while holding a job or while a reserved job is waiting (BR-F21-3), with the matching note above the list.
- Technicians may claim any row, not just the first (BR-F21-6).
- "เริ่มงาน" (reserved) → no dialog → toast "เริ่มงานแล้ว".
- "บันทึกผลซ่อม" → S10. "คืนงาน" → give-back dialog → toast "คืนงานแล้ว"; the job goes back to its old position (BR-F21-5).
- Building filter → updates `?building`; remembered for the session (sessionStorage) so returning from S07 keeps it.
- Refresh button, page focus, and every action refetch the queue. No live push in phase 1.
- Admin closes my current job (BR-F21-8) → on next refetch the pinned card disappears; the bell already has the notification.
- Validation: reason in give-back dialog (`_common.md` §7).

## Acceptance checklist (Codex reports results in ../HANDOFF.md — does not edit this file)

- [ ] Matches `S09-technician-queue.html` at 375px and 1280px for every frame
- [ ] Rows always in queue order; filter never reorders; order numbers are full-queue positions
- [ ] All 4 pinned-card states and both notes render with the exact copy
- [ ] Claim disabled while holding / while reserved waits; enabled otherwise for any row
- [ ] Empty, filter-empty, no-categories, error, forbidden states
- [ ] Uses only design-system tokens and shadcn components
- [ ] Keyboard and screen-reader basics (row link and claim button are separate focus stops; disabled reason announced)
- [ ] Works with mocks (`NEXT_PUBLIC_USE_MOCKS=true`) incl. a race mock that returns "already claimed"
