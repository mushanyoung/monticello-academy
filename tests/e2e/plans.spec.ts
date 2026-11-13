import { expect, test } from "@playwright/test";
import { fixtureMail } from "../fixtures/mail";
import { fixturePlan } from "../fixtures/plan";

const headers = { Authorization: "Bearer local-e2e-import-token" };
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
  ).toBe(201);
  const hidden = await (
    await request.get("/api/highlights?date=2040-11-13")
  ).json();
  expect(hidden.classes[0].status).toBe("awaiting-review");
  expect(hidden.classes[0].day).toBeNull();
  expect(
    (
      await (
        await request.get("/api/plans?month=2040-11&class=sunshine")
      ).json()
    ).items,
  ).toHaveLength(0);
  expect((await request.get("/api/highlights?date=2026-02-30")).status()).toBe(
    400,
  );
});
test("keeps provider readiness private and does not call OpenAI without a local key", async ({
  request,
}) => {
  expect((await request.get("/api/admin/ai")).status()).toBe(401);
  const response = await request.get("/api/admin/ai", {
    headers: { Authorization: "Bearer local-e2e-import-token" },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    error: "The lesson parser API key is not configured.",
  });
});
