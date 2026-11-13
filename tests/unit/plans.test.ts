import { describe, expect, it } from "vitest";
import { planSchema, validDate } from "../../src/shared/plans";
import { selectHighlight } from "../../src/worker/plans";
import { fixturePlan } from "../fixtures/plan";

describe("lesson plan rules", () => {
  const plan = fixturePlan("a".repeat(64));
  it("validates real dates, month membership and unique daily plans", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(planSchema.safeParse(plan).success).toBe(true);
    expect(planSchema.safeParse({ ...plan, month: "2040-12" }).success).toBe(
      false,
    );
    expect(
      planSchema.safeParse({ ...plan, days: [...plan.days, ...plan.days] })
        .success,
    ).toBe(false);
  });
  it("distinguishes absent plans and dates and rejects approval states", () => {
    expect(selectHighlight("sunshine", "2040-11-13").status).toBe(
      "awaiting-plan",
    );
    expect(planSchema.safeParse({ ...plan, status: "draft" }).success).toBe(
      false,
    );
    expect(selectHighlight("sunshine", "2040-11-14", plan).status).toBe(
      "no-day",
    );
    expect(selectHighlight("sunshine", "2040-11-13", plan).day?.bring).toEqual([
      "Rain boots",
    ]);
  });
});
