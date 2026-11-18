import PostalMime from "postal-mime";
import { z } from "zod";
import { planSchema } from "../shared/plans";
import {
  renderTranslation,
  type TranslatedSegment,
  type TranslationTemplate,
  translationTemplate,
} from "../shared/translation";
import { plainText, sha256 } from "./mail";
import {
  NEWER_TRANSLATOR_EXISTS,
  type TranslationJob,
} from "./translation-jobs";

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
  return key;
}
export async function publishTranslation(
  env: Env,
  job: TranslationJob,
  template: TranslationTemplate,
  segments: TranslatedSegment[],
) {
  const now = new Date().toISOString();
  const currentSource =
    job.kind === "plan"
      ? "SELECT 1 FROM lesson_plans WHERE id=j.entity_id AND document=j.source_document"
      : "SELECT 1 FROM messages WHERE id=j.entity_id AND raw_key=j.source_document";
  const statements = [
    env.DB.prepare(`UPDATE translation_jobs AS j SET status='superseded',updated_at=?
      WHERE id=? AND attempt=? AND status='running'
      AND (NOT EXISTS(${currentSource}) OR ${NEWER_TRANSLATOR_EXISTS})`).bind(
      now,
      job.id,
      job.attempt,
    ),
  ];
  const activeAttempt =
    "FROM translation_jobs WHERE id=? AND attempt=? AND status='running'";
  for (const language of ["en", "zh"] as const) {
    const translated = renderTranslation(template, segments, language);
    if (job.kind === "plan") {
      const document = JSON.stringify(planSchema.parse(translated));
      statements.push(
        env.DB.prepare(`INSERT INTO plan_localizations(plan_id,language,source_document,document,updated_at)
        SELECT entity_id,?,source_document,?,? ${activeAttempt}
        ON CONFLICT(plan_id,language) DO UPDATE SET source_document=excluded.source_document,document=excluded.document,updated_at=excluded.updated_at`).bind(
          language,
          document,
          now,
          job.id,
          job.attempt,
        ),
      );
    } else {
      const mail = localizedMailSchema.parse(translated);
      const htmlKey = `translations/${job.id}/${language}-${await sha256(mail.html)}.html`;
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
        SELECT entity_id,?,source_document,?,?,?,?,?,? ${activeAttempt}
        ON CONFLICT(message_id,language) DO UPDATE SET source_document=excluded.source_document,subject=excluded.subject,body_text=excluded.body_text,html_key=excluded.html_key,attachments=excluded.attachments,search_text=excluded.search_text,updated_at=excluded.updated_at`).bind(
          language,
          mail.subject,
          mail.body_text,
          htmlKey,
          JSON.stringify(mail.attachments),
          search,
          now,
          job.id,
          job.attempt,
        ),
      );
    }
  }
  statements.push(
    env.DB.prepare(
      "UPDATE translation_jobs SET status='completed',updated_at=? WHERE id=? AND attempt=? AND status='running'",
    ).bind(now, job.id, job.attempt),
  );
  await env.DB.batch(statements);
}
