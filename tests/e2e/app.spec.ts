import { expect, test } from "@playwright/test";
import { addDays, campusDate } from "../../src/shared/dates";
import { fixtureMail } from "../fixtures/mail";
import { fixturePlan } from "../fixtures/plan";

const headers = { Authorization: "Bearer local-e2e-import-token" };
test("opens the notebook and preserves a usable mobile viewport", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Little days/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The day ahead" }),
  ).toBeVisible();
  expect(await (await request.get("/api/health")).json()).toEqual({
    status: "ok",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("checks today and tomorrow, opens the monthly plan and reads its source", async ({
  page,
  request,
}, testInfo) => {
  const today = campusDate();
  const tomorrow = addDays(today, 1);
  const key = `family-${crypto.randomUUID()}`;
  const { id } = await (
    await request.post("/api/import", { headers, data: fixtureMail(key) })
  ).json();
  const plan = fixturePlan(id, today);
  expect(
    (await request.post("/api/plans", { headers, data: plan })).status(),
  ).toBe(201);
  const next = fixturePlan(id, tomorrow);
  const nextDay = next.days[0];
  if (!nextDay) throw new Error("Missing fixture day");
  nextDay.title = "Painting a colorful tomorrow";
  nextDay.bring = ["Art smock"];
  next.days = next.month === plan.month ? [...plan.days, nextDay] : [nextDay];
  expect(
    (await request.post("/api/plans", { headers, data: next })).status(),
  ).toBe(201);
  await page.goto("/?class=sunshine");
  await expect(
    page.getByRole("heading", { name: "A little walk, a big discovery" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bring: Rain boots", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Tomorrow", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Painting a colorful tomorrow" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bring: Art smock", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "See the month's plan" }).click();
  await expect(page.getByRole("heading", { name: plan.title })).toBeVisible();
  await page.getByRole("link", { name: "Read the source email" }).click();
  await expect(
    page.getByRole("heading", { name: `Autumn discoveries ${key}`, level: 2 }),
  ).toBeVisible();
  await expect(page.locator(".mail-body")).toContainText("Bring rain boots");
  await expect(
    page.getByRole("link", { name: "Download November checklist.txt" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download November checklist.txt" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("November checklist.txt");
  await download.saveAs(testInfo.outputPath("checklist.txt"));
  await page.screenshot({
    path: testInfo.outputPath("mail-reader.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("searches and filters classroom mail and shows genuine empty results", async ({
  page,
  request,
}) => {
  const key = `search-${crypto.randomUUID()}`;
  const { id } = await (
    await request.post("/api/import", { headers, data: fixtureMail(key) })
  ).json();
  await page.goto("/?view=mail&class=sunshine");
  await page.getByRole("searchbox", { name: "Search mail" }).fill(key);
  await page.getByLabel("Sort by time").selectOption("oldest");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Autumn discoveries ${key}` }),
  ).toBeVisible();
  await expect(page.locator(".mail-item")).toHaveCount(1);
  await page.locator(`.mail-item[href*="${id}"]`).click();
  await expect(page.locator(".mail-reader")).toContainText(
    "November checklist.txt",
  );
  await page.goto(`/?view=mail&class=guppy&q=${key}`);
  await expect(
    page.getByRole("heading", { name: "No notes found this time." }),
  ).toBeVisible();
});
test("shows load failure and retries without an endless loading state", async ({
  page,
}) => {
  let first = true;
  await page.route("**/api/highlights?*", async (route) => {
    if (first) {
      first = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Please try again after a short pause.",
        }),
      });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Please try again");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".day-card")).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
