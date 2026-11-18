import type { LessonExtraction } from "../shared/lesson-extraction";
export async function indexLessonText(
  env: Env,
  contentKey: string,
  extraction: LessonExtraction,
) {
  if (!extraction.isLessonPlan) return;
  if (!extraction.classId)
    throw new Error("A lesson PDF needs a classroom to be indexed.");
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
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO lesson_pdf_index(content_key,class_id,search_text) VALUES(?,?,?)
      ON CONFLICT(content_key) DO UPDATE SET class_id=excluded.class_id,search_text=excluded.search_text`).bind(
      contentKey,
      extraction.classId,
      text,
    ),
    env.DB.prepare(`INSERT OR IGNORE INTO message_classes(message_id,class_id)
      SELECT message_id,? FROM attachments WHERE object_key=?`).bind(
      extraction.classId,
      contentKey,
    ),
  ]);
}
