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
  })
  .strict();
export const planSchema = z
  .object({
    classId: z.enum(["sunshine", "guppy", "twos"]),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    title: shortText,
    theme: shortText,
    overview: z.string().max(5000),
    objectives: z.array(shortText).max(30),
    sourceMessageId: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["draft", "published"]),
    days: z.array(daySchema).max(31),
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
  status: "ready" | "no-day" | "awaiting-review" | "awaiting-plan";
  planId: string | null;
  theme: string | null;
  day: LessonDay | null;
  sourceMessageId: string | null;
}
export interface Highlights {
  date: string;
  today: string;
  timeZone: string;
  classes: ClassHighlight[];
}
