import { expect, test } from "@playwright/test";
import type { MailDetail } from "../../src/shared/models";
import { htmlMail, pixel } from "../fixtures/html-mail";

const headers = { Authorization: "Bearer local-e2e-import-token" };
test("reads original styling and inline images while isolating active content and remote images", async ({
  page,
  request,
}, testInfo) => {
  const key = `html-${crypto.randomUUID()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener("error", (event) => {
      document.documentElement.dataset.browserError = event.message;
    });
  });
  const imported = await request.post("/api/import", {
    headers,
    data: htmlMail(key),
  });
  expect(imported.status()).toBe(201);
  const { id } = await imported.json();
  const response = await request.get(`/api/mail/${id}/content`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain(
    "script-src 'none'",
  );
  expect(response.headers()["content-security-policy"]).toContain(
    "sandbox allow-same-origin",
  );
  let externalRequests = 0;
  await page.route("https://images.example.com/**", async (route) => {
    externalRequests++;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(pixel, "base64"),
    });
  });
  await page.goto(`/?view=mail&id=${id}`);
  const frame = page.frameLocator('iframe[title="Original email content"]');
  await expect(
    frame.getByRole("heading", { name: "A colorful week" }),
  ).toHaveCSS("color", "rgb(112, 80, 160)");
  await expect(
    frame.getByRole("heading", { name: "A colorful week" }),
  ).toHaveCSS("font-size", "28px");
  await expect(frame.getByRole("cell", { name: "Monday" })).toHaveCSS(
    "background-color",
    "rgb(238, 231, 245)",
  );
  await expect(frame.getByAltText("Classroom drawing")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await expect(page.locator(".attachments")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Load external images" }),
  ).toBeVisible();
  expect(externalRequests).toBe(0);
  expect(
    await page.locator("body").getAttribute("data-email-injected"),
  ).toBeNull();
  await expect(frame.locator("script, input, form, iframe")).toHaveCount(0);
  await expect(
    frame.getByRole("link", { name: "School website" }),
  ).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "Plain text", exact: true }).click();
  await expect(page.locator(".mail-body")).toContainText("Bring rain boots");
  await expect(page.locator(".attachments h3")).toHaveText("1 attachment");
  await expect(
    page.getByRole("link", { name: "Download art.png", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Original formatting", exact: true })
    .click();
  await page.getByRole("button", { name: "Load external images" }).click();
  await expect(frame.getByAltText("External photo")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  expect(externalRequests).toBe(1);
  await expect(page.locator(".attachments")).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect(page.locator("html")).not.toHaveAttribute("data-browser-error");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("formatted-email.png"),
    fullPage: true,
  });
});

test("falls back to readable text when formatting fails and can retry", async ({
  page,
  request,
}) => {
  const { id } = await (
    await request.post("/api/import", {
      headers,
      data: htmlMail(`retry-${crypto.randomUUID()}`),
    })
  ).json();
  let first = true;
  await page.route(`**/api/mail/${id}/content`, async (route) => {
    if (first) {
      first = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Unavailable"}',
      });
    } else await route.continue();
  });
  await page.goto(`/?view=mail&id=${id}`);
  await expect(
    page.getByRole("region", { name: "Message content" }).getByRole("status"),
  ).toContainText("Original formatting couldn't be loaded");
  await expect(page.locator(".mail-body")).toContainText("Bring rain boots");
  await expect(
    page.getByRole("link", { name: "Download art.png", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Original formatting" }).click();
  await expect(
    page
      .frameLocator(".email-frame")
      .getByRole("heading", { name: "A colorful week" }),
  ).toBeVisible();
  await expect(page.locator(".attachments")).toHaveCount(0);
});

test("keeps ordinary, unreferenced, hidden and failed inline files downloadable", async ({
  page,
  request,
}) => {
  const imported = await request.post("/api/import", {
    headers,
    data: htmlMail(`attachments-${crypto.randomUUID()}`, "mixed"),
  });
  expect(imported.status()).toBe(201);
  const { id } = await imported.json();
  const detail: MailDetail = await (
    await request.get(`/api/mail/${id}`)
  ).json();
  expect(detail.attachments).toHaveLength(6);
  const broken = detail.attachments.find(
    (file) => file.filename === "broken.png",
  );
  if (!broken) throw new Error("Missing broken-image fixture");
  await page.route(`**/api/attachments/${broken.id}?preview=1`, (route) =>
    route.fulfill({ status: 503, body: "Temporarily unavailable" }),
  );
  await page.goto(`/?view=mail&id=${id}`);
  const frame = page.frameLocator(".email-frame");
  await expect(frame.getByAltText("Classroom drawing")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await expect(frame.getByAltText("Unavailable drawing")).toHaveJSProperty(
    "naturalWidth",
    0,
  );
  await expect(page.locator(".attachments h3")).toHaveText("5 attachments");
  await expect(
    page.getByRole("link", { name: "Download art.png", exact: true }),
  ).toHaveCount(0);
  for (const filename of [
    "broken.png",
    "hidden.png",
    "unreferenced.png",
    "photo.png",
    "lesson.pdf",
  ]) {
    const download = page.getByRole("link", {
      name: `Download ${filename}`,
      exact: true,
    });
    await expect(download).toBeVisible();
    const url = await download.getAttribute("href");
    if (!url) throw new Error("Missing attachment download URL");
    const file = await request.get(url);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toContain("attachment;");
    expect((await file.body()).length).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Plain text", exact: true }).click();
  await expect(page.locator(".attachments h3")).toHaveText("6 attachments");
  await expect(
    page.getByRole("link", { name: "Download art.png", exact: true }),
  ).toBeVisible();
  // Retrying original formatting after recovery also updates the visible count.
  await page.unroute(`**/api/attachments/${broken.id}?preview=1`);
  await page
    .getByRole("button", { name: "Original formatting", exact: true })
    .click();
  await expect(frame.getByAltText("Unavailable drawing")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await expect(page.locator(".attachments h3")).toHaveText("4 attachments");
  await expect(
    page.getByRole("link", { name: "Download broken.png", exact: true }),
  ).toHaveCount(0);
  // Presentation never changes the archive or its download endpoints.
  const saved: MailDetail = await (await request.get(`/api/mail/${id}`)).json();
  expect(saved.attachments).toEqual(detail.attachments);
});
