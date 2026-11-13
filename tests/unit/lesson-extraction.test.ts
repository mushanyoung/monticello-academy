import { describe, expect, it } from "vitest";
import {
  extractedPlans,
  lessonFileHint,
  mergeExtractedPlan,
  validateExtraction,
} from "../../src/shared/lesson-extraction";
import { fixtureExtraction, fixtureLessonSource } from "../fixtures/extraction";

describe("lesson document rules", () => {
  it("recognizes classroom/month hints without guessing ambiguous filenames", () => {
    expect(
      lessonFileHint("August Lesson Plan Two’s Town 2027.pdf"),
    ).toMatchObject({
      classId: "twos",
      month: "2027-08",
      expectedLesson: true,
    });
    expect(
      lessonFileHint("Sunshine Guppy July August 2027 2028.pdf"),
    ).toMatchObject({ classId: null, month: null });
  });
  it("validates source identity, real calendar dates, uniqueness and page evidence", () => {
    const data = fixtureExtraction();
    expect(validateExtraction(data, fixtureLessonSource.filename)).toEqual([]);
    const first = data.days[0];
    if (!first) throw new Error("Missing fixture day");
    data.days.push({ ...first, date: "2027-11-31", pages: [3] });
    data.days.push({ ...first });
    const issues = validateExtraction(
      data,
      "November Lesson Plan Guppy 2027.pdf",
    );
    expect(issues.map((issue) => issue.description).join(" ")).toMatch(
      /classroom conflicts/,
    );
    expect(issues.map((issue) => issue.description).join(" ")).toMatch(
      /Invalid or out-of-range date/,
    );
    expect(issues.map((issue) => issue.description).join(" ")).toMatch(
      /Duplicate date/,
    );
    expect(issues.map((issue) => issue.description).join(" ")).toMatch(
      /Invalid source page/,
    );
  });
  it("flags contradictory closures, missing coverage and invalid weeks", () => {
    const data = fixtureExtraction();
    const first = data.days[0];
    if (!first) throw new Error("Missing fixture day");
    first.noSchool = true;
    const week = data.weeks[0];
    if (!week) throw new Error("Missing fixture week");
    week.endDate = "2027-11-20";
    const issues = validateExtraction(data, fixtureLessonSource.filename);
    expect(issues.some((issue) => issue.code === "conflicting-source")).toBe(
      true,
    );
    expect(
      issues.some((issue) => issue.description.includes("weekly date range")),
    ).toBe(true);
    expect(
      issues.some((issue) => issue.description.includes("does not belong")),
    ).toBe(true);
  });
  it("ignores unrelated PDFs but flags a named lesson plan that cannot be recognized", () => {
    const data = { ...fixtureExtraction(), isLessonPlan: false };
    expect(validateExtraction(data, "School registration.pdf")).toEqual([]);
    expect(validateExtraction(data, fixtureLessonSource.filename)).toHaveLength(
      1,
    );
  });
  it("partitions spillover dates into calendar months with PDF provenance", () => {
    const plans = extractedPlans(fixtureExtraction(), fixtureLessonSource);
    expect(
      plans.map((plan) => [
        plan.month,
        plan.sourceKind,
        plan.days.map((day) => day.date),
      ]),
    ).toEqual([
      ["2027-11", "monthly", ["2027-11-30"]],
      ["2027-12", "carryover", ["2027-12-01"]],
    ]);
    expect(plans[0]?.days[0]).toMatchObject({
      sourceAttachmentId: fixtureLessonSource.attachmentId,
      sourcePages: [1, 2],
    });
  });
  it("preserves dedicated monthly dates over carryovers regardless of arrival order", () => {
    const carryover = extractedPlans(
      fixtureExtraction(),
      fixtureLessonSource,
    )[1];
    if (!carryover) throw new Error("Missing carryover fixture");
    const incoming = {
      ...carryover,
      sourceKind: "monthly" as const,
      title: "Dedicated month",
      days: carryover.days.map((day) => ({
        ...day,
        title: "Updated December activity",
      })),
    };
    expect(mergeExtractedPlan(carryover, incoming).days[0]?.title).toBe(
      "Updated December activity",
    );
    expect(mergeExtractedPlan(incoming, carryover).days[0]?.title).toBe(
      "Updated December activity",
    );
    expect(mergeExtractedPlan(incoming, carryover).alternateDays).toEqual(
      carryover.days,
    );
    expect(mergeExtractedPlan(carryover, incoming).alternateDays).toEqual(
      carryover.days,
    );
    const conflict = fixtureExtraction();
    conflict.issues.push({
      code: "conflicting-source",
      description: "Calendar says blue; weekly table says red.",
      pages: [1, 2],
    });
    expect(
      extractedPlans(conflict, fixtureLessonSource)[0]?.sourceNotes?.[0]
        ?.description,
    ).toBe("Calendar says blue; weekly table says red.");
    expect(() =>
      mergeExtractedPlan(incoming, { ...carryover, month: "2028-01" }),
    ).toThrow("different classroom months");
  });
});
