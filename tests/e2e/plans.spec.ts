import { expect, test } from "@playwright/test";
import { campusDate } from "../../src/shared/dates";
import type { StoredPlan } from "../../src/shared/plans";
import { fixtureMail, mailConfig } from "../fixtures/mail";
import { fixturePlan } from "../fixtures/plan";

const headers = { Authorization: "Bearer local-e2e-import-token" };
test("chooses only archived months across classrooms and retains filters and shareable dates", async ({
  page,
  request,
}) => {
  const { id } = await (
    await request.post("/api/import", {
      headers,
      data: fixtureMail(
        `month-choices-${crypto.randomUUID()}`,
        `${mailConfig.classEmails.sunshine}, ${mailConfig.classEmails.guppy}`,
      ),
    })
  ).json();
  const currentMonth = campusDate().slice(0, 7);
  const fixtures = [
    fixturePlan(id, `${currentMonth}-10`),
    { ...fixturePlan(id, "2050-12-10"), sourceKind: "carryover" },
    { ...fixturePlan(id, "2051-02-10"), title: "Sunshine February archive" },
    {
      ...fixturePlan(id, "2051-02-10"),
      classId: "guppy",
      title: "Guppy February archive",
    },
    { ...fixturePlan(id, "2051-09-10"), classId: "guppy" },
  ];
  for (const plan of fixtures)
    expect(
      (await request.post("/api/plans", { headers, data: plan })).status(),
    ).toBe(201);
  const allPlans: { items: StoredPlan[] } = await (
    await request.get("/api/plans")
  ).json();
  const months = [...new Set(allPlans.items.map((plan) => plan.month))]
    .sort()
    .reverse();
  expect(await (await request.get("/api/plan-months")).json()).toEqual({
    months,
  });
  expect(months).toEqual(
    expect.arrayContaining([currentMonth, "2050-12", "2051-02", "2051-09"]),
  );
  await page.goto("/?view=plans&class=sunshine");
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(
    currentMonth,
  );
  expect(
    await page
      .locator("#month option")
      .evaluateAll((options) =>
        options.map((option) => option.getAttribute("value")),
      ),
  ).toEqual(months);
  await expect(
    page.locator('.month-form input:not([type="hidden"])'),
  ).toHaveCount(0);
  await page.getByLabel("Month", { exact: true }).selectOption("2051-02");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page).toHaveURL(/class=sunshine&month=2051-02/);
  await expect(
    page.getByRole("heading", { name: "Sunshine February archive" }),
  ).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Filter by classroom" });
  await filters.getByRole("link", { name: "Guppy Room", exact: true }).click();
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(
    "2051-02",
  );
  await expect(
    page.getByRole("heading", { name: "Guppy February archive" }),
  ).toBeVisible();
  await page.getByLabel("Month", { exact: true }).selectOption("2051-09");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await filters
    .getByRole("link", { name: "Sunshine Room", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "This month is still taking shape." }),
  ).toBeVisible();
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(
    "2051-09",
  );
  await expect(page.locator("#month option")).toHaveCount(months.length);
  await page.clock.setFixedTime(new Date("2099-01-10T12:00:00Z"));
  for (const path of ["/?view=plans", "/?view=plans&month=2080-01"]) {
    await page.goto(path);
    await expect(page.getByLabel("Month", { exact: true })).toHaveValue(
      months[0] || "",
    );
    expect(new URL(page.url()).searchParams.get("month")).toBe(months[0]);
  }
});
test("retries month loading and shows an honest empty archive in both languages", async ({
  page,
}) => {
  let failed = false;
  await page.route("**/api/plan-months?*", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        json: { error: "Temporarily unavailable" },
      });
    }
    return route.fulfill({ json: { months: [] } });
  });
  await page.goto("/?view=plans");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "No lesson plans have been added yet." }),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Explore classroom mail" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "尚未入库任何课程计划。" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "查看班级邮件" })).toBeVisible();
  await expect(page.locator(".loading-dot")).toHaveCount(0);
});
test("publishes source-linked monthly plans and updates daily highlights", async ({
  request,
}) => {
  const imported = await request.post("/api/import", {
    headers,
    data: fixtureMail(`plan-${crypto.randomUUID()}`),
  });
  const { id } = await imported.json();
  const plan = fixturePlan(id);
  expect((await request.post("/api/plans", { data: plan })).status()).toBe(401);
  expect(
    (
      await request.post("/api/plans", {
        headers,
        data: { ...plan, classId: "guppy" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/plans", {
        headers,
        data: { ...plan, sourceMessageId: "f".repeat(64) },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/plans", {
        headers,
        data: { ...plan, month: "2040-12" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (await request.post("/api/plans", { headers, data: plan })).status(),
  ).toBe(201);
  const result = await (
    await request.get("/api/highlights?date=2040-11-13")
  ).json();
  expect(result.timeZone).toBe("America/Los_Angeles");
  expect(
    result.classes.find((c: { classId: string }) => c.classId === "sunshine")
      .day.bring,
  ).toEqual(["Rain boots"]);
  const tomorrow = await (
    await request.get("/api/highlights?date=2040-11-14")
  ).json();
  expect(tomorrow.classes[0].status).toBe("no-day");
  const plans = await (
    await request.get("/api/plans?month=2040-11&class=sunshine")
  ).json();
  expect(plans.items).toHaveLength(1);
  expect(plans.items[0].sourceMessageId).toBe(id);
  expect(
    (
      await request.post("/api/plans", {
        headers,
        data: { ...plan, status: "draft" },
      })
    ).status(),
  ).toBe(422);
  const retained = await (
    await request.get("/api/highlights?date=2040-11-13")
  ).json();
  expect(retained.classes[0].status).toBe("ready");
  expect(retained.classes[0].day.bring).toEqual(["Rain boots"]);
  expect((await request.get("/api/highlights?date=2026-02-30")).status()).toBe(
    400,
  );
});
test("keeps provider readiness private and uses the local provider fixture", async ({
  request,
}) => {
  expect((await request.get("/api/admin/ai")).status()).toBe(401);
  const response = await request.get("/api/admin/ai", {
    headers: { Authorization: "Bearer local-e2e-import-token" },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    model: "gpt-6.1-terra",
    available: true,
  });
});
