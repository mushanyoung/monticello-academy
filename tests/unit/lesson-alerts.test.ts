import { expect, it } from "vitest";
import config from "../../config/lessons.example.json";
import { sendLessonAlerts } from "../../src/worker/lesson-alerts";
import { failLesson, getLessonJob } from "../../src/worker/lesson-jobs";
import { d1Binding, migratedDatabase } from "./sqlite";

it("commits a bilingual failure notice with its attempt and fences late mail delivery", async () => {
  const db = migratedDatabase();
  try {
    db.exec(`INSERT INTO messages VALUES('mail','k','h','','','','','','','','','','');
      INSERT INTO attachments VALUES('file','mail','lesson.pdf','application/pdf',10,'pdf','','filename-only');
      INSERT INTO lesson_jobs(id,attachment_id,message_id,content_key,parser_version,workflow_id,status,created_at,updated_at)
      VALUES('job','file','mail','pdf','1','workflow','running','','');`);
    const started = Promise.withResolvers<void>();
    const slow = Promise.withResolvers<{ messageId: string }>();
    let calls = 0;
    const env = {
      DB: d1Binding(db),
      LESSON_CONFIG: JSON.stringify(config),
      LESSON_EMAIL: {
        send: async () => {
          if (++calls === 1) {
            started.resolve();
            return slow.promise;
          }
          return { messageId: "delivered" };
        },
      },
    } as unknown as Env;
    const job = await getLessonJob(env, "job");
    db.exec(
      "CREATE TRIGGER reject_notice BEFORE INSERT ON lesson_alerts BEGIN SELECT RAISE(ABORT,'unavailable outbox'); END",
    );
    await expect(
      failLesson(env, job, "storage", "Retry exhausted"),
    ).rejects.toThrow("unavailable outbox");
    expect((await getLessonJob(env, "job")).status).toBe("running");
    db.exec("DROP TRIGGER reject_notice");
    await failLesson(env, { ...job, attempt: 0 }, "stale", "Stale attempt");
    expect(db.prepare("SELECT id FROM lesson_alerts").all()).toEqual([]);
    await failLesson(env, job, "storage", "Retry exhausted");
    await failLesson(env, job, "storage", "Retry exhausted");
    expect((await getLessonJob(env, "job")).status).toBe("failed");
    const alerts = db.prepare("SELECT body FROM lesson_alerts").all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.body).toContain("已保留原件");
    expect(alerts[0]?.body).toContain("The original PDF remains available");
    const first = sendLessonAlerts(env);
    await started.promise;
    db.exec("UPDATE lesson_alerts SET next_attempt_at='2000-01-01T00:00:00Z'");
    await sendLessonAlerts(env);
    slow.reject(new Error("First sender timed out"));
    await first;
    expect(
      db
        .prepare(
          "SELECT status,attempts,provider_message_id FROM lesson_alerts",
        )
        .get(),
    ).toEqual({
      status: "sent",
      attempts: 2,
      provider_message_id: "delivered",
    });
  } finally {
    db.close();
  }
});
