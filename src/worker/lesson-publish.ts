import {
  extractedPlans,
  type LessonExtraction,
  type LessonSource,
  mergeExtractedPlan,
} from "../shared/lesson-extraction";
import { type LessonPlan, planSchema } from "../shared/plans";
import { sha256 } from "./mail";
import { LessonError } from "./openai";
import { translateNewContent } from "./translation-jobs";

// Compare-and-swap prevents concurrently finishing PDFs from losing each other's dates.
async function mergePlan(db: D1Database, incoming: LessonPlan) {
  const id = `${incoming.classId}:${incoming.month}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .prepare("SELECT document FROM lesson_plans WHERE id=?")
      .bind(id)
      .first<{ document: string }>();
    const merged = mergeExtractedPlan(
      row ? planSchema.parse(JSON.parse(row.document)) : undefined,
      incoming,
    );
    const document = JSON.stringify(merged);
    const now = new Date().toISOString();
    const revision = await sha256(document);
    const update = row
      ? db
          .prepare(
            "UPDATE lesson_plans SET source_message_id=?,status='published',document=?,updated_at=? WHERE id=? AND document=?",
          )
          .bind(merged.sourceMessageId, document, now, id, row.document)
      : db
          .prepare(
            "INSERT OR IGNORE INTO lesson_plans(id,class_id,month,source_message_id,status,document,updated_at) VALUES(?,?,?,?,'published',?,?)",
          )
          .bind(
            id,
            merged.classId,
            merged.month,
            merged.sourceMessageId,
            document,
            now,
          );
    const results = await db.batch([
      update,
      db
        .prepare(
          "INSERT OR IGNORE INTO plan_revisions(id,plan_id,document,created_at) SELECT ?,id,document,? FROM lesson_plans WHERE id=? AND document=?",
        )
        .bind(revision, now, id, document),
    ]);
    if (results[0]?.meta.changes) return;
  }
  throw new LessonError(
    "publication_conflict",
    "Concurrent plan updates need another automatic attempt.",
  );
}
export async function publishExtraction(
  env: Env,
  extraction: LessonExtraction,
  source: LessonSource,
) {
  let plans: LessonPlan[];
  try {
    plans = extractedPlans(extraction, source);
  } catch {
    throw new LessonError(
      "invalid_dates",
      "The extracted dates or structure cannot be stored. The original PDF is retained.",
    );
  }
  if (!plans.length || !extraction.classId)
    throw new LessonError(
      "missing_identity",
      "No classroom and dated lessons could be extracted.",
    );
  await env.DB.prepare(
    "INSERT OR IGNORE INTO message_classes(message_id,class_id) VALUES(?,?)",
  )
    .bind(source.messageId, extraction.classId)
    .run();
  for (const plan of plans) await mergePlan(env.DB, plan);
  const ids = plans.map((plan) => `${plan.classId}:${plan.month}`);
  try {
    await translateNewContent(env, "plan", ids);
  } catch {
    console.error(JSON.stringify({ event: "translation_enqueue_failed" }));
  }
  return ids;
}
