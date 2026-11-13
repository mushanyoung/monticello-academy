import type { LessonExtraction } from "../shared/lesson-extraction";
export async function indexLessonText(
  env: Env,
  contentKey: string,
  extraction: LessonExtraction,
) {
  if (!extraction.isLessonPlan) return;
  const text = [
    extraction.title,
    extraction.theme,
    extraction.overview,
    ...extraction.objectives,
    ...extraction.monthlyReminders,
    ...extraction.weeks.flatMap((week) => [
      week.startDate,
      week.endDate,
      week.theme,
      ...week.focus.flatMap((focus) => [focus.area, ...focus.items]),
    ]),
    ...extraction.days.flatMap((day) => [
      day.date,
      day.title,
      day.note,
      ...day.activities.flatMap((activity) => [
        activity.area,
        activity.description,
      ]),
      ...day.reminders,
      ...day.bring,
    ]),
    ...extraction.issues.map((issue) => issue.description),
  ]
    .join("\n")
    .toLowerCase()
    .slice(0, 100_000);
  await env.DB.prepare(
    "UPDATE attachments SET extracted_text=?,text_status='extracted' WHERE object_key=?",
  )
    .bind(text, contentKey)
    .run();
}
