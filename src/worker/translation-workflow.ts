import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  type TranslatedSegment,
  type TranslationTemplate,
  translationBatches,
} from "../shared/translation";
import { sendLessonAlerts } from "./lesson-alerts";
import { LessonError, lessonRequest } from "./openai";
import { prepareTranslation, publishTranslation } from "./translation-data";
import {
  failTranslation,
  type TranslationJob,
  translationJob,
} from "./translation-jobs";
import {
  readTranslatedSegments,
  translationRequestBody,
} from "./translation-model";

const activeJob =
  "EXISTS(SELECT 1 FROM translation_jobs WHERE id=? AND attempt=? AND status='running')";
async function savePart(
  env: Env,
  job: TranslationJob,
  part: number,
  segments: TranslatedSegment[],
) {
  const key = `translations/${job.id}/${job.attempt}/part-${part}.json`;
  await env.MAIL_BUCKET.put(key, JSON.stringify(segments));
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE translation_parts SET result_key=? WHERE job_id=? AND part=? AND ${activeJob}`,
    ).bind(key, job.id, part, job.id, job.attempt),
    env.DB.prepare(
      "UPDATE translation_jobs SET updated_at=? WHERE id=? AND attempt=? AND status='running'",
    ).bind(new Date().toISOString(), job.id, job.attempt),
  ]);
}

export class TranslationWorkflow extends WorkflowEntrypoint<
  Env,
  { jobId: string; attempt: number }
> {
  async run(
    event: WorkflowEvent<{ jobId: string; attempt: number }>,
    step: WorkflowStep,
  ) {
    const test = this.env.LESSON_OPENAI_BASE.startsWith("http://127.0.0.1:");
    const retry = {
      retries: {
        limit: 3,
        delay: test ? "1 second" : "15 seconds",
        backoff: "exponential",
      },
      timeout: "90 seconds",
    } as const;
    const job = await step.do("load translation job", () =>
      translationJob(this.env, event.payload.jobId),
    );
    if (
      job.attempt !== event.payload.attempt ||
      !["queued", "running"].includes(job.status)
    )
      return;
    try {
      const prepared = await step.do(
        "prepare immutable translation input",
        retry,
        async () => {
          const inputKey =
            job.input_key || (await prepareTranslation(this.env, job));
          const object = await this.env.MAIL_BUCKET.get(inputKey);
          if (!object)
            throw new LessonError(
              "translation_input_missing",
              "The saved translation input is unavailable.",
            );
          const template = await object.json<TranslationTemplate>();
          const claim = await this.env.DB.prepare(
            "UPDATE translation_jobs SET input_key=?,status='running',updated_at=? WHERE id=? AND attempt=? AND status IN ('queued','running')",
          )
            .bind(inputKey, new Date().toISOString(), job.id, job.attempt)
            .run();
          if (!claim.meta.changes) return null;
          return {
            inputKey,
            parts: translationBatches(template.segments).length,
          };
        },
      );
      if (!prepared) return;
      for (let part = 0; part < prepared.parts; part++) {
        const submitted = await step.do(
          `submit translation part ${part}`,
          retry,
          async () => {
            const saved = await this.env.DB.prepare(
              "SELECT response_id,result_key FROM translation_parts WHERE job_id=? AND part=?",
            )
              .bind(job.id, part)
              .first<{
                response_id: string | null;
                result_key: string | null;
              }>();
            if (saved?.result_key) return { id: "", status: "completed" };
            if (saved?.response_id)
              return { id: saved.response_id, status: "in_progress" };
            const object = await this.env.MAIL_BUCKET.get(prepared.inputKey);
            if (!object) throw new Error("Missing input");
            const template = await object.json<TranslationTemplate>();
            const batch = translationBatches(template.segments)[part];
            if (!batch) throw new Error("Missing part");
            const response = await lessonRequest(
              this.env,
              "/responses",
              translationRequestBody(batch),
            );
            const recorded = await this.env.DB.prepare(
              `INSERT INTO translation_parts(job_id,part,response_id) SELECT ?,?,? WHERE ${activeJob}
               ON CONFLICT(job_id,part) DO UPDATE SET response_id=excluded.response_id`,
            )
              .bind(job.id, part, response.id, job.id, job.attempt)
              .run();
            if (!recorded.meta.changes) return { id: "", status: "retired" };
            if (response.status === "completed") {
              const result = readTranslatedSegments(response, batch);
              await savePart(this.env, job, part, result);
            }
            return { id: response.id, status: response.status };
          },
        );
        if (submitted.status === "retired") return;
        let status = submitted.status;
        for (
          let poll = 0;
          ["queued", "in_progress"].includes(status) && poll < 60;
          poll++
        ) {
          await step.sleep(
            `wait for translation ${part}-${poll}`,
            test ? "1 second" : "10 seconds",
          );
          status = await step.do(
            `poll translation ${part}-${poll}`,
            retry,
            async () => {
              const response = await lessonRequest(
                this.env,
                `/responses/${submitted.id}`,
              );
              if (response.status === "completed") {
                const input = await this.env.MAIL_BUCKET.get(prepared.inputKey);
                if (!input) throw new Error("Missing input");
                const template = await input.json<TranslationTemplate>();
                const batch = translationBatches(template.segments)[part];
                if (!batch) throw new Error("Missing part");
                const result = readTranslatedSegments(response, batch);
                await savePart(this.env, job, part, result);
              } else
                await this.env.DB.prepare(
                  "UPDATE translation_jobs SET updated_at=? WHERE id=? AND attempt=? AND status='running'",
                )
                  .bind(new Date().toISOString(), job.id, job.attempt)
                  .run();
              return response.status;
            },
          );
        }
        if (status !== "completed")
          throw new LessonError(
            "translation_incomplete",
            `Translation part did not finish (${status}).`,
          );
      }
      await step.do(
        "publish both languages if the source is current",
        retry,
        async () => {
          const current = await translationJob(this.env, job.id);
          if (current.attempt !== job.attempt || current.status !== "running")
            return;
          const object = await this.env.MAIL_BUCKET.get(prepared.inputKey);
          if (!object) throw new Error("Missing translation input");
          const template = await object.json<TranslationTemplate>();
          const segments: TranslatedSegment[] = [];
          const saved = await this.env.DB.prepare(
            "SELECT part,result_key FROM translation_parts WHERE job_id=? ORDER BY part",
          )
            .bind(job.id)
            .all<{ part: number; result_key: string | null }>();
          if (saved.results.length !== prepared.parts)
            throw new Error("Missing translation parts");
          for (const [part, row] of saved.results.entries()) {
            if (row.part !== part || !row.result_key)
              throw new Error("Incomplete translation part");
            const result = await this.env.MAIL_BUCKET.get(row.result_key);
            if (!result) throw new Error("Missing translation result");
            segments.push(...(await result.json<TranslatedSegment[]>()));
          }
          await publishTranslation(this.env, job, template, segments);
        },
      );
    } catch (error) {
      await step.do("save translation failure and notify", retry, () =>
        failTranslation(
          this.env,
          job,
          error instanceof LessonError ? error.code : "translation_failed",
          error instanceof LessonError
            ? error.message
            : "Content translation failed after automatic retries. The original is retained.",
        ),
      );
    }
    await step.do("send translation notifications", retry, () =>
      sendLessonAlerts(this.env),
    );
  }
}
