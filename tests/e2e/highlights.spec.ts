import { expect, test } from "@playwright/test";
import type { Highlights, LessonPlan } from "../../src/shared/plans";
import { fixtureMail, mailConfig } from "../fixtures/mail";
import { fixturePlan } from "../fixtures/plan";

const headers = { Authorization: "Bearer local-e2e-import-token" };

test("finds the next recorded date across weekends and years in both languages", async ({
  request,
  page,
}, info) => {
  const imported = await request.post("/api/import", {
    headers,
    data: fixtureMail(
      `next-day-${crypto.randomUUID()}`,
      Object.values(mailConfig.classEmails).join(", "),
    ),
  });
  expect(imported.status()).toBe(201);
  const { id } = await imported.json();
  const monday = fixturePlan(id, "2096-01-02");
  const day = monday.days[0];
  if (!day) throw new Error("Missing fixture day");
  day.title = "Exploring our neighborhood";
  const plans: LessonPlan[] = [
    fixturePlan(id, "2095-12-30"),
    monday,
    {
      ...fixturePlan(id, "2096-01-03"),
      classId: "guppy",
      days: [
        {
          ...day,
          date: "2096-01-03",
          title: "School closed",
          activities: [],
          bring: [],
          noSchool: true,
        },
      ],
    },
    {
      ...monday,
      classId: "twos",
      days: [],
      monthlyReminders: ["Label belongings"],
    },
  ];
  for (const plan of plans)
    expect(
      (await request.post("/api/plans", { headers, data: plan })).status(),
    ).toBe(201);
  for (const [selected, expectedDate] of [
    ["all", "2096-01-02"],
    ["sunshine", "2096-01-02"],
    ["guppy", "2096-01-03"],
    ["twos", null],
  ] as const) {
    const response = await request.get(
      `/api/highlights?after=2095-12-30&class=${selected}&lang=en`,
    );
    expect(response.status()).toBe(200);
    const data: Highlights = await response.json();
    expect(data.date).toBe(expectedDate);
    expect(data.classes).toHaveLength(
      expectedDate === null ? 0 : selected === "all" ? 3 : 1,
    );
    if (selected === "guppy") expect(data.classes[0]?.day?.noSchool).toBe(true);
  }
  const unchanged = await (
    await request.get("/api/highlights?date=2095-12-31&class=sunshine")
  ).json();
  expect(unchanged.date).toBe("2095-12-31");
  expect(unchanged.classes[0].status).toBe("no-day");
  await expect
    .poll(async () => {
      const data = await (
        await request.get(
          "/api/highlights?after=2095-12-30&class=sunshine&lang=zh",
        )
      ).json();
      return data.classes[0].translationStatus;
    })
    .toBe("ready");
  // UTC Saturday is still Friday on campus.
  await page.clock.install({ time: new Date("2095-12-31T07:30:00Z") });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [
    language,
    tomorrow,
    next,
    guppy,
    twos,
    all,
    empty,
    noSchool,
    title,
  ] of [
    [
      "English",
      "Tomorrow",
      "Next up",
      "Guppy Room",
      "Twos Town",
      "All classrooms",
      "No upcoming entries yet.",
      "NO SCHOOL",
      "Exploring our neighborhood",
    ],
    [
      "中文",
      "明天",
      "下次安排",
      "小鱼班",
      "两岁班",
      "全部班级",
      "还没有后续日期的安排。",
      "学校放假",
      "探索我们的社区",
    ],
  ] as const) {
    await page.goto("/?class=sunshine");
    await page.getByRole("button", { name: language, exact: true }).click();
    await expect(page.locator(".date-line time")).toHaveAttribute(
      "datetime",
      "2095-12-30",
    );
    await page.getByRole("link", { name: tomorrow, exact: true }).click();
    await expect(page.locator(".date-line time")).toHaveAttribute(
      "datetime",
      "2096-01-02",
    );
    await expect(
      page.getByRole("link", { name: next, exact: true }),
    ).toHaveAttribute("aria-current", "date");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".next-day-note")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        `next-day-${language === "English" ? "en" : "zh"}.png`,
      ),
    });
    const filters = page.locator(".class-filters");
    await filters.getByRole("link", { name: guppy, exact: true }).click();
    await expect(page.locator(".date-line time")).toHaveAttribute(
      "datetime",
      "2096-01-03",
    );
    await expect(page.locator(".day-card .small-label").first()).toHaveText(
      noSchool,
    );
    await filters.getByRole("link", { name: twos, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: empty, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".day-card, .date-line time")).toHaveCount(0);
    await filters.getByRole("link", { name: all, exact: true }).click();
    await expect(page.locator(".date-line time")).toHaveAttribute(
      "datetime",
      "2096-01-02",
    );
    await expect(page.locator(".day-card")).toHaveCount(3);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("day") === "tomorrow",
    );
  }
  expect(errors).toEqual([]);
});

test("rejects invalid next-date requests and returns an honest empty result", async ({
  request,
}) => {
  for (const query of [
    "after=2096-02-30",
    "after=",
    "after=invalid",
    "date=2095-12-30&after=2095-12-30",
    "after=2095-12-30&class=unknown",
  ])
    expect((await request.get(`/api/highlights?${query}`)).status()).toBe(400);
  const response = await request.get("/api/highlights?after=2100-01-01");
  expect(response.status()).toBe(200);
  const data: Highlights = await response.json();
  expect(data.date).toBeNull();
  expect(data.classes).toEqual([]);
  expect(data.timeZone).toBe("America/Los_Angeles");
});
