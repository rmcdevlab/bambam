import { expect, test, type Page } from "@playwright/test";
import { API, as, assess, attachVia, auth, confirmPopup, report, resolve, sendBack, tag, uploadPhoto } from "./helpers";

// CR-059: while a job is in repair or reworking, a technician or Admin (`repair.ticket.update_progress`) posts a
// progress update — message required (1–500), 0–5 photos — and everyone who sees the ticket reads it in the S07
// timeline (and the newest one in the band). Not before เริ่มดำเนินการ, not after the result. Real API.

const nextAction = (page: Page) => page.getByRole("region", { name: "สิ่งที่เกิดขึ้นตอนนี้" });
const progress = (page: Page) => page.getByRole("region", { name: "ความคืบหน้าของงาน" });

test.describe("technician", () => {
  test.use({ storageState: auth("technician") });

  test("AC1: posts an update with a photo from S07; the reporter sees it in the timeline and the band", async ({ page, baseURL }, info) => {
    test.slow(); // first visits compile on `next dev`
    const employee = await as("employee", baseURL);
    const technician = await as("technician", baseURL);
    const ticket = await report(employee, tag(info));

    // รับเรื่อง (before เริ่มดำเนินการ): no update button, the API refuses
    await page.goto(`/repair/tickets/${ticket.id}`);
    await expect(nextAction(page).getByRole("button", { name: "เริ่มดำเนินการ" })).toBeVisible();
    await expect(page.getByRole("button", { name: /อัปเดตความคืบหน้า/ })).toHaveCount(0);
    const early = await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "ยังไม่เริ่ม", photoIds: [] } });
    expect([early.status(), (await early.json()).error.code]).toEqual([409, "INVALID_STATE"]);

    await assess(technician, ticket.id);
    await page.reload();
    await nextAction(page).getByRole("button", { name: "อัปเดตความคืบหน้า", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "อัปเดตความคืบหน้า" });
    // the message is required every time
    await dialog.getByRole("button", { name: "ส่งอัปเดต" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("กรุณาเขียนความคืบหน้า");
    await dialog.getByLabel(/ความคืบหน้าล่าสุด/).fill("สั่งอะไหล่แล้ว ของถึงพรุ่งนี้เช้า");
    await attachVia(page, dialog.locator("input[type=file]"));
    await dialog.getByRole("button", { name: "ส่งอัปเดต" }).click();
    await confirmPopup(page, "ส่งอัปเดต"); // CR-044
    await expect(page.getByText("ส่งอัปเดตแล้ว ผู้แจ้งเห็นในหน้างานแล้ว")).toBeVisible();
    await expect(progress(page).locator('[aria-current="step"]')).toContainText("สั่งอะไหล่แล้ว ของถึงพรุ่งนี้เช้า");
    await expect(progress(page).getByText("โดย คุณ")).toBeVisible();

    // API: one `progress_updated` event with the message and the photo, visible to the reporter
    const seen = (await (await employee.get(`${API}/tickets/${ticket.id}`)).json()).data;
    expect(seen.timeline[0]).toMatchObject({ type: "progress_updated", note: "สั่งอะไหล่แล้ว ของถึงพรุ่งนี้เช้า" });
    expect(seen.timeline[0].photos).toHaveLength(1);
    expect(seen.allowedActions).not.toContain("update_progress");

    // The reporter cannot post (403)
    const byReporter = await employee.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "ขอบคุณค่ะ", photoIds: [] } });
    expect(byReporter.status()).toBe(403);

    // Validation: message required and ≤ 500, photos ≤ 5
    const empty = await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: " ", photoIds: [] } });
    expect([empty.status(), (await empty.json()).error.fields]).toEqual([400, { note: "REQUIRED" }]);
    const long = await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "ก".repeat(501), photoIds: [] } });
    expect((await long.json()).error.fields).toEqual({ note: "TOO_LONG" });
    const six = await Promise.all(Array.from({ length: 6 }, () => uploadPhoto(technician)));
    const many = await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "รูปเยอะ", photoIds: six } });
    expect((await many.json()).error.fields).toEqual({ photoIds: "MAX_ITEMS" });

    // During a rework the update goes under ส่งกลับให้แก้; after the result no more updates
    await resolve(technician, ticket.id);
    const resolved = await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "หลังส่งผล", photoIds: [] } });
    expect([resolved.status(), (await resolved.json()).error.code]).toEqual([409, "INVALID_STATE"]);
    await sendBack(employee, ticket.id);
    const rework = await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "กลับมาแก้ท่อน้ำทิ้งแล้ว", photoIds: [] } });
    expect(rework.status()).toBe(200);
    await page.reload();
    await expect(progress(page).locator('[aria-current="step"]')).toContainText("กลับมาแก้ท่อน้ำทิ้งแล้ว");
    await expect(page.getByRole("button", { name: "เพิ่มอัปเดตความคืบหน้า" })).toBeVisible();
  });
});

test.describe("reporter", () => {
  test.use({ storageState: auth("employee") });

  test("AC2: reads the latest update in the band, every update in the timeline; no update buttons", async ({ page, baseURL }, info) => {
    test.slow();
    const employee = await as("employee", baseURL);
    const technician = await as("technician", baseURL);
    const admin = await as("admin", baseURL);
    const ticket = await report(employee, tag(info));
    await assess(technician, ticket.id);
    expect((await technician.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "ถอดแผงตรวจแล้ว", photoIds: [await uploadPhoto(technician)] } })).status()).toBe(200);
    // Admin may post too (owner 2026-11-23: ช่าง + Admin)
    expect((await admin.post(`${API}/tickets/${ticket.id}/progress`, { data: { note: "อนุมัติสั่งอะไหล่แล้ว", photoIds: [] } })).status()).toBe(200);

    await page.goto(`/repair/tickets/${ticket.id}`);
    await expect(page.getByRole("link", { name: /อัปเดตล่าสุด/ })).toContainText("อนุมัติสั่งอะไหล่แล้ว");
    await expect(progress(page).getByText("ถอดแผงตรวจแล้ว")).toBeVisible();
    await expect(progress(page).getByText("อนุมัติสั่งอะไหล่แล้ว")).toBeVisible();
    await expect(progress(page).getByRole("button", { name: /ขยายรูปกิจกรรม/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /อัปเดตความคืบหน้า/ })).toHaveCount(0);
  });
});
