import { type APIRequestContext, expect, test } from "@playwright/test";
import type { LessonPlan } from "../../src/shared/plans";
import { htmlMail } from "../fixtures/html-mail";

const headers = { Authorization: "Bearer local-e2e-import-token" };
type Job = {
  id: string;
  kind: string;
  entity_id: string;
  status: string;
  attempt: number;
  error_message: string | null;
};
async function jobs(request: APIRequestContext): Promise<Job[]> {
  return (
    await (await request.get("/api/admin/translations", { headers })).json()
  ).jobs;
}
async function waitFor(
  request: APIRequestContext,
  entity: string,
  status: string,
) {
  await expect
    .poll(
      async () =>
        (await jobs(request))
          .filter((job) => job.entity_id === entity)
          .some((job) => job.status === status),
      { timeout: 30000 },
    )
    .toBe(true);
}
test("persists both mail languages, preserves formatting and images, and searches Chinese", async ({
  request,
  page,
}, info) => {
  const raw = htmlMail(`translation-transient-${crypto.randomUUID()}`);
  const response = await request.post("/api/import", { headers, data: raw });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await waitFor(request, id, "completed");
  const en = await (await request.get(`/api/mail/${id}?lang=en`)).json();
  const zh = await (await request.get(`/api/mail/${id}?lang=zh`)).json();
  expect(en.translationStatus).toBe("ready");
  expect(zh.translationStatus).toBe("ready");
  expect(zh.subject).not.toBe(en.subject);
  expect(zh.attachments[0].filename).toBe("画作.png");
  expect(zh.attachments[0].original_filename).toBe("art.png");
  await expect(
    (await request.get(`/api/original/${id}`)).body(),
  ).resolves.toEqual(Buffer.from(raw));
  expect(
    await (
      await request.get(`/api/attachments/${en.attachments[0].id}`)
    ).body(),
  ).toEqual(
    await (
      await request.get(`/api/attachments/${zh.attachments[0].id}`)
    ).body(),
  );
  const search = await (await request.get("/api/mail?q=多彩&lang=zh")).json();
  expect(search.items.some((mail: { id: string }) => mail.id === id)).toBe(
    true,
  );
  await page.goto(`/?view=mail&id=${id}`);
  const frame = page.frameLocator(".email-frame");
  await expect(
    frame.getByRole("heading", { name: "A colorful week" }),
  ).toHaveCSS("font-size", "28px");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(frame.getByRole("heading", { name: "多彩的一周" })).toHaveCSS(
    "color",
    "rgb(112, 80, 160)",
  );
  await expect(
    frame.getByRole("cell", { name: "星期一", exact: true }),
  ).toHaveCSS("background-color", "rgb(238, 231, 245)");
  await expect(frame.getByAltText("班级画作")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await expect(page.locator(".attachments")).toHaveCount(0);
  await expect(frame.getByRole("link", { name: "学校网站" })).toHaveAttribute(
    "href",
    "https://example.com/school",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("translated-email-zh.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "A colorful week" }),
  ).toHaveCSS("font-size", "28px");
  await page.screenshot({
    path: info.outputPath("translated-email-en.png"),
    fullPage: true,
  });
  const job = (await jobs(request)).find((job) => job.entity_id === id);
  expect(
    (await request.get(`/api/admin/translations/${job?.id}/input`)).status(),
  ).toBe(401);
  expect(
    (
      await request.get(`/api/admin/translations/${job?.id}/input`, { headers })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/admin/translations", {
        headers,
        data: { kind: "mail", ids: [id] },
      })
    ).status(),
  ).toBe(202);
  expect(
    (await jobs(request)).filter((job) => job.entity_id === id),
  ).toHaveLength(1);
});
test("translates current plans and daily details without dropping conflicting source entries", async ({
  request,
  page,
}, info) => {
  const { id } = await (
    await request.post("/api/import", {
      headers,
      data: htmlMail(`plan-translation-${crypto.randomUUID()}`),
    })
  ).json();
  const plan: LessonPlan = {
    classId: "sunshine",
    month: info.project.name === "mobile" ? "2089-11" : "2088-11",
    title: "A month of discoveries",
    theme: "Our neighborhood",
    overview: "Explore familiar places through stories, art and counting.",
    objectives: ["Recognize familiar places"],
    sourceMessageId: id,
    status: "published",
    days: [],
    monthlyReminders: ["Label all belongings"],
  };
  const date = `${plan.month}-13`;
  const day = {
    date,
    title: "Exploring our neighborhood",
    activities: [{ area: "Art", description: "Draw a familiar place" }],
    reminders: ["Wear a blue shirt"],
    bring: ["A favorite book"],
    note: "",
    noSchool: false,
  };
  const attachmentId = (await (await request.get(`/api/mail/${id}`)).json())
    .attachments[0].id;
  plan.days = [{ ...day, sourceAttachmentId: attachmentId, sourcePages: [1] }];
  plan.alternateDays = [{ ...day, reminders: ["Weekly table: wear red"] }];
  plan.sources = [
    {
      attachmentId,
      messageId: id,
      filename: "art.png",
      documentMonth: plan.month,
    },
  ];
  plan.sourceNotes = [
    {
      attachmentId,
      pages: [1],
      description:
        "Calendar: wear blue. Weekly table: wear red. Both source entries are retained.",
    },
  ];
  plan.weeks = [
    {
      startDate: date,
      endDate: `${plan.month}-17`,
      theme: "Around the neighborhood",
      focus: [{ area: "Language", items: ["Letter Rr"] }],
    },
  ];
  expect(
    (
      await request.post("/api/plans", {
        headers,
        data: { ...plan, title: "Earlier source title" },
      })
    ).status(),
  ).toBe(201);
  expect(
    (await request.post("/api/plans", { headers, data: plan })).status(),
  ).toBe(201);
  const entity = `sunshine:${plan.month}`;
  await waitFor(request, entity, "completed");
  await waitFor(request, entity, "superseded");
  const zh = (
    await (await request.get(`/api/plans?month=${plan.month}&lang=zh`)).json()
  ).items[0];
  const en = (
    await (await request.get(`/api/plans?month=${plan.month}&lang=en`)).json()
  ).items[0];
  expect(zh.title).toBe("发现的一个月");
  expect(en.title).toBe(plan.title);
  expect(zh.days[0].date).toBe(date);
  expect(zh.days[0].sourceAttachmentId).toBe(attachmentId);
  expect(zh.days[0].sourcePages).toEqual([1]);
  expect(zh.days[0].reminders).toEqual(["穿蓝色上衣"]);
  expect(zh.alternateDays[0].reminders).toEqual(["周表：穿红色衣服"]);
  const daily = await (
    await request.get(`/api/highlights?date=${date}&lang=zh`)
  ).json();
  expect(daily.classes[0].day.bring).toEqual(["一本喜欢的书"]);
  expect(daily.classes[0].weeklyFocus[0].focus[0].items).toEqual(["字母 Rr"]);
  expect(daily.classes[0].sourceNotes[0]).toContain("两项原文记录均保留");
  const search = await (await request.get("/api/mail?q=字母&lang=zh")).json();
  expect(search.items.some((mail: { id: string }) => mail.id === id)).toBe(
    true,
  );
  await page.clock.install({ time: new Date(`${date}T17:00:00Z`) });
  await page.goto(`/?view=plans&class=sunshine&month=${plan.month}`);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现的一个月" }),
  ).toBeVisible();
  await expect(
    page.getByText("月历：穿蓝色衣服。周表：穿红色衣服。两项原文记录均保留。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("translated-plan-zh.png"),
    fullPage: true,
  });
  await page.goto("/?class=sunshine");
  await expect(
    page.getByRole("heading", { name: "探索我们的社区" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Exploring our neighborhood" }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("translated-highlight-en.png"),
    fullPage: true,
  });
});
test("notifies translation failures, protects diagnostics, and retries to save both languages", async ({
  request,
  page,
}) => {
  test.setTimeout(60000);
  const { id } = await (
    await request.post("/api/import", {
      headers,
      data: htmlMail(`translation-retry-${crypto.randomUUID()}`),
    })
  ).json();
  await waitFor(request, id, "failed");
  const failed = (await jobs(request)).find((job) => job.entity_id === id);
  expect(failed?.error_message).not.toContain("private translation diagnostic");
  await expect
    .poll(
      async () => {
        const alerts = (
          await (await request.get("/api/admin/lessons", { headers })).json()
        ).alerts;
        return alerts.find(
          (alert: { id: string; status: string }) =>
            alert.id === `translation-${failed?.id}-1`,
        )?.status;
      },
      { timeout: 15000 },
    )
    .toBe("sent");
  await page.goto(`/?view=mail&id=${id}`);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByText("翻译暂时不可用，当前显示原文。", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await request.post(`/api/admin/translations/${failed?.id}/retry`)
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(`/api/admin/translations/${failed?.id}/retry`, {
        headers,
      })
    ).status(),
  ).toBe(202);
  await waitFor(request, id, "completed");
  expect(
    (await jobs(request)).find((job) => job.entity_id === id)?.attempt,
  ).toBe(2);
  await page.reload();
  await expect(
    page
      .frameLocator(".email-frame")
      .getByRole("heading", { name: "多彩的一周" }),
  ).toBeVisible();
  await expect(
    page.getByText("翻译暂时不可用，当前显示原文。", { exact: true }),
  ).toHaveCount(0);
});
