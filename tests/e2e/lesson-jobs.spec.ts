import { type APIRequestContext, expect, test } from "@playwright/test";
import { fixtureLessonMail } from "../fixtures/lesson-mail";

const headers = { Authorization: "Bearer local-e2e-import-token" };
type Job = {
  id: string;
  attachment_id: string;
  status: string;
  attempt: number;
  error_code: string | null;
  response_id: string | null;
  error_message: string | null;
  result_key: string | null;
};
async function jobs(request: APIRequestContext) {
  return (await (
    await request.get("/api/admin/lessons", { headers })
  ).json()) as {
    jobs: Job[];
    alerts: { job_id: string; status: string; provider_message_id: string }[];
  };
}
async function importLesson(request: APIRequestContext, scenario: string) {
  const key = crypto.randomUUID();
  const raw = fixtureLessonMail(
    key,
    `November Lesson Plan Sunshine 2027 ${scenario}-${key}.pdf`,
  );
  const imported = await request.post("/api/import", { headers, data: raw });
  expect(imported.status()).toBe(201);
  const { id } = await imported.json();
  const mail = await (await request.get(`/api/mail/${id}`)).json();
  return { id, raw, attachmentId: mail.attachments[0].id as string };
}
test("automatically parses PDFs, preserves source differences and delivers a notification", async ({
  request,
  page,
}) => {
  const imported = await importLesson(request, "contradiction");
  await expect
    .poll(
      async () =>
        (await jobs(request)).jobs.find(
          (job) => job.attachment_id === imported.attachmentId,
        )?.status,
      { timeout: 30000 },
    )
    .toBe("published");
  const job = (await jobs(request)).jobs.find(
    (entry) => entry.attachment_id === imported.attachmentId,
  );
  expect(job).toBeDefined();
  await expect
    .poll(
      async () =>
        (await jobs(request)).alerts.find((alert) => alert.job_id === job?.id)
          ?.status,
      { timeout: 15000 },
    )
    .toBe("sent");
  expect(
    (await jobs(request)).alerts.find((alert) => alert.job_id === job?.id)
      ?.provider_message_id,
  ).toBeTruthy();
  const before = (await jobs(request)).jobs.length;
  expect(
    (
      await request.post("/api/import", { headers, data: imported.raw })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post("/api/admin/lessons", {
        headers,
        data: { attachmentIds: [imported.attachmentId] },
      })
    ).status(),
  ).toBe(202);
  expect((await jobs(request)).jobs).toHaveLength(before);
  const daily = await (
    await request.get("/api/highlights?date=2027-11-30")
  ).json();
  expect(daily.classes[0].day.reminders).toContain("Weekly table: wear red");
  expect(daily.classes[0].sourceNotes.join(" ")).toContain(
    "Calendar: wear blue",
  );
  expect(daily.classes[0].weeklyFocus[0].focus[0].items).toContain("Letter Rr");
  for (const [language, title] of [
    ["en", "Calendar closure"],
    ["zh", "月历标注停课"],
  ]) {
    await expect
      .poll(
        async () => {
          const data = await (
            await request.get(
              `/api/highlights?date=2027-11-30&lang=${language}`,
            )
          ).json();
          return data.classes[0].alternatives;
        },
        { timeout: 20000 },
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title,
            noSchool: true,
            sourceAttachmentId: imported.attachmentId,
            sourcePages: [2],
          }),
        ]),
      );
  }
  const searched = await (await request.get("/api/mail?q=letter%20rr")).json();
  expect(
    searched.items.some((mail: { id: string }) => mail.id === imported.id),
  ).toBe(true);
  const copy = await request.post("/api/import", {
    headers,
    data: imported.raw
      .replace(/^Subject:.*$/m, "Subject: An updated attachment")
      .replace(
        /^Message-ID:.*$/m,
        `Message-ID: <${crypto.randomUUID()}@example.com>`,
      )
      .replace(/filename="[^"]+"/, 'filename="copy.pdf"')
      .replace("Classroom lesson plan attached.", "Please see the attachment."),
  });
  expect(copy.status()).toBe(201);
  const { id: copyId } = await copy.json();
  expect(copyId).not.toBe(imported.id);
  const copyDetail = await (await request.get(`/api/mail/${copyId}`)).json();
  expect(copyDetail.class_ids).toEqual(["sunshine"]);
  expect(copyDetail.attachments[0].text_status).toBe("extracted");
  for (const q of ["Letter Rr", "字母 Rr"]) {
    const ids: string[] = [];
    let pages = 1;
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      const result = await (
        await request.get(
          `/api/mail?${new URLSearchParams({ class: "sunshine", q, page: String(pageNumber) })}`,
        )
      ).json();
      ids.push(...result.items.map((item: { id: string }) => item.id));
      pages = Math.ceil(result.total / result.pageSize);
    }
    expect(ids).toEqual(expect.arrayContaining([imported.id, copyId]));
  }
  expect((await jobs(request)).jobs).toHaveLength(before);
  expect(
    (
      await request.post(`/api/admin/lessons/${job?.id}/index`, { headers })
    ).status(),
  ).toBe(200);
  await page.clock.install({ time: new Date("2027-11-30T17:00:00Z") });
  await page.goto("/?class=sunshine");
  await page.getByText("This week's focus", { exact: true }).click();
  await expect(page.getByText("Letter Rr", { exact: false })).toBeVisible();
  expect(
    (await (await request.get(`/api/mail/${imported.id}`)).json()).class_ids,
  ).toContain("sunshine");
  await page.goto("/?view=plans&month=2027-11&class=sunshine");
  const sourceNote =
    "Calendar: wear blue. Weekly table: wear red. Both source entries are retained.";
  for (const [heading, content] of [
    ["ALL MONTH LONG", "Label all belongings"],
    ["NOTES FROM THE ORIGINAL SOURCES", sourceNote],
    ["LITTLE STEPS WE'RE WORKING ON", "Recognize familiar places"],
  ] as const) {
    const toggle = page.getByText(heading, { exact: true });
    const section = page.locator("details").filter({ has: toggle });
    const items = section.getByText(content, { exact: true });
    const visibleItems = items.filter({ visible: true });
    await expect(toggle).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    await expect(visibleItems).toHaveCount(0);
    await toggle.click();
    await expect(visibleItems).toHaveCount(count);
    await toggle.click();
    await expect(visibleItems).toHaveCount(0);
  }
  const today = page.locator("details").filter({
    has: page.locator("summary").getByText("Exploring our neighborhood"),
  });
  await expect(
    today
      .locator(".plan-day-body > p")
      .filter({ hasText: "Weekly table: wear red" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const carryover = await (
    await request.get("/api/plans?month=2027-12&class=sunshine")
  ).json();
  expect(carryover.items[0].sourceKind).toBe("carryover");
});
test("retries transient provider errors and reports persistent failure without damaging plans", async ({
  request,
}) => {
  test.setTimeout(60000);
  const good = await importLesson(request, "transient");
  await expect
    .poll(
      async () =>
        (await jobs(request)).jobs.find(
          (job) => job.attachment_id === good.attachmentId,
        )?.status,
      { timeout: 25000 },
    )
    .toBe("published");
  const currentPlan = async () =>
    (
      await request.get("/api/plans?month=2027-11&class=sunshine&lang=en")
    ).json();
  await expect
    .poll(async () => (await currentPlan()).items[0]?.translationStatus)
    .toBe("ready");
  const before = await currentPlan();
  const bad = await importLesson(request, "failure");
  await expect
    .poll(
      async () =>
        (await jobs(request)).jobs.find(
          (job) => job.attachment_id === bad.attachmentId,
        )?.status,
      { timeout: 25000 },
    )
    .toBe("failed");
  const failed = (await jobs(request)).jobs.find(
    (job) => job.attachment_id === bad.attachmentId,
  );
  expect(failed?.error_message).not.toContain("private provider diagnostic");
  await expect
    .poll(
      async () =>
        (await jobs(request)).alerts.find(
          (alert) => alert.job_id === failed?.id,
        )?.status,
      { timeout: 10000 },
    )
    .toBe("sent");
  expect(await currentPlan()).toEqual(before);
  expect(
    (
      await request.post(`/api/admin/lessons/${failed?.id}/retry`, { headers })
    ).status(),
  ).toBe(202);
  expect(
    (await jobs(request)).jobs.find((job) => job.id === failed?.id)?.attempt,
  ).toBe(2);
});
test("protects operations and raw model results with admin authentication", async ({
  request,
}) => {
  expect((await request.get("/api/admin/lessons")).status()).toBe(401);
  expect(
    (await request.post("/api/admin/lessons/notification-test")).status(),
  ).toBe(401);
  const seeded = await importLesson(request, "admin-access");
  await expect
    .poll(
      async () =>
        (await jobs(request)).jobs.find(
          (entry) => entry.attachment_id === seeded.attachmentId,
        )?.status,
      { timeout: 20000 },
    )
    .toBe("published");
  const job = (await jobs(request)).jobs.find(
    (entry) => entry.attachment_id === seeded.attachmentId && entry.result_key,
  );
  expect(job).toBeDefined();
  expect(
    (await request.get(`/api/admin/lessons/${job?.id}/result`)).status(),
  ).toBe(401);
  expect(
    (
      await request.get(`/api/admin/lessons/${job?.id}/result`, { headers })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/admin/lessons", {
        headers,
        data: { attachmentIds: ["f".repeat(64)] },
      })
    ).status(),
  ).toBe(422);
});

