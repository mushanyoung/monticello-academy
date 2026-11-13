import { expect, test } from "@playwright/test";

test("switches every view to Chinese, remembers the client choice and keeps a usable layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("button", { name: "English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("heading", { name: "小小的日常， 大大的发现。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "明天", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "中文", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const view of ["mail", "plans"]) {
    await page.goto(`/?view=${view}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(
      page.getByRole("navigation", { name: "按班级筛选" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const button = await page
      .getByRole("button", { name: "English", exact: true })
      .boundingBox();
    expect(button?.x).toBeGreaterThan((page.viewportSize()?.width || 0) / 2);
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A month of little possibilities." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("monticello-language")),
  ).toBe("en");
});
test("uses client language independently and falls back to Chinese without a preference", async ({
  browser,
}) => {
  const chinese = await browser.newContext({ locale: "zh-CN" });
  const chinesePage = await chinese.newPage();
  await chinesePage.goto("http://127.0.0.1:5173/");
  await expect(chinesePage.locator("html")).toHaveAttribute("lang", "zh-CN");
  await chinesePage
    .getByRole("button", { name: "English", exact: true })
    .click();
  await chinesePage.reload();
  await expect(chinesePage.locator("html")).toHaveAttribute("lang", "en");
  const unknown = await browser.newContext({ locale: "fr-FR" });
  await unknown.addInitScript(() => {
    Object.defineProperty(navigator, "languages", { get: () => [] });
    Object.defineProperty(navigator, "language", { get: () => "" });
  });
  const page = await unknown.newPage();
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await unknown.close();
  await chinese.close();
});
