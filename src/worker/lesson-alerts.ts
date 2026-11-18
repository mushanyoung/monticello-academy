import { lessonConfig } from "./lesson-config";

type JobTable = "lesson_jobs" | "translation_jobs";
type Attempt = { id: string; attempt: number };
type Notice = { subject: string; body: string };

export function jobAlert(
  env: Env,
  table: JobTable,
  job: Attempt,
  status: "published" | "failed",
  notice: Notice,
) {
  const now = new Date().toISOString();
  const id =
    table === "translation_jobs"
      ? `translation-${job.id}-${job.attempt}`
      : `${job.id}-${job.attempt}${status === "published" ? "-sources" : ""}`;
  return env.DB.prepare(`INSERT OR IGNORE INTO lesson_alerts(id,job_id,subject,body,status,next_attempt_at,created_at)
    SELECT ?,?,?,?,'pending',?,? FROM ${table} WHERE id=? AND attempt=? AND status=? AND notify=1`).bind(
    id,
    table === "lesson_jobs" ? job.id : null,
    notice.subject,
    notice.body,
    now,
    now,
    job.id,
    job.attempt,
    status,
  );
}

export async function recordJobFailure(
  env: Env,
  table: JobTable,
  job: Attempt,
  code: string,
  message: string,
  notice?: Notice,
) {
  const writes = [
    env.DB.prepare(`UPDATE ${table} SET status='failed',error_code=?,error_message=?,updated_at=?
    WHERE id=? AND attempt=? AND status IN ('queued','running')`).bind(
      code,
      message,
      new Date().toISOString(),
      job.id,
      job.attempt,
    ),
  ];
  if (notice) writes.push(jobAlert(env, table, job, "failed", notice));
  await env.DB.batch(writes);
}

export async function queueLessonAlert(
  env: Env,
  id: string,
  jobId: string | null,
  subject: string,
  body: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO lesson_alerts(id,job_id,subject,body,status,next_attempt_at,created_at) VALUES(?,?,?,?,'pending',?,?)",
  )
    .bind(id, jobId, subject, body, now, now)
    .run();
}
export async function sendLessonAlerts(env: Env) {
  const config = lessonConfig(env);
  const now = new Date().toISOString();
  const alerts = await env.DB.prepare(
    "SELECT id,subject,body,attempts FROM lesson_alerts WHERE status<>'sent' AND next_attempt_at<=? ORDER BY created_at LIMIT 10",
  )
    .bind(now)
    .all<{ id: string; subject: string; body: string; attempts: number }>();
  for (const alert of alerts.results) {
    const lease = new Date(Date.now() + 10 * 60_000).toISOString();
    const claim = await env.DB.prepare(
      "UPDATE lesson_alerts SET status='sending',attempts=attempts+1,next_attempt_at=? WHERE id=? AND attempts=? AND status<>'sent' AND next_attempt_at<=?",
    )
      .bind(lease, alert.id, alert.attempts, now)
      .run();
    if (!claim.meta.changes) continue;
    try {
      const sent = await env.LESSON_EMAIL.send({
        from: config.notificationFrom,
        to: config.notificationTo,
        subject: alert.subject,
        text: alert.body,
      });
      await env.DB.prepare(
        "UPDATE lesson_alerts SET status='sent',provider_message_id=?,sent_at=? WHERE id=? AND status='sending' AND attempts=?",
      )
        .bind(
          sent.messageId,
          new Date().toISOString(),
          alert.id,
          alert.attempts + 1,
        )
        .run();
    } catch {
      const next = new Date(
        Date.now() +
          Math.min(24 * 60, 15 * 2 ** Math.min(alert.attempts, 7)) * 60_000,
      ).toISOString();
      await env.DB.prepare(
        "UPDATE lesson_alerts SET status='pending',next_attempt_at=? WHERE id=? AND status='sending' AND attempts=?",
      )
        .bind(next, alert.id, alert.attempts + 1)
        .run();
      console.error(
        JSON.stringify({
          event: "lesson_notification_failed",
          alertId: alert.id,
        }),
      );
    }
  }
}
