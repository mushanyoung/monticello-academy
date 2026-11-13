import { z } from "zod";
import { type LessonPlan, planSchema, validDate } from "./plans";

export const LESSON_PARSER_VERSION = "1";
const text = z.string().max(2000);
const label = z.string().min(1).max(1000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pages = z.array(z.number().int().min(1).max(100)).min(1).max(20);
const focus = z.object({ area: label, items: z.array(label).max(40) }).strict();
export const extractionIssueSchema = z
  .object({
    code: z.enum([
      "ambiguous-date",
      "conflicting-source",
      "missing-content",
      "unreadable",
      "identity",
      "other",
    ]),
    description: label,
    pages: z.array(z.number().int().min(1).max(100)).max(20),
  })
  .strict();

// All properties are required so the same schema can be sent as strict JSON Schema.
export const lessonExtractionSchema = z
  .object({
    isLessonPlan: z.boolean(),
    classId: z.enum(["sunshine", "guppy", "twos"]).nullable(),
    documentMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    title: z.string().max(1000),
    theme: z.string().max(1000),
    overview: z.string().max(5000),
    objectives: z.array(label).max(60),
    monthlyReminders: z.array(label).max(40),
    weeks: z
      .array(
        z
          .object({
            startDate: date,
            endDate: date,
            theme: label,
            focus: z.array(focus).max(20),
            pages,
          })
          .strict(),
      )
      .max(12),
    days: z
      .array(
        z
          .object({
            date,
            title: label,
            activities: z
              .array(z.object({ area: label, description: label }).strict())
              .max(20),
            reminders: z.array(label).max(20),
            bring: z.array(label).max(20),
            note: text,
            noSchool: z.boolean(),
            pages,
          })
          .strict(),
      )
      .max(93),
    pageCount: z.number().int().min(1).max(100),
    issues: z.array(extractionIssueSchema).max(40),
  })
  .strict();
export type LessonExtraction = z.infer<typeof lessonExtractionSchema>;
export interface LessonSource {
  attachmentId: string;
  messageId: string;
  filename: string;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
export function lessonFileHint(filename: string) {
  const name = filename.toLowerCase().replace(/[’'_-]/g, " ");
  const classes = [
    ...(/\bsunshine\b/.test(name) ? ["sunshine" as const] : []),
    ...(/\bguppy\b/.test(name) ? ["guppy" as const] : []),
    ...(/\btwos?\s+(town|s\s+town)\b/.test(name) ? ["twos" as const] : []),
  ];
  const monthNumbers = MONTHS.flatMap((month, index) =>
    new RegExp(`\\b${month}\\b`).test(name) ? [index + 1] : [],
  );
  const years = [...new Set(name.match(/\b20\d{2}\b/g) || [])];
  return {
    classId: classes.length === 1 ? classes[0] : null,
    month:
      monthNumbers.length === 1 && years.length === 1
        ? `${years[0]}-${String(monthNumbers[0]).padStart(2, "0")}`
        : null,
    expectedLesson: /lesson[\s\S]*plan/i.test(name),
  };
}

function monthOffset(month: string, offset: number) {
  const value = new Date(`${month}-15T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}
export function validateExtraction(
  extraction: LessonExtraction,
  filename: string,
) {
  const issues = extraction.issues.map((issue) => ({ ...issue }));
  const add = (
    code: z.infer<typeof extractionIssueSchema>["code"],
    description: string,
  ) => issues.push({ code, description, pages: [] });
  const hint = lessonFileHint(filename);
  if (!extraction.isLessonPlan) {
    if (hint.expectedLesson)
      add(
        "identity",
        "A file named as a lesson plan was not recognized as one.",
      );
    return issues;
  }
  if (
    !extraction.classId ||
    !extraction.documentMonth ||
    !extraction.title.trim() ||
    !extraction.theme.trim()
  )
    add(
      "identity",
      "The classroom, month, title and theme must be identified from the PDF.",
    );
  if (hint.classId && hint.classId !== extraction.classId)
    add("identity", "The PDF classroom conflicts with its filename.");
  if (hint.month && hint.month !== extraction.documentMonth)
    add("identity", "The PDF month conflicts with its filename.");
  if (!extraction.days.length || !extraction.weeks.length)
    add("missing-content", "No dated weekly lessons were extracted.");
  const dates = new Set<string>();
  const allowedMonths = extraction.documentMonth
    ? [-1, 0, 1].map((offset) =>
        monthOffset(extraction.documentMonth || "", offset),
      )
    : [];
  for (const day of extraction.days) {
    if (!validDate(day.date) || !allowedMonths.includes(day.date.slice(0, 7)))
      add("ambiguous-date", `Invalid or out-of-range date: ${day.date}.`);
    if (dates.has(day.date))
      add("ambiguous-date", `Duplicate date: ${day.date}.`);
    dates.add(day.date);
    if (day.pages.some((page) => page > extraction.pageCount))
      add("identity", `Invalid source page for ${day.date}.`);
    if (day.noSchool && day.activities.length > 0)
      add(
        "conflicting-source",
        `A closed school day contains classroom activities: ${day.date}.`,
      );
    if (
      !day.noSchool &&
      !day.activities.length &&
      !day.reminders.length &&
      !day.bring.length
    )
      add(
        "missing-content",
        `No activities or reminders were extracted for ${day.date}.`,
      );
    if (
      !extraction.weeks.some(
        (week) => day.date >= week.startDate && day.date <= week.endDate,
      )
    )
      add(
        "ambiguous-date",
        `The date ${day.date} does not belong to an extracted week.`,
      );
  }
  for (const week of extraction.weeks) {
    if (
      !validDate(week.startDate) ||
      !validDate(week.endDate) ||
      week.startDate > week.endDate ||
      Date.parse(week.endDate) - Date.parse(week.startDate) > 6 * 86400000
    )
      add("ambiguous-date", "A weekly date range is invalid.");
    if (week.pages.some((page) => page > extraction.pageCount))
      add("identity", "A week references an invalid PDF page.");
  }
  if (
    extraction.documentMonth &&
    !extraction.days.some((day) =>
      day.date.startsWith(`${extraction.documentMonth}-`),
    )
  )
    add("missing-content", "The document has no days in its own month.");
  return issues;
}

export function extractedPlans(
  extraction: LessonExtraction,
  source: LessonSource,
): LessonPlan[] {
  if (
    !extraction.isLessonPlan ||
    !extraction.classId ||
    !extraction.documentMonth
  )
    return [];
  const months = [
    ...new Set(extraction.days.map((day) => day.date.slice(0, 7))),
  ].sort();
  return months.map((month) =>
    planSchema.parse({
      classId: extraction.classId,
      month,
      title: extraction.title,
      theme: extraction.theme,
      overview: extraction.overview,
      objectives: extraction.objectives,
      sourceMessageId: source.messageId,
      status: "published",
      sourceKind: month === extraction.documentMonth ? "monthly" : "carryover",
      sources: [{ ...source, documentMonth: extraction.documentMonth }],
      monthlyReminders: extraction.monthlyReminders,
      sourceNotes: validateExtraction(extraction, source.filename).map(
        (issue) => ({
          attachmentId: source.attachmentId,
          description: issue.description,
          pages: issue.pages,
        }),
      ),
      weeks: extraction.weeks
        .filter(
          (week) =>
            week.startDate.slice(0, 7) <= month &&
            week.endDate.slice(0, 7) >= month,
        )
        .map(({ pages: _pages, ...week }) => week),
      days: extraction.days
        .filter((day) => day.date.startsWith(`${month}-`))
        .map(({ pages, ...day }) => ({
          ...day,
          sourceAttachmentId: source.attachmentId,
          sourcePages: pages,
        })),
    }),
  );
}

// Dedicated monthly plans win overlapping dates; adjacent-month dates only fill gaps.
export function mergeExtractedPlan(
  existing: LessonPlan | undefined,
  incoming: LessonPlan,
) {
  if (!existing) return incoming;
  if (
    existing.classId !== incoming.classId ||
    existing.month !== incoming.month
  )
    throw new Error("Cannot merge different classroom months");
  const incomingPrimary = incoming.sourceKind !== "carryover";
  const primary = incomingPrimary ? incoming : existing;
  const secondary = incomingPrimary ? existing : incoming;
  const days = new Map(secondary.days.map((day) => [day.date, day]));
  for (const day of primary.days) days.set(day.date, day);
  const sources = new Map(
    [...(secondary.sources || []), ...(primary.sources || [])].map((source) => [
      source.attachmentId,
      source,
    ]),
  );
  const alternatives = [
    ...(secondary.alternateDays || []),
    ...(primary.alternateDays || []),
  ];
  for (const day of secondary.days) {
    const chosen = days.get(day.date);
    if (chosen && JSON.stringify(chosen) !== JSON.stringify(day))
      alternatives.push(day);
  }
  const unique = <T>(items: T[]) => [
    ...new Map(items.map((item) => [JSON.stringify(item), item])).values(),
  ];
  return planSchema.parse({
    ...primary,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sources: [...sources.values()],
    alternateDays: unique(alternatives).filter(
      (day) => JSON.stringify(day) !== JSON.stringify(days.get(day.date)),
    ),
    sourceNotes: unique([
      ...(secondary.sourceNotes || []),
      ...(primary.sourceNotes || []),
    ]),
    monthlyReminders: unique([
      ...(secondary.monthlyReminders || []),
      ...(primary.monthlyReminders || []),
    ]),
    objectives: unique([...primary.objectives, ...secondary.objectives]),
    weeks: unique([...(primary.weeks || []), ...(secondary.weeks || [])]),
  });
}
