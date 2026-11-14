import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClassId } from "../../src/shared/classes";
import type { LessonPlan } from "../../src/shared/plans";
import { NEXT_HIGHLIGHT_DATE_SQL } from "../../src/worker/plans";
import { fixturePlan } from "../fixtures/plan";

describe("next recorded lesson date", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(
      "CREATE TABLE lesson_plans(class_id TEXT,month TEXT,status TEXT,document TEXT)",
    );
  });
  afterEach(() => db.close());
  function add(plan: LessonPlan) {
    db.prepare("INSERT INTO lesson_plans VALUES(?,?,?,?)").run(
      plan.classId,
      plan.month,
      plan.status,
      JSON.stringify(plan),
    );
  }
  function next(after: string, selected: ClassId | null = null) {
    return db
      .prepare(NEXT_HIGHLIGHT_DATE_SQL)
      .get(after.slice(0, 7), after, selected, selected)?.date;
  }
  it("skips unlisted weekend dates across a month and year boundary", () => {
    add(fixturePlan("a".repeat(64), "2044-12-30"));
    const january = fixturePlan("a".repeat(64), "2045-01-03");
    january.days.push(...fixturePlan("a".repeat(64), "2045-01-02").days);
    add(january);
    expect(next("2044-12-30")).toBe("2045-01-02");
    expect(next("2045-01-02")).toBe("2045-01-03");
    expect(next("2045-01-03")).toBeNull();
  });
  it("respects the selected classroom and finds the earliest date for all rooms", () => {
    add(fixturePlan("a".repeat(64), "2045-01-02"));
    add({ ...fixturePlan("a".repeat(64), "2045-01-03"), classId: "guppy" });
    expect(next("2044-12-30")).toBe("2045-01-02");
    expect(next("2044-12-30", "guppy")).toBe("2045-01-03");
    expect(next("2044-12-30", "twos")).toBeNull();
  });
  it("keeps explicit no-school notices as useful information", () => {
    const plan = fixturePlan("a".repeat(64), "2045-01-02");
    plan.days = plan.days.map((day) => ({
      ...day,
      title: "School closed",
      activities: [],
      reminders: [],
      bring: [],
      note: "",
      noSchool: true,
    }));
    add(plan);
    expect(next("2044-12-30")).toBe("2045-01-02");
  });
  it("uses an actual Saturday entry instead of assuming the next weekday", () => {
    add(fixturePlan("a".repeat(64), "2044-12-31"));
    expect(next("2044-12-30")).toBe("2044-12-31");
  });
  it("does not invent a daily entry from monthly reminders or weekly goals", () => {
    const plan = fixturePlan("a".repeat(64), "2045-01-02");
    add({
      ...plan,
      days: [],
      monthlyReminders: ["Label belongings"],
      weeks: [
        {
          startDate: "2045-01-02",
          endDate: "2045-01-06",
          theme: "Nature",
          focus: [],
        },
      ],
    });
    expect(next("2044-12-30")).toBeNull();
  });
  it("returns no date when the archive is empty or contains only past entries", () => {
    expect(next("2044-12-30")).toBeNull();
    add(fixturePlan("a".repeat(64), "2044-12-29"));
    expect(next("2044-12-30")).toBeNull();
  });
});
