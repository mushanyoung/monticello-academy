import {
  LESSON_PARSER_VERSION,
  lessonFileHint,
} from "../shared/lesson-extraction";
import { HttpError } from "./errors";
import { queueLessonAlert, sendLessonAlerts } from "./lesson-alerts";
import { lessonConfig } from "./lesson-config";
import { sha256 } from "./mail";

export interface LessonJob {
  id: string;
  attachment_id: string;
  message_id: string;
  content_key: string;
  parser_version: string;
  workflow_id: string;
  status: "queued" | "running" | "published" | "ignored" | "failed";
  notify: number;
  attempt: number;
  response_id: string | null;
  result_key: string | null;
  issues: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  filename: string;
  size: number;
}
export async function getLessonJob(env: Env, id: string) {
  const row = await env.DB.prepare(
    "SELECT j.*,a.filename,a.size FROM lesson_jobs j JOIN attachments a ON a.id=j.attachment_id WHERE j.id=?",
  )
    .bind(id)
    .first<LessonJob>();
  if (!row) throw new HttpError(404, "Lesson job not found.");
  return row;
}
export async function enqueueLessons(env: Env, ids: string[], notify = true) {
  if (!ids.length) return [];
  const files = await env.DB.prepare(
    `SELECT id,message_id,filename,object_key FROM attachments WHERE id IN (${ids.map(() => "?").join(",")}) AND (content_type='application/pdf' OR lower(filename) LIKE '%.pdf')`,
  )
    .bind(...ids)
    .all<{
      id: string;
      message_id: string;
      filename: string;
      object_key: string;
    }>();
  if (files.results.length !== new Set(ids).size)
    throw new HttpError(
      422,
      "Each lesson input must be an archived PDF attachment.",
    );
  const jobs = await Promise.all(
    files.results.map(async (file) => ({
      ...file,
      jobId: await sha256(`${LESSON_PARSER_VERSION}:${file.object_key}`),
    })),
  );
  const now = new Date().toISOString();
  await env.DB.batch(
    jobs.map((file) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO lesson_jobs(id,attachment_id,message_id,content_key,parser_version,workflow_id,status,notify,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?,?)",
      ).bind(
        file.jobId,
        file.id,
        file.message_id,
        file.object_key,
        LESSON_PARSER_VERSION,
        `${file.jobId}-1`,
        Number(notify),
        now,
        now,
      ),
    ),
  );
  for (const job of jobs)
    await dispatchLesson(env, await getLessonJob(env, job.jobId));
  return jobs.map((job) => job.jobId);
}
async function dispatchLesson(env: Env, job: LessonJob) {
  if (job.status !== "queued") return;
  try {
    await env.LESSONS.create({
      id: job.workflow_id,
      params: { jobId: job.id, attempt: job.attempt },
    });
  } catch {
    // A duplicate create can race with email/cron. Existing instances are authoritative.
    try {
      const status = await (await env.LESSONS.get(job.workflow_id)).status();
      if (["errored", "terminated", "complete"].includes(status.status))
        await failLesson(
          env,
          job,
          "workflow_stopped",
          "The background workflow stopped before saving its result.",
        );
    } catch {
      if (Date.now() - Date.parse(job.updated_at) > 60 * 60_000)
        await failLesson(
          env,
          job,
          "dispatch_failed",
          "The lesson workflow could not be started after repeated attempts.",
        );
      console.error(
        JSON.stringify({ event: "lesson_dispatch_failed", jobId: job.id }),
      );
    }
  }
}
export async function notifyLessonProblem(
  env: Env,
  job: LessonJob,
  summary: string,
) {
  if (!job.notify) return;
  const config = lessonConfig(env);
  const url = new URL(config.siteUrl);
  url.search = new URLSearchParams({
    view: "mail",
    id: job.message_id,
  }).toString();
  await queueLessonAlert(
    env,
    `${job.id}-${job.attempt}`,
    job.id,
    "课程计划处理通知 · Lesson plan update",
    `文件：${job.filename}\n\n${summary}\n\n原始邮件与 PDF：${url}\n\n任务：${job.id}\n原文中的不同说法会全部展示，无需审批。技术故障会保留原件，可在修复原因后重试。`,
  );
}
export async function failLesson(
  env: Env,
  job: LessonJob,
  code: string,
  message: string,
) {
  const updated = await env.DB.prepare(
    "UPDATE lesson_jobs SET status='failed',error_code=?,error_message=?,updated_at=? WHERE id=? AND attempt=? AND status IN ('queued','running')",
  )
    .bind(code, message, new Date().toISOString(), job.id, job.attempt)
    .run();
  if (!updated.meta.changes) {
    const current = await getLessonJob(env, job.id);
    // A stale dispatcher must not report failure after another worker has published.
    if (current.status !== "failed" || current.attempt !== job.attempt) return;
  }
  await notifyLessonProblem(
    env,
    job,
    `自动解析或入库失败。系统已执行步骤重试。\n${message}\n错误代码：${code}`,
  );
}
export async function retryLesson(env: Env, id: string) {
  const job = await getLessonJob(env, id);
  if (job.status !== "failed")
    throw new HttpError(409, "Only failed jobs can be retried.");
  const attempt = job.attempt + 1;
  const updated = await env.DB.prepare(
    "UPDATE lesson_jobs SET status='queued',attempt=?,workflow_id=?,response_id=NULL,result_key=NULL,error_code=NULL,error_message=NULL,updated_at=? WHERE id=? AND status='failed' AND attempt=?",
  )
    .bind(
      attempt,
      `${id}-${attempt}`,
      new Date().toISOString(),
      id,
      job.attempt,
    )
    .run();
  if (!updated.meta.changes)
    throw new HttpError(409, "This job was already retried.");
  await dispatchLesson(env, await getLessonJob(env, id));
  return { id, attempt };
}
export async function reconcileLessons(env: Env) {
  const config = lessonConfig(env);
  if (config.enabled) {
    const candidates =
      await env.DB.prepare(`SELECT a.id,a.filename,m.subject,m.body_text FROM attachments a JOIN messages m ON m.id=a.message_id
      WHERE (a.content_type='application/pdf' OR lower(a.filename) LIKE '%.pdf') AND m.received_at>=?
      AND NOT EXISTS(SELECT 1 FROM lesson_jobs j WHERE j.content_key=a.object_key AND j.parser_version=?)
      AND (lower(a.filename) LIKE '%lesson%plan%' OR lower(m.subject) LIKE '%lesson%plan%' OR lower(m.body_text) LIKE '%lesson%plan%')
      ORDER BY m.received_at LIMIT 10`)
        .bind(config.processFrom, LESSON_PARSER_VERSION)
        .all<{
          id: string;
          filename: string;
          subject: string;
          body_text: string;
        }>();
    if (candidates.results.length)
      await enqueueLessons(
        env,
        candidates.results.map((file) => file.id),
      );
    const pending = await env.DB.prepare(
      "SELECT id FROM lesson_jobs WHERE status IN ('queued','running') ORDER BY updated_at LIMIT 10",
    ).all<{ id: string }>();
    for (const { id } of pending.results) {
      const job = await getLessonJob(env, id);
      if (job.status === "queued") await dispatchLesson(env, job);
      else if (Date.now() - Date.parse(job.updated_at) > 30 * 60_000) {
        try {
          await (await env.LESSONS.get(job.workflow_id)).terminate();
        } catch {
          console.error(
            JSON.stringify({ event: "lesson_terminate_failed", jobId: id }),
          );
        }
        await failLesson(
          env,
          job,
          "workflow_timeout",
          "The background job exceeded its processing deadline.",
        );
      }
    }
  }
  await sendLessonAlerts(env);
}
export async function enqueueMessageLessons(env: Env, messageIds: string[]) {
  if (!lessonConfig(env).enabled || !messageIds.length) return;
  const files = await env.DB.prepare(
    `SELECT a.id,a.filename,m.subject,m.body_text FROM attachments a JOIN messages m ON m.id=a.message_id WHERE a.message_id IN (${messageIds.map(() => "?").join(",")}) AND (a.content_type='application/pdf' OR lower(a.filename) LIKE '%.pdf')`,
  )
    .bind(...messageIds)
    .all<{
      id: string;
      filename: string;
      subject: string;
      body_text: string;
    }>();
  const ids = files.results
    .filter(
      (file) =>
        lessonFileHint(file.filename).expectedLesson ||
        /lesson[\s\S]{0,30}plan/i.test(`${file.subject}\n${file.body_text}`),
    )
    .map((file) => file.id);
  for (let offset = 0; offset < ids.length; offset += 10)
    await enqueueLessons(env, ids.slice(offset, offset + 10));
}
