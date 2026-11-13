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
import { failTranslation, translationJob } from "./translation-jobs";
import {
  readTranslatedSegments,
  translationRequestBody,
} from "./translation-model";

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
          await this.env.DB.prepare(
            "UPDATE translation_jobs SET status='running',updated_at=? WHERE id=? AND attempt=?",
          )
            .bind(new Date().toISOString(), job.id, job.attempt)
            .run();
          return {
            inputKey,
            parts: translationBatches(template.segments).length,
          };
        },
      );
      for (let part = 0; part < prepared.parts; part++) {
        const resultKey = `translations/${job.id}/part-${part}.json`;
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
            await this.env.DB.prepare(
              "INSERT INTO translation_parts(job_id,part,response_id) VALUES(?,?,?) ON CONFLICT(job_id,part) DO UPDATE SET response_id=excluded.response_id",
            )
              .bind(job.id, part, response.id)
              .run();
            if (response.status === "completed") {
              const result = readTranslatedSegments(response, batch);
              await this.env.MAIL_BUCKET.put(resultKey, JSON.stringify(result));
              await this.env.DB.prepare(
                "UPDATE translation_parts SET result_key=? WHERE job_id=? AND part=?",
              )
                .bind(resultKey, job.id, part)
                .run();
            }
            return { id: response.id, status: response.status };
          },
        );
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
                await this.env.MAIL_BUCKET.put(
                  resultKey,
                  JSON.stringify(result),
                );
                await this.env.DB.prepare(
                  "UPDATE translation_parts SET result_key=? WHERE job_id=? AND part=?",
                )
                  .bind(resultKey, job.id, part)
                  .run();
              }
              await this.env.DB.prepare(
                "UPDATE translation_jobs SET updated_at=? WHERE id=? AND attempt=?",
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
          for (let part = 0; part < prepared.parts; part++) {
            const result = await this.env.MAIL_BUCKET.get(
              `translations/${job.id}/part-${part}.json`,
            );
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
