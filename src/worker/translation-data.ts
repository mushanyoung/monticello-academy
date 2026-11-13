import PostalMime from "postal-mime";
import { z } from "zod";
import { planSchema } from "../shared/plans";
import {
  renderTranslation,
  type TranslatedSegment,
  type TranslationTemplate,
  translationTemplate,
} from "../shared/translation";
import { plainText } from "./mail";
import type { TranslationJob } from "./translation-jobs";

export const localizedMailSchema = z
  .object({
    subject: z.string().max(2000),
    body_text: z.string().max(300000),
    html: z.string().max(2 * 1024 * 1024),
    attachments: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-f0-9]{64}$/),
            filename: z.string().max(2000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export async function prepareTranslation(env: Env, job: TranslationJob) {
  let source: unknown;
  if (job.kind === "plan")
    source = planSchema.parse(JSON.parse(job.source_document));
  else {
    const mail = await env.DB.prepare(
      "SELECT subject,body_text,raw_key FROM messages WHERE id=? AND raw_key=?",
    )
      .bind(job.entity_id, job.source_document)
      .first<{ subject: string; body_text: string; raw_key: string }>();
    const object = mail ? await env.MAIL_BUCKET.get(mail.raw_key) : null;
    if (!mail || !object) throw new Error("Source email is unavailable");
    const parsed = await PostalMime.parse(await object.arrayBuffer(), {
      attachmentEncoding: "arraybuffer",
      forceRfc822Attachments: true,
    });
    const attachments = await env.DB.prepare(
      "SELECT id,filename FROM attachments WHERE message_id=? ORDER BY id",
    )
      .bind(job.entity_id)
      .all<{ id: string; filename: string }>();
    source = localizedMailSchema.parse({
      subject: mail.subject,
      body_text: mail.body_text,
      html: parsed.html || "",
      attachments: attachments.results,
    });
  }
  const template = translationTemplate(source);
  const key = `translations/${job.id}/input.json`;
  await env.MAIL_BUCKET.put(key, JSON.stringify(template), {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.prepare(
    "UPDATE translation_jobs SET input_key=?,status='running',updated_at=? WHERE id=? AND attempt=?",
  )
    .bind(key, new Date().toISOString(), job.id, job.attempt)
    .run();
  return key;
}
export async function publishTranslation(
  env: Env,
  job: TranslationJob,
  template: TranslationTemplate,
  segments: TranslatedSegment[],
) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const language of ["en", "zh"] as const) {
    const translated = renderTranslation(template, segments, language);
    if (job.kind === "plan") {
      const document = JSON.stringify(planSchema.parse(translated));
      statements.push(
        env.DB.prepare(`INSERT INTO plan_localizations(plan_id,language,source_document,document,updated_at)
        SELECT id,?,?,?,? FROM lesson_plans WHERE id=? AND document=?
        ON CONFLICT(plan_id,language) DO UPDATE SET source_document=excluded.source_document,document=excluded.document,updated_at=excluded.updated_at`).bind(
          language,
          job.source_document,
          document,
          now,
          job.entity_id,
          job.source_document,
        ),
      );
    } else {
      const mail = localizedMailSchema.parse(translated);
      const htmlKey = `translations/${job.id}/${language}.html`;
      await env.MAIL_BUCKET.put(htmlKey, mail.html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      });
      const search = [
        mail.subject,
        mail.body_text,
        plainText(mail.html),
        ...mail.attachments.map((file) => file.filename),
      ]
        .join("\n")
        .toLowerCase();
      statements.push(
        env.DB.prepare(`INSERT INTO mail_localizations(message_id,language,source_document,subject,body_text,html_key,attachments,search_text,updated_at)
        SELECT id,?,?,?,?,?,?,?,? FROM messages WHERE id=? AND raw_key=?
        ON CONFLICT(message_id,language) DO UPDATE SET source_document=excluded.source_document,subject=excluded.subject,body_text=excluded.body_text,html_key=excluded.html_key,attachments=excluded.attachments,search_text=excluded.search_text,updated_at=excluded.updated_at`).bind(
          language,
          job.source_document,
          mail.subject,
          mail.body_text,
          htmlKey,
          JSON.stringify(mail.attachments),
          search,
          now,
          job.entity_id,
          job.source_document,
        ),
      );
    }
  }
  const results = await env.DB.batch(statements);
  const status = results.every((result) => result.meta.changes > 0)
    ? "completed"
    : "superseded";
  await env.DB.prepare(
    "UPDATE translation_jobs SET status=?,updated_at=? WHERE id=? AND attempt=?",
  )
    .bind(status, now, job.id, job.attempt)
    .run();
  return status;
}
