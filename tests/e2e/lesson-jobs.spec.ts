import { type APIRequestContext, expect, test } from "@playwright/test";
import { fixtureLessonMail } from "../fixtures/lesson-mail";

const headers = { Authorization: "Bearer local-e2e-import-token" };
type Job = {
  id: string;
  attachment_id: string;
  status: string;
  attempt: number;
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
  const searched = await (await request.get("/api/mail?q=letter%20rr")).json();
  expect(
    searched.items.some((mail: { id: string }) => mail.id === imported.id),
  ).toBe(true);
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
  await expect(page.getByText("NOTES FROM THE ORIGINAL SOURCES")).toBeVisible();
  await expect(
    page
      .getByText(
        "Calendar: wear blue. Weekly table: wear red. Both source entries are retained.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText("ALL MONTH LONG")).toBeVisible();
  await page
    .getByText("Exploring our neighborhood", { exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Weekly table: wear red", { exact: false }).first(),
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
  const before = await (
    await request.get("/api/plans?month=2027-11&class=sunshine")
  ).json();
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
  expect(
    await (await request.get("/api/plans?month=2027-11&class=sunshine")).json(),
  ).toEqual(before);
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
  const job = (await jobs(request)).jobs.find((entry) => entry.result_key);
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
