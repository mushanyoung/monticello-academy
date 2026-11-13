import { CLASSES } from "../shared/classes";
import { CAMPUS_TIME_ZONE, campusDate } from "../shared/dates";
import {
  isLanguage,
  type Language,
  type TranslationStatus,
} from "../shared/language";
import {
  type ClassHighlight,
  type LessonPlan,
  planSchema,
  type StoredPlan,
  validDate,
} from "../shared/plans";
import { HttpError } from "./errors";
import { sha256 } from "./mail";
import { classFilter } from "./queries";

interface PlanRow {
  id: string;
  document: string;
  updated_at: string;
  translationStatus?: TranslationStatus;
}
function decode(row: PlanRow): StoredPlan {
  return {
    ...planSchema.parse(JSON.parse(row.document)),
    id: row.id,
    updatedAt: row.updated_at,
    translationStatus: row.translationStatus || "ready",
  };
}
function localizedPlanSql(language: Language) {
  return `SELECT p.id,coalesce(l.document,p.document) document,p.updated_at,
 CASE WHEN l.plan_id IS NOT NULL OR '${language}'='en' THEN 'ready' WHEN EXISTS(SELECT 1 FROM translation_jobs j WHERE j.kind='plan' AND j.entity_id=p.id AND j.source_document=p.document AND j.status='failed') THEN 'unavailable' ELSE 'translating' END translationStatus
 FROM lesson_plans p LEFT JOIN plan_localizations l ON l.plan_id=p.id AND l.source_document=p.document AND l.language='${language}'`;
}
export async function savePlan(db: D1Database, input: unknown) {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      422,
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  const plan = parsed.data;
  const source = await db
    .prepare("SELECT 1 FROM message_classes WHERE message_id=? AND class_id=?")
    .bind(plan.sourceMessageId, plan.classId)
    .first();
  if (!source)
    throw new HttpError(
      422,
      "Source email must exist and be associated with this classroom.",
    );
  const id = `${plan.classId}:${plan.month}`;
  const now = new Date().toISOString();
  const document = JSON.stringify(plan);
  const revision = await sha256(document);
  await db.batch([
    db
      .prepare(
        `INSERT INTO lesson_plans(id,class_id,month,source_message_id,status,document,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_message_id=excluded.source_message_id,status=excluded.status,document=excluded.document,updated_at=excluded.updated_at`,
      )
      .bind(
        id,
        plan.classId,
        plan.month,
        plan.sourceMessageId,
        plan.status,
        document,
        now,
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO plan_revisions(id,plan_id,document,created_at) VALUES(?,?,?,?)",
      )
      .bind(revision, id, document, now),
  ]);
  return { id };
}
export async function listPlans(db: D1Database, url: URL) {
  const requested = url.searchParams.get("lang");
  const language = isLanguage(requested) ? requested : "en";
  const selected = classFilter(url.searchParams.get("class"));
  const month = url.searchParams.get("month");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new HttpError(400, "Invalid month.");
  const terms = ["p.status='published'"];
  const values: string[] = [];
  if (selected) {
    terms.push("p.class_id=?");
    values.push(selected);
  }
  if (month) {
    terms.push("p.month=?");
    values.push(month);
  }
  const rows = await db
    .prepare(
      `${localizedPlanSql(language)} WHERE ${terms.join(" AND ")} ORDER BY p.month DESC,p.class_id LIMIT 120`,
    )
    .bind(...values)
    .all<PlanRow>();
  return { items: rows.results.map(decode) };
}
export function selectHighlight(
  classId: ClassHighlight["classId"],
  date: string,
  plan?: LessonPlan & { translationStatus?: TranslationStatus },
): ClassHighlight {
  const day =
    plan?.status === "published"
      ? plan.days.find((d) => d.date === date)
      : undefined;
  return {
    classId,
    status: !plan ? "awaiting-plan" : !day ? "no-day" : "ready",
    planId: plan ? `${classId}:${plan.month}` : null,
    theme: plan?.status === "published" ? plan.theme : null,
    day: day || null,
    sourceMessageId: plan?.status === "published" ? plan.sourceMessageId : null,
    alternatives:
      plan?.alternateDays?.filter((entry) => entry.date === date) || [],
    monthlyReminders: plan?.monthlyReminders || [],
    sourceNotes: [
      ...new Set(plan?.sourceNotes?.map((note) => note.description) || []),
    ],
    weeklyFocus:
      plan?.weeks?.filter(
        (week) => week.startDate <= date && week.endDate >= date,
      ) || [],
    translationStatus: plan?.translationStatus || "ready",
  };
}
export async function highlights(db: D1Database, url: URL) {
  const requested = url.searchParams.get("lang");
  const language = isLanguage(requested) ? requested : "en";
  const today = campusDate();
  const date = url.searchParams.get("date") || today;
  if (!validDate(date)) throw new HttpError(400, "Invalid calendar date.");
  const rows = await db
    .prepare(`${localizedPlanSql(language)} WHERE p.month=?`)
    .bind(date.slice(0, 7))
    .all<PlanRow>();
  const plans = rows.results.map(decode);
  return {
    date,
    today,
    timeZone: CAMPUS_TIME_ZONE,
    classes: CLASSES.map((c) =>
      selectHighlight(
        c.id,
        date,
        plans.find((p) => p.classId === c.id),
      ),
    ),
  };
}
