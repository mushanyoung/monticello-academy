import { z } from "zod";
import type { ClassId } from "./classes";
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
const shortText = z.string().trim().min(1).max(1000);
export const focusSchema = z
  .object({
    area: shortText,
    items: z.array(shortText).max(40),
  })
  .strict();
export const weekSchema = z
  .object({
    startDate: z.string().refine(validDate, "Invalid week start"),
    endDate: z.string().refine(validDate, "Invalid week end"),
    theme: shortText,
    focus: z.array(focusSchema).max(20),
  })
  .strict();
export const planSourceSchema = z
  .object({
    attachmentId: z.string().regex(/^[a-f0-9]{64}$/),
    messageId: z.string().regex(/^[a-f0-9]{64}$/),
    filename: z.string().min(1).max(1000),
    documentMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  })
  .strict();
export const daySchema = z
  .object({
    date: z.string().refine(validDate, "Invalid calendar date"),
    title: shortText,
    activities: z
      .array(z.object({ area: shortText, description: shortText }).strict())
      .max(20),
    reminders: z.array(shortText).max(20),
    bring: z.array(shortText).max(20),
    note: z.string().max(2000),
    noSchool: z.boolean(),
    sourceAttachmentId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sourcePages: z.array(z.number().int().min(1).max(100)).max(20).optional(),
  })
  .strict();
export const planSchema = z
  .object({
    classId: z.enum(["sunshine", "guppy", "twos"]),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    title: shortText,
    theme: shortText,
    overview: z.string().max(5000),
    objectives: z.array(shortText).max(300),
    sourceMessageId: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.literal("published"),
    days: z.array(daySchema).max(31),
    alternateDays: z.array(daySchema).max(310).optional(),
    sourceNotes: z
      .array(
        z
          .object({
            attachmentId: z.string().regex(/^[a-f0-9]{64}$/),
            description: shortText,
            pages: z.array(z.number().int().min(1).max(100)).max(20),
          })
          .strict(),
      )
      .max(200)
      .optional(),
    monthlyReminders: z.array(shortText).max(40).optional(),
    weeks: z.array(weekSchema).max(60).optional(),
    sources: z.array(planSourceSchema).max(20).optional(),
    sourceKind: z.enum(["monthly", "carryover"]).optional(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const dates = new Set<string>();
    for (const day of plan.days) {
      if (!day.date.startsWith(`${plan.month}-`))
        ctx.addIssue({
          code: "custom",
          message: "Each day must belong to the plan month",
          path: ["days"],
        });
      if (dates.has(day.date))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate calendar date",
          path: ["days"],
        });
      dates.add(day.date);
      if (
        day.sourceAttachmentId &&
        !plan.sources?.some(
          (source) => source.attachmentId === day.sourceAttachmentId,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Each day source must belong to the plan",
          path: ["days"],
        });
    }
    for (const week of plan.weeks || []) {
      if (week.startDate > week.endDate)
        ctx.addIssue({
          code: "custom",
          message: "Week end precedes its start",
          path: ["weeks"],
        });
    }
  });
export type LessonPlan = z.infer<typeof planSchema>;
export type LessonDay = z.infer<typeof daySchema>;
export interface StoredPlan extends LessonPlan {
  id: string;
  updatedAt: string;
}
export interface ClassHighlight {
  classId: ClassId;
  status: "ready" | "no-day" | "awaiting-plan";
  planId: string | null;
  theme: string | null;
  day: LessonDay | null;
  sourceMessageId: string | null;
  alternatives?: LessonDay[];
  monthlyReminders?: string[];
  sourceNotes?: string[];
  weeklyFocus?: z.infer<typeof weekSchema>[];
}
export interface Highlights {
  date: string;
  today: string;
  timeZone: string;
  classes: ClassHighlight[];
}