test("publishes the original background response when it finishes after a polling timeout", async ({
  request,
}) => {
  test.setTimeout(120000);
  const { attachmentId } = await importLesson(request, "slow-response");
  const readJob = async () =>
    (await jobs(request)).jobs.find(
      (job) => job.attachment_id === attachmentId,
    );
  await expect
    .poll(async () => (await readJob())?.status, { timeout: 90000 })
    .toBe("failed");
  const failed = await readJob();
  if (!failed?.response_id) throw new Error("Missing background response");
  expect(failed.error_code).toBe("provider_poll_timeout");
  const released = await request.post(
    `http://127.0.0.1:5199/fixture/complete/${failed.response_id}`,
    { headers: { Authorization: "Bearer local-fixture-provider" } },
  );
  expect(await released.json()).toEqual({ released: true });
  expect(
    (
      await request.post(`/api/admin/lessons/${failed.id}/retry`, { headers })
    ).status(),
  ).toBe(202);
  await expect.poll(readJob, { timeout: 20000 }).toMatchObject({
    status: "published",
    attempt: 2,
    response_id: failed.response_id,
  });
  const result = await request.get(`/api/admin/lessons/${failed.id}/result`, {
    headers,
  });
  expect(await result.json()).toMatchObject({
    id: failed.response_id,
    status: "completed",
  });
});

