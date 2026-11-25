export const CAMPUS_TIME_ZONE = "America/Los_Angeles";
export const SCHOOL_DAYS_PER_WEEK = 5;
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function campusDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysSinceMonday(date: string) {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -daysSinceMonday(date));
}

export function endOfSchoolWeek(monday: string): string {
  return addDays(monday, SCHOOL_DAYS_PER_WEEK - 1);
}

export function isWeekday(date: string): boolean {
  return daysSinceMonday(date) < SCHOOL_DAYS_PER_WEEK;
}

export function weekdayOnOrAfter(date: string): string {
  const offset = daysSinceMonday(date);
  return offset < SCHOOL_DAYS_PER_WEEK ? date : addDays(date, 7 - offset);
}

export function weekdayRanges<T extends { startDate: string; endDate: string }>(
  ranges: T[],
) {
  return ranges.flatMap((range) => {
    const startDate = weekdayOnOrAfter(range.startDate);
    const endDate = isWeekday(range.endDate)
      ? range.endDate
      : endOfSchoolWeek(startOfWeek(range.endDate));
    return startDate <= endDate ? [{ ...range, startDate, endDate }] : [];
  });
}
