import { expect, test } from "@playwright/test";
import { CLASSES } from "../../src/shared/classes";
import { fixtureMail, forwardedMail, mailConfig } from "../fixtures/mail";

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
      request.post("/api/import", {
        headers,
        data: fixtureMail(key, mailConfig.classEmails[c.id]),
      }),
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
    const foundIds: string[] = [];
    let totalPages = 1;
    for (let number = 1; number <= totalPages; number++) {
      const response = await request.get(
        `/api/mail?q=${encodeURIComponent(q)}&page=${number}`,
      );
      expect(response.status()).toBe(200);
      const page = await response.json();
      totalPages = Math.ceil(page.total / page.pageSize);
      foundIds.push(...page.items.map((item: { id: string }) => item.id));
    }
    expect(foundIds).toContain(id);
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
          data: fixtureMail(
            `${key}-${suffix}`,
            mailConfig.classEmails.sunshine,
            date,
          ),
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

test("exposes only the public inbound address, never the sender allowlist or class email mapping", async ({
  request,
}) => {
  const site = await (await request.get("/api/site")).json();
  expect(site).toEqual({ inboundAddress: mailConfig.inboundAddress });
  const stats = await (await request.get("/api/stats")).json();
  for (const classroom of stats.classes)
    expect(classroom).not.toHaveProperty("email");
});

test("archives forwarded batches as separate originals and deduplicates repeated list deliveries", async ({
  request,
}) => {
  const key = `batch-${crypto.randomUUID()}`;
  const originals = [
    fixtureMail(`${key}-shared`),
    fixtureMail(`${key}-shared`, mailConfig.classEmails.guppy),
    fixtureMail(`${key}-twos`, mailConfig.classEmails.twos),
  ];
  const wrapper = forwardedMail(originals, mailConfig.classEmails.twos);
  const query = new URLSearchParams({
    from: "parent@example.com",
    to: mailConfig.inboundAddress,
  });
  const response = await request.post(`/cdn-cgi/local/email?${query}`, {
    data: wrapper,
  });
  expect(response.status(), await response.text()).toBe(200);
  const page = await (await request.get(`/api/mail?q=${key}`)).json();
  expect(page.total).toBe(2);
  for (const [suffix, expectedClasses, original] of [
    ["shared", ["guppy", "sunshine"], originals[0]],
    ["twos", ["twos"], originals[2]],
  ] as const) {
    const found = await (
      await request.get(`/api/mail?q=${key}-${suffix}`)
    ).json();
    expect(found.total).toBe(1);
    const item = found.items[0];
    expect(item.class_ids.sort()).toEqual(expectedClasses);
    expect(item.sent_at).toBe("2026-11-13T17:00:00.000Z");
    expect(item.sender).toBe("teacher@school.example.com");
    expect(await (await request.get(`/api/original/${item.id}`)).text()).toBe(
      original,
    );
    const detail = await (await request.get(`/api/mail/${item.id}`)).json();
    expect(detail.attachments).toHaveLength(1);
    expect(
      await (
        await request.get(`/api/attachments/${detail.attachments[0].id}`)
      ).text(),
    ).toContain("Acorn scavenger hunt");
  }
  const repeated = await request.post("/api/import", {
    headers,
    data: wrapper,
  });
  expect(repeated.status()).toBe(201);
  const imported = await repeated.json();
  expect(imported.messages).toHaveLength(3);
  expect(imported.messages[0].id).toBe(imported.messages[1].id);
  expect((await (await request.get(`/api/mail?q=${key}`)).json()).total).toBe(
    2,
  );
  for (const c of CLASSES) {
    expect(
      (await (await request.get(`/api/mail?q=${key}&class=${c.id}`)).json())
        .total,
    ).toBe(1);
  }
});

test("rejects malformed and oversized batches before storing any member", async ({
  request,
}) => {
  const key = `invalid-batch-${crypto.randomUUID()}`;
  const query = new URLSearchParams({
    from: "parent@example.com",
    to: mailConfig.inboundAddress,
  });
  const rejected = await request.post(`/cdn-cgi/local/email?${query}`, {
    data: forwardedMail([fixtureMail(key), "not an email"]),
  });
  expect(rejected.status()).toBe(400);
  expect(await rejected.text()).toContain("From address");
  const tooMany = await request.post("/api/import", {
    headers,
    data: forwardedMail(
      Array.from({ length: 21 }, (_, i) => fixtureMail(`${key}-${i}`)),
    ),
  });
  expect(tooMany.status()).toBe(422);
  expect((await (await request.get(`/api/mail?q=${key}`)).json()).total).toBe(
    0,
  );
});
