import { type APIRequestContext, expect, test } from "@playwright/test";
import { CLASSES } from "../../src/shared/classes";
import { fixtureMail, mailConfig } from "../fixtures/mail";
import { fixturePlan } from "../fixtures/plan";

const headers = { Authorization: "Bearer local-e2e-import-token" };
const date = "2076-03-10";
const month = date.slice(0, 7);

async function seedClassrooms(request: APIRequestContext) {
  const key = `class-navigation-${crypto.randomUUID()}`;
  for (const { id: classId } of CLASSES) {
    const imported = await request.post("/api/import", {
      headers,
      data: fixtureMail(`${key}-${classId}`, mailConfig.classEmails[classId]),
    });
    expect(imported.status()).toBe(201);
    const { id } = await imported.json();
    const plan = fixturePlan(id, date);
    const tomorrow = fixturePlan(id, "2076-03-11");
    expect(
      (
        await request.post("/api/plans", {
          headers,
          data: {
            ...plan,
            classId,
            title: `${key}-${classId}`,
            days: [...plan.days, ...tomorrow.days].map((day) => ({
              ...day,
              title: `${key}-${classId}`,
            })),
          },
        })
      ).status(),
    ).toBe(201);
  }
  return key;
}

for (const language of ["en", "zh"] as const) {
  for (const view of ["today", "tomorrow", "plans", "mail"] as const) {
    test(`keeps ${view} content and footer steady while changing classrooms in ${language}`, async ({
      page,
      request,
    }) => {
      const key = await seedClassrooms(request);
      await page.addInitScript((value) => {
        localStorage.setItem("monticello-language", value);
      }, language);
      await page.clock.setFixedTime(new Date(`${date}T18:00:00Z`));
      const params = new URLSearchParams({
        view: view === "tomorrow" ? "today" : view,
        class: "sunshine",
      });
      if (view === "tomorrow") params.set("day", "tomorrow");
      if (view === "plans") params.set("month", month);
      if (view === "mail") {
        params.set("q", key);
        params.set("sort", "oldest");
      }
      await page.goto(`/?${params}`);
      const content = page.locator(
        view === "mail"
          ? ".mail-list"
          : view === "plans"
            ? ".plan-list"
            : ".day-grid",
      );
      await expect(content).toContainText(`${key}-sunshine`);
      await page.evaluate(() => document.fonts.ready);
      const shell = await page.locator(".main-shell").elementHandle();
      const footerTop = await page
        .locator(".footer")
        .evaluate((footer) => footer.getBoundingClientRect().top);
      const gate = Promise.withResolvers<void>();
      let delayed = 0;
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("class") === "guppy") {
          expect(url.searchParams.get("lang")).toBe(language);
          delayed++;
          await gate.promise;
        }
        await route.continue();
      });
      const filters = page.locator(".class-filters");
      try {
        const target = filters.locator('a[href*="class=guppy"]');
        if (view === "mail") {
          await target.focus();
          await target.press("Enter");
        } else await target.click();
        await expect.poll(() => delayed).toBeGreaterThan(0);
        await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");
        await expect(content).toContainText(`${key}-sunshine`);
        await expect(filters.locator('[aria-current="true"]')).toHaveAttribute(
          "href",
          /class=sunshine/,
        );
        await expect(page.locator(".load-state")).toHaveCount(0);
        expect(await shell?.evaluate((element) => element.isConnected)).toBe(
          true,
        );
        expect(
          await page
            .locator(".footer")
            .evaluate((footer) => footer.getBoundingClientRect().top),
        ).toBeCloseTo(footerTop, 0);
      } finally {
        gate.resolve();
      }
      await expect(content).toContainText(`${key}-guppy`);
      await expect(content).not.toContainText(`${key}-sunshine`);
      await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
      const target = new URL(page.url());
      expect(target.searchParams.get("class")).toBe("guppy");
      for (const [name, value] of params)
        if (name !== "class") expect(target.searchParams.get(name)).toBe(value);
      await page.goBack();
      await expect(content).toContainText(`${key}-sunshine`);
      await page.goForward();
      await expect(content).toContainText(`${key}-guppy`);
      expect(await shell?.evaluate((element) => element.isConnected)).toBe(
        true,
      );
      await page.reload();
      await expect(content).toContainText(`${key}-guppy`);
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        language === "zh" ? "zh-CN" : "en",
      );
      await filters.locator('a:not([href*="class="])').click();
      for (const { id } of CLASSES)
        await expect(content).toContainText(`${key}-${id}`);
    });
  }

  test(`keeps the last classroom selected when responses arrive out of order in ${language}`, async ({
    page,
    request,
  }) => {
    const key = await seedClassrooms(request);
    await page.addInitScript((value) => {
      localStorage.setItem("monticello-language", value);
    }, language);
    await page.goto(`/?view=mail&class=sunshine&q=${key}`);
    await expect(page.locator(".mail-list")).toContainText(`${key}-sunshine`);
    const gate = Promise.withResolvers<void>();
    let delayed = false;
    await page.route("**/api/mail?*", async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("class") === "guppy"
      ) {
        delayed = true;
        await gate.promise;
      }
      await route.continue();
    });
    const filters = page.locator(".class-filters");
    const lateResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/mail" &&
        new URL(response.url()).searchParams.get("class") === "guppy",
    );
    try {
      await filters.locator('a[href*="class=guppy"]').click();
      await expect.poll(() => delayed).toBe(true);
      await filters.locator('a[href*="class=twos"]').click();
      await expect(page.locator(".mail-list")).toContainText(`${key}-twos`);
      await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
    } finally {
      gate.resolve();
    }
    await (await lateResponse).finished();
    await page.unrouteAll({ behavior: "wait" });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect(page.locator(".mail-list")).toContainText(`${key}-twos`);
    await expect(filters.locator('[aria-current="true"]')).toHaveAttribute(
      "href",
      /class=twos/,
    );
    expect(new URL(page.url()).searchParams.get("class")).toBe("twos");
    await page.goBack();
    await expect(page.locator(".mail-list")).toContainText(`${key}-guppy`);
    await page.goBack();
    await expect(page.locator(".mail-list")).toContainText(`${key}-sunshine`);
  });

  test(`holds the initial layout and retries a failed classroom change in ${language}`, async ({
    page,
    request,
  }) => {
    const key = await seedClassrooms(request);
    await page.addInitScript((value) => {
      localStorage.setItem("monticello-language", value);
    }, language);
    const gate = Promise.withResolvers<void>();
    let fail = true;
    await page.route("**/api/mail?*", async (route) => {
      await gate.promise;
      if (
        fail &&
        new URL(route.request().url()).searchParams.get("class") === "guppy"
      ) {
        fail = false;
        await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      } else await route.continue();
    });
    try {
      await page.goto(`/?view=mail&class=sunshine&q=${key}`);
      await expect(page.locator(".load-state")).toBeVisible();
      const footer = await page.locator(".footer").evaluate((element) => ({
        bottom: element.getBoundingClientRect().bottom,
        viewport: document.documentElement.clientHeight,
      }));
      expect(footer.bottom).toBeGreaterThanOrEqual(footer.viewport);
    } finally {
      gate.resolve();
    }
    await expect(page.locator(".mail-list")).toContainText(`${key}-sunshine`);
    await page.locator('.class-filters a[href*="class=guppy"]').click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
    await page
      .getByRole("button", { name: language === "zh" ? "重试" : "Try again" })
      .click();
    await expect(page.locator(".mail-list")).toContainText(`${key}-guppy`);
    await expect(page.getByRole("alert")).toHaveCount(0);
    const opened = page.context().waitForEvent("page");
    await page.locator('.class-filters a[href*="class=sunshine"]').click({
      modifiers: ["ControlOrMeta"],
    });
    const popup = await opened;
    await expect(popup.locator(".mail-list")).toContainText(`${key}-sunshine`);
    await expect(page.locator(".mail-list")).toContainText(`${key}-guppy`);
    await popup.close();
  });
}
