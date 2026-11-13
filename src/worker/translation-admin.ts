import { z } from "zod";
import { isAdmin } from "./auth";
import { HttpError, readLimited } from "./errors";
import {
  enqueueTranslations,
  reconcileTranslations,
  retryTranslation,
  translationJob,
} from "./translation-jobs";
export async function translationAdmin(request: Request, env: Env) {
  if (!(await isAdmin(request, env)))
    throw new HttpError(401, "Import credentials required.");
  const path = new URL(request.url).pathname;
  if (path === "/api/admin/translations" && request.method === "GET") {
    const jobs = await env.DB.prepare(
      "SELECT id,kind,entity_id,status,attempt,error_code,error_message,created_at,updated_at FROM translation_jobs ORDER BY created_at DESC LIMIT 300",
    ).all();
    const counts = await env.DB.prepare(
      "SELECT kind,status,count(*) count FROM translation_jobs GROUP BY kind,status",
    ).all();
    return Response.json({ jobs: jobs.results, counts: counts.results });
  }
  if (path === "/api/admin/translations" && request.method === "POST") {
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
        kind: z.enum(["mail", "plan"]),
        ids: z.array(z.string().min(1).max(100)).min(1).max(30),
        notify: z.boolean().default(true),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new HttpError(
        422,
        "Provide a source kind, 1–30 entity IDs and an optional notify boolean.",
      );
    return Response.json(
      {
        jobs: await enqueueTranslations(
          env,
          parsed.data.kind,
          parsed.data.ids,
          parsed.data.notify,
        ),
      },
      { status: 202 },
    );
  }
  if (
    path === "/api/admin/translations/reconcile" &&
    request.method === "POST"
  ) {
    await reconcileTranslations(env);
    return Response.json({ ok: true });
  }
  const match = path.match(
    /^\/api\/admin\/translations\/([a-f0-9]{64})\/(retry|input)$/,
  );
  if (match?.[1] && match[2] === "retry" && request.method === "POST")
    return Response.json(await retryTranslation(env, match[1]), {
      status: 202,
    });
  if (match?.[1] && match[2] === "input" && request.method === "GET") {
    const job = await translationJob(env, match[1]);
    const object = job.input_key
      ? await env.MAIL_BUCKET.get(job.input_key)
      : null;
    if (!object) throw new HttpError(404, "Translation input is unavailable.");
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
  throw new HttpError(404, "Translation operation not found.");
}
