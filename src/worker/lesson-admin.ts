import { z } from "zod";
import { isAdmin } from "./auth";
import { HttpError, readLimited } from "./errors";
import { queueLessonAlert, sendLessonAlerts } from "./lesson-alerts";
import {
  enqueueLessons,
  getLessonJob,
  reconcileLessons,
  retryLesson,
} from "./lesson-jobs";

export async function lessonAdmin(request: Request, env: Env) {
  if (!(await isAdmin(request, env)))
    throw new HttpError(401, "Import credentials required.");
  const path = new URL(request.url).pathname;
  if (path === "/api/admin/lessons" && request.method === "GET") {
    const jobs = await env.DB.prepare(
      "SELECT j.*,a.filename FROM lesson_jobs j JOIN attachments a ON a.id=j.attachment_id ORDER BY j.created_at DESC LIMIT 200",
    ).all();
    const alerts = await env.DB.prepare(
      "SELECT id,job_id,status,attempts,provider_message_id,created_at,sent_at FROM lesson_alerts ORDER BY created_at DESC LIMIT 100",
    ).all();
    return Response.json({ jobs: jobs.results, alerts: alerts.results });
  }
  if (path === "/api/admin/lessons" && request.method === "POST") {
    let input: unknown;
    try {
      input = JSON.parse(
        new TextDecoder().decode(await readLimited(request.body, 16 * 1024)),
      );
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
    const parsed = z
      .object({
        attachmentIds: z
          .array(z.string().regex(/^[a-f0-9]{64}$/))
          .min(1)
          .max(30),
        notify: z.boolean().default(true),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new HttpError(
        422,
        "Provide 1–30 archived PDF attachment IDs and an optional notify boolean.",
      );
    return Response.json(
      {
        jobs: await enqueueLessons(
          env,
          parsed.data.attachmentIds,
          parsed.data.notify,
        ),
      },
      { status: 202 },
    );
  }
  if (path === "/api/admin/lessons/reconcile" && request.method === "POST") {
    await reconcileLessons(env);
    return Response.json({ ok: true });
  }
  if (
    path === "/api/admin/lessons/notification-test" &&
    request.method === "POST"
  ) {
    const id = `test-${crypto.randomUUID()}`;
    await queueLessonAlert(
      env,
      id,
      null,
      "课程计划通知测试 · Lesson notification test",
      "课程计划邮件通知已接通。这是一封测试通知。未来课程解析或入库失败、或原表信息有差异时，会发邮件到此地址。原文差异会直接保留并显示，无需确认或审批。",
    );
    await sendLessonAlerts(env);
    return Response.json(
      await env.DB.prepare(
        "SELECT id,status,provider_message_id FROM lesson_alerts WHERE id=?",
      )
        .bind(id)
        .first(),
    );
  }
  const job = path.match(
    /^\/api\/admin\/lessons\/([a-f0-9]{64})\/(retry|result)$/,
  );
  if (job?.[1] && job[2] === "retry" && request.method === "POST")
    return Response.json(await retryLesson(env, job[1]), { status: 202 });
  if (job?.[1] && job[2] === "result" && request.method === "GET") {
    const record = await getLessonJob(env, job[1]);
    const object = record.result_key
      ? await env.MAIL_BUCKET.get(record.result_key)
      : null;
    if (!object)
      throw new HttpError(404, "No extraction result has been saved.");
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
  throw new HttpError(404, "Lesson operation not found.");
}
