import { expect, test } from "@playwright/test";

test("opens the notebook on desktop and mobile", async ({ page, request }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Little days/ }),
  ).toBeVisible();
  expect(await (await request.get("/api/health")).json()).toEqual({
    status: "ok",
  });
});
