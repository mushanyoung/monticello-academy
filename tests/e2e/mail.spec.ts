import { expect, test } from "@playwright/test";
import { CLASSES } from "../../src/shared/classes";
import { fixtureMail } from "../fixtures/mail";

const headers = {
  Authorization: "Bearer local-e2e-import-token",
  "Content-Type": "message/rfc822",
};
test("archives concurrent list deliveries once and searches/downloads attachments", async ({
  request,
}) => {
  const key = `delivery-${crypto.randomUUID()}`;
  const results = await Promise.all(
    CLASSES.map((c) =>
      request.post("/api/import", { headers, data: fixtureMail(key, c.email) }),
    ),
  );
  for (const result of results) expect(result.status()).toBe(201);
  const records = await Promise.all(results.map((r) => r.json()));
  expect(new Set(records.map((r) => r.id)).size).toBe(1);
  for (const c of CLASSES) {
    const response = await request.get(`/api/mail?class=${c.id}&q=${key}`);
    const page = await response.json();
    expect(page.total).toBe(1);
    expect(page.items[0].class_ids.sort()).toEqual([
      "guppy",
      "sunshine",
      "twos",
    ]);
  }
  const id = records[0].id;
  const detail = await (await request.get(`/api/mail/${id}`)).json();
  expect(detail.attachments).toHaveLength(1);
  const file = await request.get(
    `/api/attachments/${detail.attachments[0].id}`,
  );
  expect(await file.text()).toContain("Acorn scavenger hunt");
  expect(file.headers()["content-disposition"]).toContain("attachment;");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await (await request.get(`/api/original/${id}`)).text()).toContain(
    `Message-ID: <${key}`,
  );
  for (const q of [
    "November checklist.txt",
    "scavenger hunt",
    "teacher@school.example.com",
  ]) {
    const page = await (
      await request.get(`/api/mail?q=${encodeURIComponent(q)}`)
    ).json();
    expect(page.items.some((item: { id: string }) => item.id === id)).toBe(
      true,
    );
  }
});
test("enforces imports, validates input, orders dates, and treats search literally", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/import", { data: fixtureMail("unauthorized") })
    ).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/import", { headers, data: "invalid" })).status(),
  ).toBe(422);
  expect((await request.get("/api/mail?class=unknown")).status()).toBe(400);
  expect((await request.get("/api/mail?page=-1")).status()).toBe(400);
  expect((await request.get("/api/mail?sort=DROP+TABLE")).status()).toBe(400);
  expect((await request.get(`/api/mail/${"f".repeat(64)}`)).status()).toBe(404);
  const key = `ordered-${crypto.randomUUID()}`;
  for (const [suffix, date] of [
    ["early", "Thu, 12 Nov 2026 09:00:00 -0800"],
    ["later", "Fri, 13 Nov 2026 09:00:00 -0800"],
  ]) {
    expect(
      (
        await request.post("/api/import", {
          headers,
          data: fixtureMail(`${key}-${suffix}`, CLASSES[0].email, date),
        })
      ).status(),
    ).toBe(201);
  }
  const oldest = await (
    await request.get(`/api/mail?q=${key}&sort=oldest`)
  ).json();
  expect(oldest.items[0].subject).toContain("early");
  const newest = await (
    await request.get(`/api/mail?q=${key}&sort=newest`)
  ).json();
  expect(newest.items[0].subject).toContain("later");
  const literal = await (await request.get("/api/mail?q=%25")).json();
  expect(literal.total).toBe(0);
});

test("receives real email events and rejects unauthorized envelope senders", async ({
  request,
}) => {
  const key = `email-event-${crypto.randomUUID()}`;
  const query = new URLSearchParams({
    from: "teacher@school.example.com",
    to: "notebook@example.com",
  });
  const accepted = await request.post(`/cdn-cgi/local/email?${query}`, {
    data: fixtureMail(key),
  });
  expect(accepted.status()).toBe(200);
  const found = await (await request.get(`/api/mail?q=${key}`)).json();
  expect(found.total).toBe(1);
  query.set("from", "outsider@example.com");
  const rejected = await request.post(`/cdn-cgi/local/email?${query}`, {
    data: fixtureMail(`${key}-rejected`),
  });
  expect(rejected.status()).toBe(400);
  const absent = await (
    await request.get(`/api/mail?q=${key}-rejected`)
  ).json();
  expect(absent.total).toBe(0);
});
