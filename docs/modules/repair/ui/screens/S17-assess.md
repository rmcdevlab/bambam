# S17 — ประเมินงาน (CR-005)

> **CR-052 (2026-11-18):** `ช่างภายนอก` options: icon per fact — ประเภทงาน (tags) · ผู้ติดต่อ (person) · เบอร์โทร (phone, own item); the trigger's contact line uses the person + phone icons.

> **CR-049 (2026-11-17):** `ช่างผู้รับผิดชอบ` and `ช่างภายนอก` pickers: search on top (always), 5 names per page, `แสดง a–b จาก n คน|ร้าน` + `‹ page / pages ›` under the list; a search returns to page 1; opening shows the page of the picked name. The CR-046 contact note (`ชื่อผู้ติดต่อคือผู้ประสานงาน…`) is removed.

> **CR-046 (2026-11-17):** `ช่างภายนอก` picker: hint `เลือกร้านหรือบริษัทที่เข้าซ่อม ดูประเภทงานและชื่อผู้ติดต่อเพื่อประสานงานให้ถูกคน`; each option = name · types · `ผู้ติดต่อ: {contactName} · {phone}` (`ยังไม่มีชื่อผู้ติดต่อ`); search always on, matches name / types / contact / phone; the trigger shows the shop + its contact; note `ชื่อผู้ติดต่อคือผู้ประสานงานของร้านหรือบริษัท อาจเป็นคนละคนกับช่างที่เข้าซ่อม`.

Status: built by Claude 2026-10-15 (CR-005, no separate mockup) — waiting for acceptance · CR-024 applied 2026-10-26 (block below) · CR-034 applied 2026-11-01 (block below)

> **CR-044 (2026-11-16):** `เริ่มดำเนินการ` / `บันทึกวันใหม่` → confirm popup (`AlertDialog`, phones bottom sheet) after the button, before anything is sent: `ยกเลิก` / same verb; validation errors show first, no popup: `เริ่มดำเนินการงานนี้?` or `บันทึกวันใหม่?` / `วันที่คาดว่าจะเสร็จ {วัน} · ช่าง {ชื่อ}` (or `ช่างภายนอก {ร้าน}`). (CR-044)

> **CR-034 (approved 2026-11-01):** `ใครซ่อม` → `ประเภทผู้ดำเนินการซ่อม` (label, error `เลือกประเภทผู้ดำเนินการซ่อม`, description `กำหนดวันที่คาดว่าจะเสร็จและผู้ดำเนินการซ่อม …`). `ช่างของบริษัท` → required picker `ช่างผู้รับผิดชอบ *` (#36, search when > 10, default = me if listed; error `เลือกช่างผู้รับผิดชอบ`). `เหตุผลที่เลื่อน` is required (`*`, `ผู้แจ้งเห็นข้อความนี้`, error `กรุณาใส่เหตุผลที่เลื่อน`) when rescheduling; in `รับแก้ไขและกำหนดวันเสร็จใหม่` it stays `ไม่บังคับ`.

> **CR-024 (approved 2026-10-26):** toasts and dialog descriptions per `_common.md` §9.

> **CR-009 (approved 2026-10-18):** title `เริ่มดำเนินการ` (`กำหนดวันที่คาดว่าจะเสร็จและใครซ่อม`) · after a send back `รับแก้ไขและกำหนดวันเสร็จใหม่` · change `เลื่อนวันที่คาดว่าจะเสร็จ` · buttons `เริ่มดำเนินการ` / `บันทึกวันใหม่` · toast `เริ่มดำเนินการแล้ว ผู้แจ้งจะได้รับแจ้งเตือนวันที่คาดว่าจะเสร็จ`.


> **CR-008 (approved 2026-10-16):** title `รับเรื่องและกำหนดวันเสร็จ` (change: `เลื่อนวันที่คาดว่าจะเสร็จ`; after a send back `รับแก้ไขและกำหนดวันเสร็จใหม่`) · `คาดว่าจะเสร็จ *` chips `วันนี้` · `พรุ่งนี้` · `อีก 3 วัน` · `เลือกวัน` (native date, today or later) · `ใครซ่อม *` segmented `ช่างของบริษัท | ช่างภายนอก` (+ picker, `+ เพิ่มช่างภายนอกใหม่`) · on a change: `เหตุผลที่เลื่อน` (optional ≤ 100, `ผู้แจ้งเห็นข้อความนี้`) · buttons `รับเรื่อง` / `บันทึกวันใหม่`. Mockup: `../../changes/CR-008/ticket-detail.html`.


- **Who:** technician · **Where:** dialog from the S07 action bar (`ticket-actions.tsx` `AssessDialog`) · **Flow:** F21 BR-F21-2
- Title: "ประเมินงาน" (first time) / "แก้การประเมิน" (already assessed); description "ผู้แจ้งจะเห็นวันที่คาดว่าจะเสร็จและผู้ดำเนินการในหน้าติดตามงาน (เดิม {d MMM yyyy})"
- Fields (CR-006): วันที่คาดว่าจะเสร็จ* — native date input, `min` = today (Asia/Bangkok) · **ผู้ดำเนินการ*** segmented ช่างในระบบ / ช่างภายนอก · for ช่างภายนอก: Picker "ช่างภายนอก*" (active contractors, description = types) + "เพิ่มใหม่" (the S18 form dialog; the new contractor is selected)
- Errors: "เลือกวันที่คาดว่าจะเสร็จ" (empty) · "เลือกวันนี้หรือหลังจากนี้" (past, server `PAST`) · "เลือกช่างภายนอก"
- Changing the contractor clears the old contractor's score on this ticket; every save is a timeline event (ประเมินงาน / ช่างเลื่อนวันคาดว่าเสร็จ)
- Buttons: ยกเลิก (ghost) · บันทึก (primary, spinner while saving)
- Success: toast "บันทึกการประเมินแล้ว", S07 updates in place (tracker → กำลังซ่อม, chip "คาดว่าจะเสร็จ …")
- `TICKET_CLOSED` / `INVALID_STATE`: toast with the contract copy and the dialog closes
- Mobile: bottom-sheet look (full width, rounded top); desktop: centred dialog
