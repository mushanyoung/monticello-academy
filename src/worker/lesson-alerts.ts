import { lessonConfig } from "./lesson-config";

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
      "UPDATE lesson_alerts SET status='sending',attempts=attempts+1,next_attempt_at=? WHERE id=? AND status<>'sent' AND next_attempt_at<=?",
    )
      .bind(lease, alert.id, now)
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
        "UPDATE lesson_alerts SET status='sent',provider_message_id=?,sent_at=? WHERE id=?",
      )
        .bind(sent.messageId, new Date().toISOString(), alert.id)
        .run();
    } catch {
      const next = new Date(
        Date.now() +
          Math.min(24 * 60, 15 * 2 ** Math.min(alert.attempts, 7)) * 60_000,
      ).toISOString();
      await env.DB.prepare(
        "UPDATE lesson_alerts SET status='pending',next_attempt_at=? WHERE id=?",
      )
        .bind(next, alert.id)
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
