import { type APIRequestContext, expect, test } from "@playwright/test";
import { addDays } from "../../src/shared/dates";
import type { LessonPlan, StoredPlan } from "../../src/shared/plans";
import { htmlMail } from "../fixtures/html-mail";
import { fixturePlan } from "../fixtures/plan";

const headers = { Authorization: "Bearer local-e2e-import-token" };
const monday = "2043-12-28";

async function seedWeek(request: APIRequestContext) {
  const imported = await request.post("/api/import?class=twos", {
    headers,
    data: htmlMail(`planner-${crypto.randomUUID()}`, "mixed"),
  });
  expect(imported.status()).toBe(201);
  const { id } = await imported.json();
  const mail = await (await request.get(`/api/mail/${id}`)).json();
  const pdf = mail.attachments.find(
    (a: { content_type: string }) => a.content_type === "application/pdf",
  );
  const source = {
    attachmentId: pdf.id,
    filename: "calendar.pdf",
    messageId: id,
    documentMonth: "2043-12",
  };
  const december = fixturePlan(id, monday);
  const original = december.days[0];
  if (!original) throw new Error("Missing fixture lesson day");
  const day = {
    ...original,
    title: "Exploring our neighborhood",
    bring: ["A favorite book"],
    sourceAttachmentId: pdf.id,
    sourcePages: [1],
  };
  const closure = {
    ...day,
    title: "Calendar closure",
    noSchool: true,
    activities: [],
    bring: [],
    reminders: [],
    sourcePages: [2],
  };
  const focus = {
    startDate: monday,
    endDate: "2044-01-03",
    theme: "Around the neighborhood",
    focus: [{ area: "Language", items: ["Letter Rr"] }],
  };
  const base: LessonPlan = {
    ...december,
    sources: [source],
    days: [day, { ...day, date: "2043-12-27", title: "Before the week" }],
    alternateDays: [closure],
    weeks: [
      focus,
      { ...focus, endDate: "2044-01-02" },
      { ...focus, startDate: "2044-01-02", theme: "Weekend workshop" },
    ],
    monthlyReminders: ["Label all belongings"],
    sourceNotes: [
      {
        attachmentId: pdf.id,
        pages: [1, 2],
        description: "Calendar and timetable differ.",
      },
    ],
  };
  const january: LessonPlan = {
    ...base,
    month: "2044-01",
    days: [
      { ...closure, date: "2044-01-01" },
      { ...day, date: "2044-01-02", title: "Saturday studio" },
      { ...closure, date: "2044-01-03", title: "Sunday closure" },
      { ...day, date: "2044-01-04", title: "Following Monday" },
    ],
    alternateDays: [
      { ...day, date: "2044-01-02", title: "Weekend alternative" },
    ],
  };
  for (const plan of [
    base,
    january,
    fixturePlan(id, "2043-07-31"),
    fixturePlan(id, "2043-08-03"),
    {
      ...base,
      classId: "twos",
      alternateDays: [],
      days: [{ ...day, title: "Music circle" }],
    },
    {
      ...january,
      classId: "twos",
      days: [],
      weeks: [
        {
          ...focus,
          startDate: "2044-01-04",
          endDate: "2044-01-08",
          theme: "Sound and rhythm",
        },
      ],
    },
  ])
    expect(
      (await request.post("/api/plans", { headers, data: plan })).status(),
    ).toBe(201);
  await expect
    .poll(
      async () => {
        const result: { items: StoredPlan[] } = await (
          await request.get(`/api/plans?week=${monday}&lang=zh`)
        ).json();
        return result.items.map((p) => p.translationStatus);
      },
      { timeout: 30000 },
    )
    .toEqual(["ready", "ready", "ready", "ready"]);
  return pdf.id as string;
}

