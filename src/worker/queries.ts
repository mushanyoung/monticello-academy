import { CLASSES, type ClassId, isClassId } from "../shared/classes";
import { isLanguage, type Language } from "../shared/language";
import type { MailSummary } from "../shared/models";
import { HttpError } from "./errors";
import { localizedMailSchema } from "./translation-data";

type MailRow = Omit<MailSummary, "class_ids"> & { class_ids: string | null };
function summarySql(language: Language) {
  return `SELECT m.id,coalesce(l.subject,m.subject) subject,m.sender,m.sender_name,m.sent_at,m.received_at,substr(coalesce(l.body_text,m.body_text),1,180) snippet,
 (SELECT group_concat(class_id) FROM message_classes WHERE message_id=m.id) class_ids,
 (SELECT count(*) FROM attachments WHERE message_id=m.id) attachment_count,
 CASE WHEN l.message_id IS NOT NULL THEN 'ready' WHEN EXISTS(SELECT 1 FROM translation_jobs j WHERE j.kind='mail' AND j.entity_id=m.id AND j.source_document=m.raw_key AND j.status='failed') THEN 'unavailable' ELSE 'translating' END translationStatus
 FROM messages m LEFT JOIN mail_localizations l ON l.message_id=m.id AND l.language='${language}' AND l.source_document=m.raw_key`;
}
export function summary(row: MailRow): MailSummary {
  return {
    ...row,
    class_ids: (row.class_ids?.split(",") ?? []).filter(isClassId),
  };
}
export function classFilter(value: string | null): ClassId | null {
  if (!value || value === "all") return null;
  if (!isClassId(value)) throw new HttpError(400, "Unknown classroom.");
  return value;
}
export async function listMail(db: D1Database, url: URL) {
  const requested = url.searchParams.get("lang");
  const language = isLanguage(requested) ? requested : "en";
  const selected = classFilter(url.searchParams.get("class"));
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length > 200)
    throw new HttpError(400, "Search is limited to 200 characters.");
  const page = Number(url.searchParams.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new HttpError(400, "Invalid page.");
  const sort = url.searchParams.get("sort") || "newest";
  if (!["newest", "oldest"].includes(sort))
    throw new HttpError(400, "Invalid sort order.");
  const terms: string[] = [];
  const values: string[] = [];
  if (selected) {
    terms.push(
      "EXISTS(SELECT 1 FROM message_classes mc WHERE mc.message_id=m.id AND mc.class_id=?)",
    );
    values.push(selected);
  }
  if (q) {
    terms.push(
      `(instr(m.search_text,?) > 0 OR EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id AND instr(a.extracted_text,?) > 0)
      OR EXISTS(SELECT 1 FROM mail_localizations ml WHERE ml.message_id=m.id AND instr(ml.search_text,?)>0)
      OR EXISTS(SELECT 1 FROM plan_localizations pl JOIN lesson_plans p ON p.id=pl.plan_id AND p.document=pl.source_document WHERE instr(lower(pl.document),?)>0 AND (p.source_message_id=m.id OR EXISTS(SELECT 1 FROM json_each(pl.document,'$.sources') s WHERE json_extract(s.value,'$.messageId')=m.id))))`,
    );
    values.push(
      q.toLowerCase(),
      q.toLowerCase(),
      q.toLowerCase(),
      q.toLowerCase(),
    );
  }
  const where = terms.length ? ` WHERE ${terms.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${summarySql(language)}${where} ORDER BY m.sent_at ${sort === "oldest" ? "ASC" : "DESC"},m.id LIMIT 30 OFFSET ?`,
      )
      .bind(...values, (page - 1) * 30)
      .all<MailRow>(),
    db
      .prepare(`SELECT count(*) total FROM messages m${where}`)
      .bind(...values)
      .first<{ total: number }>(),
  ]);
  return {
    items: rows.results.map(summary),
    total: count?.total || 0,
    page,
    pageSize: 30,
  };
}
export async function detail(
  db: D1Database,
  id: string,
  language: Language = "en",
) {
  const row = await db
    .prepare(`${summarySql(language)} WHERE m.id=?`)
    .bind(id)
    .first<MailRow>();
  if (!row) throw new HttpError(404, "Email not found.");
  const body = await db
    .prepare(
      "SELECT coalesce(l.body_text,m.body_text) body_text,m.recipients,m.headers,l.attachments localized_attachments FROM messages m LEFT JOIN mail_localizations l ON l.message_id=m.id AND l.source_document=m.raw_key AND l.language=? WHERE m.id=?",
    )
    .bind(language, id)
    .first<{
      body_text: string;
      recipients: string;
      headers: string;
      localized_attachments: string | null;
    }>();
  const attachments = await db
    .prepare(
      "SELECT id,filename,content_type,size,text_status FROM attachments WHERE message_id=? ORDER BY rowid",
    )
    .bind(id)
    .all<{
      id: string;
      filename: string;
      content_type: string;
      size: number;
      text_status: string;
    }>();
  const names = localizedMailSchema.shape.attachments.parse(
    JSON.parse(body?.localized_attachments || "[]"),
  );
  return {
    ...summary(row),
    body_text: body?.body_text || "",
    recipients: body?.recipients || "",
    headers: body?.headers || "",
    attachments: attachments.results.map((file) => ({
      ...file,
      original_filename: file.filename,
      filename:
        names.find((name) => name.id === file.id)?.filename || file.filename,
    })),
  };
}
export async function stats(db: D1Database) {
  const [counts, total] = await Promise.all([
    db
      .prepare(
        "SELECT class_id,count(*) count FROM message_classes GROUP BY class_id",
      )
      .all<{ class_id: string; count: number }>(),
    db
      .prepare("SELECT count(*) total FROM messages")
      .first<{ total: number }>(),
  ]);
  return {
    total: total?.total || 0,
    classes: CLASSES.map((c) => ({
      ...c,
      count: counts.results.find((r) => r.class_id === c.id)?.count || 0,
    })),
  };
}
