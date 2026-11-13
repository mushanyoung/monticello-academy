import { TRANSLATION_VERSION } from "../shared/translation";
import { HttpError } from "./errors";
import { queueLessonAlert, sendLessonAlerts } from "./lesson-alerts";
import { lessonConfig } from "./lesson-config";
import { sha256 } from "./mail";
export interface TranslationJob {
  id: string;
  kind: "mail" | "plan";
  entity_id: string;
  source_hash: string;
  source_document: string;
  translator_version: string;
  workflow_id: string;
  status: "queued" | "running" | "completed" | "superseded" | "failed";
  attempt: number;
  notify: number;
  input_key: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
export async function translationJob(env: Env, id: string) {
  const job = await env.DB.prepare("SELECT * FROM translation_jobs WHERE id=?")
    .bind(id)
    .first<TranslationJob>();
  if (!job) throw new HttpError(404, "Translation job not found.");
  return job;
}
export async function enqueueTranslations(
  env: Env,
  kind: "mail" | "plan",
  ids: string[],
  notify = true,
) {
  if (!ids.length) return [];
  const table = kind === "mail" ? "messages" : "lesson_plans",
    column = kind === "mail" ? "raw_key" : "document";
  const sources = await env.DB.prepare(
    `SELECT id,${column} source FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<{ id: string; source: string }>();
  if (sources.results.length !== new Set(ids).size)
    throw new HttpError(422, "Each translation source must exist.");
  const jobs = await Promise.all(
    sources.results.map(async (source) => {
      const hash = await sha256(source.source);
      return {
        ...source,
        hash,
        jobId: await sha256(
          `${TRANSLATION_VERSION}:${kind}:${source.id}:${hash}`,
        ),
      };
    }),
  );
  const now = new Date().toISOString();
  await env.DB.batch(
    jobs.map((job) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO translation_jobs(id,kind,entity_id,source_hash,source_document,translator_version,workflow_id,status,notify,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'queued',?,?,?)",
      ).bind(
        job.jobId,
        kind,
        job.id,
        job.hash,
        job.source,
        TRANSLATION_VERSION,
        `${job.jobId}-1`,
        Number(notify),
        now,
        now,
      ),
    ),
  );
  for (const job of jobs)
    await dispatchTranslation(env, await translationJob(env, job.jobId));
  return jobs.map((job) => job.jobId);
}
export async function translateNewContent(
  env: Env,
  kind: "mail" | "plan",
  ids: string[],
) {
  if (!lessonConfig(env).enabled) return [];
  return enqueueTranslations(env, kind, ids);
}
async function dispatchTranslation(env: Env, job: TranslationJob) {
  if (job.status !== "queued") return;
  try {
    await env.TRANSLATIONS.create({
      id: job.workflow_id,
      params: { jobId: job.id, attempt: job.attempt },
    });
  } catch {
    try {
      const state = await (
        await env.TRANSLATIONS.get(job.workflow_id)
      ).status();
      if (["errored", "terminated", "complete"].includes(state.status))
        await failTranslation(
          env,
          job,
          "workflow_stopped",
          "The translation workflow stopped before saving both languages.",
        );
    } catch {
      if (Date.now() - Date.parse(job.updated_at) > 60 * 60_000)
        await failTranslation(
          env,
          job,
          "dispatch_failed",
          "The translation workflow could not be started.",
        );
      console.error(
        JSON.stringify({ event: "translation_dispatch_failed", jobId: job.id }),
      );
    }
  }
}
export async function failTranslation(
  env: Env,
  job: TranslationJob,
  code: string,
  message: string,
) {
  const updated = await env.DB.prepare(
    "UPDATE translation_jobs SET status='failed',error_code=?,error_message=?,updated_at=? WHERE id=? AND attempt=? AND status IN ('queued','running')",
  )
    .bind(code, message, new Date().toISOString(), job.id, job.attempt)
    .run();
  if (!updated.meta.changes) {
    const current = await translationJob(env, job.id);
    if (current.status !== "failed" || current.attempt !== job.attempt) return;
  }
  if (!job.notify) return;
  const config = lessonConfig(env);
  const url = new URL(config.siteUrl);
  if (job.kind === "mail")
    url.search = new URLSearchParams({
      view: "mail",
      id: job.entity_id,
    }).toString();
  else {
    const [classId, month] = job.entity_id.split(":");
    url.search = new URLSearchParams({
      view: "plans",
      class: classId || "all",
      month: month || "",
    }).toString();
  }
  await queueLessonAlert(
    env,
    `translation-${job.id}-${job.attempt}`,
    null,
    "翻译处理通知 · Translation processing update",
    `中英文翻译在自动重试后仍未完成。原始内容已保留，网站会说明翻译暂不可用。\n\nTranslation could not be completed after automatic retries. Original content remains available.\n${message}\nCode: ${code}\n\n${url}\nJob: ${job.id}`,
  );
}
export async function retryTranslation(env: Env, id: string) {
  const job = await translationJob(env, id);
  if (job.status !== "failed")
    throw new HttpError(409, "Only failed translations can be retried.");
  const attempt = job.attempt + 1;
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE translation_jobs SET status='queued',attempt=?,workflow_id=?,error_code=NULL,error_message=NULL,updated_at=? WHERE id=? AND status='failed' AND attempt=?",
    ).bind(
      attempt,
      `${id}-${attempt}`,
      new Date().toISOString(),
      id,
      job.attempt,
    ),
    env.DB.prepare(
      "UPDATE translation_parts SET response_id=NULL WHERE job_id=? AND result_key IS NULL",
    ).bind(id),
  ]);
  if (!results[0]?.meta.changes)
    throw new HttpError(409, "This translation was already retried.");
  await dispatchTranslation(env, await translationJob(env, id));
  return { id, attempt };
}
export async function reconcileTranslations(env: Env) {
  if (!lessonConfig(env).enabled) return;
  for (const kind of ["mail", "plan"] as const) {
    const table = kind === "mail" ? "messages" : "lesson_plans",
      column = kind === "mail" ? "raw_key" : "document";
    const rows = await env.DB.prepare(
      `SELECT s.id FROM ${table} s WHERE NOT EXISTS(SELECT 1 FROM translation_jobs j WHERE j.kind=? AND j.entity_id=s.id AND j.source_document=s.${column} AND j.translator_version=?) LIMIT 5`,
    )
      .bind(kind, TRANSLATION_VERSION)
      .all<{ id: string }>();
    if (rows.results.length)
      await enqueueTranslations(
        env,
        kind,
        rows.results.map((row) => row.id),
      );
  }
  const pending = await env.DB.prepare(
    "SELECT * FROM translation_jobs WHERE status IN ('queued','running') ORDER BY updated_at LIMIT 10",
  ).all<TranslationJob>();
  for (const job of pending.results) {
    if (job.status === "queued") await dispatchTranslation(env, job);
    else if (Date.now() - Date.parse(job.updated_at) > 30 * 60_000) {
      try {
        await (await env.TRANSLATIONS.get(job.workflow_id)).terminate();
      } catch {
        console.error(
          JSON.stringify({
            event: "translation_terminate_failed",
            jobId: job.id,
          }),
        );
      }
      await failTranslation(
        env,
        job,
        "workflow_timeout",
        "The translation exceeded its processing deadline.",
      );
    }
  }
  await sendLessonAlerts(env);
}
