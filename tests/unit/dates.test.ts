import { describe, expect, it } from "vitest";
import { addDays, campusDate } from "../../src/shared/dates";

describe("campus dates", () => {
  it("uses Los Angeles date", () => {
    expect(campusDate(new Date("2026-11-14T07:30:00Z"))).toBe("2026-11-13");
  });
  it("crosses month, year, leap and DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});