test("processes actual email events and ignores unrelated PDFs without a false alert", async ({
  request,
}) => {
  const key = crypto.randomUUID();
  const filename = `registration-${key}.pdf`;
  const delivered = await request.post(
    `/cdn-cgi/local/email?${new URLSearchParams({ from: "teacher@school.example.com", to: "notebook@example.com" })}`,
    { data: fixtureLessonMail(key, filename) },
  );
  expect(delivered.status()).toBe(200);
  const mail = await (await request.get(`/api/mail?q=${key}`)).json();
  expect(mail.total).toBe(1);
  const detail = await (
    await request.get(`/api/mail/${mail.items[0].id}`)
  ).json();
  const attachmentId = detail.attachments[0].id;
  await expect
    .poll(
      async () =>
        (await jobs(request)).jobs.find(
          (job) => job.attachment_id === attachmentId,
        )?.status,
      { timeout: 20000 },
    )
    .toBe("ignored");
  const job = (await jobs(request)).jobs.find(
    (entry) => entry.attachment_id === attachmentId,
  );
  expect(
    (await request.post("/api/admin/lessons/reconcile", { headers })).status(),
  ).toBe(200);
  const state = await jobs(request);
  expect(state.jobs.find((entry) => entry.id === job?.id)?.status).toBe(
    "ignored",
  );
  expect(state.alerts.filter((alert) => alert.job_id === job?.id)).toEqual([]);
});

test("recognizes Chinese-only lesson notices and forwarded classroom headers", async ({
  request,
}) => {
  const key = `zh-lesson-${crypto.randomUUID()}`;
  const subject = Buffer.from(`本月教学计划 ${key}`).toString("base64");
  const raw = fixtureLessonMail(key, "calendar.pdf")
    .replace(/^Subject:.*$/m, `Subject: =?UTF-8?B?${subject}?=`)
    .replace(
      "Content-Type: text/plain",
      "Content-Type: text/plain; charset=utf-8",
    )
    .replace(
      "Classroom lesson plan attached.",
      "请查收附件。\r\n> 收件人：parents-guppy@school.example.com",
    );
  const response = await request.post(
    "/cdn-cgi/local/email?from=parent@example.com&to=notebook@example.com",
    { data: raw },
  );
  expect(response.status()).toBe(200);
  const result = await (
    await request.get(`/api/mail?class=guppy&q=${key}`)
  ).json();
  expect(result.total).toBe(1);
  const { id } = result.items[0];
  const file = (await (await request.get(`/api/mail/${id}`)).json())
    .attachments[0];
  await expect
    .poll(
      async () =>
        (await jobs(request)).jobs.find((job) => job.attachment_id === file.id)
          ?.status,
      { timeout: 20000 },
    )
    .toBe("published");
  for (const lang of ["zh", "en"]) {
    const mail = await (
      await request.get(`/api/mail/${id}?lang=${lang}`)
    ).json();
    expect(mail.class_ids.sort()).toEqual(["guppy", "sunshine"]);
  }
});
