import { describe, expect, it } from "vitest";
import {
  addDays,
  campusDate,
  endOfSchoolWeek,
  isWeekday,
  startOfWeek,
  weekdayOnOrAfter,
  weekdayRanges,
} from "../../src/shared/dates";

describe("campus dates", () => {
  it("uses Los Angeles date", () => {
    expect(campusDate(new Date("2026-11-14T07:30:00Z"))).toBe("2026-11-13");
  });
  it("crosses month, year, leap and DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
  it("keeps Monday through Sunday together across years, leap days and DST", () => {
    expect(startOfWeek("2027-01-03")).toBe("2026-12-28");
    expect(startOfWeek("2027-01-04")).toBe("2027-01-04");
    expect(startOfWeek("2028-03-01")).toBe("2028-02-28");
    expect(startOfWeek("2026-03-08")).toBe("2026-03-02");
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26");
  });
  it("uses five campus weekdays across month, year and DST boundaries", () => {
    expect(endOfSchoolWeek("2026-12-28")).toBe("2027-01-01");
    for (const [date, next] of [
      ["2027-12-31", "2027-12-31"],
      ["2028-01-01", "2028-01-03"],
      ["2028-01-02", "2028-01-03"],
      ["2026-03-08", "2026-03-09"],
      ["2026-11-01", "2026-11-02"],
    ] as const) {
      expect(isWeekday(date)).toBe(date === next);
      expect(weekdayOnOrAfter(date)).toBe(next);
    }
    expect(
      weekdayRanges([
        { startDate: "0000-01-01", endDate: "0000-01-02" },
        { startDate: "2028-01-01", endDate: "2028-01-02" },
        { startDate: "2028-01-02", endDate: "2028-01-08" },
        { startDate: "2027-12-31", endDate: "2028-01-02" },
      ]),
    ).toEqual([
      { startDate: "2028-01-03", endDate: "2028-01-07" },
      { startDate: "2027-12-31", endDate: "2027-12-31" },
    ]);
  });
});