test("reads five school days across years in both languages and keeps weekday source differences", async ({
  request,
  page,
  isMobile,
}) => {
  test.setTimeout(90000);
  const pdf = await seedWeek(request);
  await page.clock.setFixedTime(new Date("2044-01-01T05:00:00Z")); // Thursday in Los Angeles.
  await page.goto("/?view=plans&class=sunshine&month=2043-12");
  await expect(
    page.getByRole("link", { name: "Month view", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  let failWeek = true;
  await page.route("**/api/plans?*", (route) => {
    if (failWeek && new URL(route.request().url()).searchParams.has("week")) {
      failWeek = false;
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    }
    return route.continue();
  });
  await page.getByRole("link", { name: "Week view", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  const agenda = page.locator(".week-agenda");
  const focus = page.locator(".week-focus");
  for (const lang of ["en", "zh"] as const) {
    if (lang === "zh")
      await page.getByRole("button", { name: "中文", exact: true }).click();
    const chinese = lang === "zh";
    await expect(
      page.getByRole("link", {
        name: chinese ? "周视图" : "Week view",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(/week=2043-12-28/);
    await expect(agenda.locator("time")).toHaveCount(5);
    expect(
      await agenda
        .locator("time")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("datetime"))),
    ).toEqual(Array.from({ length: 5 }, (_, i) => addDays(monday, i)));
    const range = chinese
      ? "2043年12月28日至2044年1月1日"
      : /Dec 28, 2043\s*–\s*Jan 1, 2044/;
    await expect(page.locator("#week-range")).toHaveText(range);
    await expect(focus.locator(".week-theme small")).toHaveText(range);
    await expect(agenda.locator('[aria-current="date"] time')).toHaveAttribute(
      "datetime",
      "2043-12-31",
    );
    const row = (date: string) =>
      agenda
        .locator("li.week-day")
        .filter({ has: page.locator(`time[datetime="${date}"]`) });
    await expect(row("2043-12-29")).toContainText(
      chinese ? "未列出安排" : "No entry listed",
    );
    await expect(row("2043-12-29")).not.toContainText(
      chinese ? "学校放假" : "No school",
    );
    await expect(row("2044-01-01").locator(".week-closure")).toHaveText(
      chinese ? "学校放假" : "No school",
    );
    await expect(row("2044-01-02")).toHaveCount(0);
    await expect(row("2044-01-03")).toHaveCount(0);
    await expect(agenda).not.toContainText("Weekend alternative");
    await expect(agenda).not.toContainText("Following Monday");
    await expect(agenda).not.toContainText("Before the week");
    const record = row(monday).locator(".week-entry");
    await expect(record.locator("summary")).toContainText(
      chinese ? "一本喜欢的书" : "A favorite book",
    );
    await record.locator("summary").focus();
    await record.locator("summary").press("Enter");
    await expect(record.locator(".objectives")).toContainText(
      chinese ? "月历标注停课" : "Calendar closure",
    );
    await expect(record.locator(`a[href$="#page=2"]`)).toHaveAttribute(
      "href",
      `/api/attachments/${pdf}?preview=1#page=2`,
    );
    await record.locator("summary").press("Enter");
    await expect(focus.locator(".week-theme")).toHaveCount(1);
    if (isMobile) {
      const jump = agenda.getByRole("link", {
        name: chinese ? "本周学习重点" : "This week's focus",
      });
      if (chinese) await jump.press("Enter");
      else await jump.tap();
      await expect(focus).toBeFocused();
      await expect(focus.getByRole("heading").first()).toBeInViewport();
      await expect(page).toHaveURL(/week=2043-12-28#week-focus$/);
      await page.goBack();
      await expect(page).toHaveURL(/week=2043-12-28$/);
    }
    await focus.locator(".week-theme summary").click();
    await expect(focus.locator("dd")).toHaveText(
      chinese ? "字母 Rr" : "Letter Rr",
    );
    await focus.locator(".week-theme summary").click();
    await focus.locator(".week-references summary").click();
    await expect(focus.locator(".week-month-source").first()).toContainText(
      chinese ? "为所有物品写上姓名" : "Label all belongings",
    );
    await expect(
      focus
        .locator(".week-month-source")
        .first()
        .getByRole("link", {
          name: chinese ? "查看来源邮件" : "Read the source email",
        }),
    ).toBeVisible();
    await focus.locator(".week-references summary").click();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  const filters = page.getByRole("navigation", { name: "按班级筛选" });
  await filters.getByRole("link", { name: "全部班级" }).click();
  await expect(agenda.locator("li").first().locator(".week-entry")).toHaveCount(
    2,
  );
  await filters.getByRole("link", { name: "两岁班" }).click();
  await expect(agenda).toContainText("Music circle");
  await page.getByRole("link", { name: "下一周", exact: true }).click();
  await expect(page.getByLabel("月份", { exact: true })).toHaveValue("2044-01");
  await expect(agenda.locator(".week-unlisted")).toHaveCount(5);
  await expect(focus).toContainText("Sound and rhythm");
  await page.goBack();
  await expect(agenda).toContainText("Music circle");
  await page.goForward();
  await page.reload();
  await expect(focus).toContainText("Sound and rhythm");
  const weekRead = "**/api/plans?*week=2044-01-11&*";
  const gate = Promise.withResolvers<void>();
  await page.route(weekRead, async (route) => {
    await gate.promise;
    await route.continue();
  });
  try {
    const reading = page.waitForRequest(weekRead);
    await page.getByRole("link", { name: "下一周", exact: true }).click();
    await reading;
    await expect(focus).toContainText("Sound and rhythm");
    await page.getByRole("link", { name: "月视图", exact: true }).click();
    await page.getByRole("link", { name: "周视图", exact: true }).click();
    await expect(page).toHaveURL(/week=2044-01-11/);
  } finally {
    gate.resolve();
  }
  await filters.getByRole("link", { name: "小鱼班" }).click();
  await expect(
    page.getByRole("heading", { name: "这周还没有课程计划。" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "本周", exact: true }).click();
  await expect(page).toHaveURL(/week=2043-12-28/);
  await expect(page.getByLabel("月份", { exact: true })).toHaveValue("2043-12");
  await page.getByRole("link", { name: "月视图", exact: true }).click();
  await expect(page).not.toHaveURL(/week=/);
  await page.goto(
    "/?view=plans&class=sunshine&month=2044-01&week=2044-01-02#week-focus",
  );
  await expect(page).toHaveURL(/month=2044-01&week=2043-12-28#week-focus$/);
  await expect(agenda.locator("time").last()).toHaveAttribute(
    "datetime",
    "2044-01-01",
  );
  await page.getByLabel("月份", { exact: true }).selectOption("2043-12");
  await expect(page).toHaveURL(/month=2043-12&week=2043-12-28/);
  await page.goto("/?view=plans&class=sunshine&month=2043-12&week=2044-02-30");
  await expect(page).toHaveURL(/week=2043-12-28/);
  await page.goto("/?view=plans&class=sunshine&month=2044-01");
  for (const language of ["中文", "English"]) {
    await page.getByRole("button", { name: language, exact: true }).click();
    const list = page.locator(".plan-days");
    await expect(list.locator(".plan-day")).toHaveCount(3);
    await expect(list.locator(".day-date strong")).toHaveText(["01", "04"]);
    await expect(list).not.toContainText(
      /Saturday studio|Sunday closure|Weekend alternative|Weekend workshop/,
    );
    await expect(list.locator("summary").first()).toContainText(
      language === "中文"
        ? "2043年12月28日至2044年1月1日"
        : /Dec 28, 2043\s*–\s*Jan 1, 2044/,
    );
  }
  await page.getByLabel("Month", { exact: true }).selectOption("2043-08");
  await page.getByRole("link", { name: "Week view", exact: true }).click();
  await expect(page).toHaveURL(/month=2043-08&week=2043-08-03$/);
  await expect(agenda.locator("time").first()).toHaveAttribute(
    "datetime",
    "2043-08-03",
  );
  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(page).toHaveURL(/month=2043-07&week=2043-07-27$/);
  await expect(agenda.locator("time").last()).toHaveAttribute(
    "datetime",
    "2043-07-31",
  );
});
