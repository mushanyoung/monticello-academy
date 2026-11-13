import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  lessonFileHint,
  validateExtraction,
} from "../shared/lesson-extraction";
import { sendLessonAlerts } from "./lesson-alerts";
import { failLesson, getLessonJob, notifyLessonProblem } from "./lesson-jobs";
import { publishExtraction } from "./lesson-publish";
import { indexLessonText } from "./lesson-search";
import {
  LessonError,
  lessonRequest,
  lessonRequestBody,
  readExtraction,
} from "./openai";

export class LessonWorkflow extends WorkflowEntrypoint<
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
        backoff: "exponential" as const,
      },
      timeout: "90 seconds",
    } as const;
    const job = await step.do("load archived PDF job", () =>
      getLessonJob(this.env, event.payload.jobId),
    );
    if (
      job.attempt !== event.payload.attempt ||
      !["queued", "running"].includes(job.status)
    )
      return;
    const resultKey = `lesson-results/${job.id}/${job.attempt}.json`;
    try {
      const submitted = await step.do(
        "submit PDF to Terra",
        retry,
        async () => {
          const current = await getLessonJob(this.env, job.id);
          if (current.response_id)
            return { id: current.response_id, status: "in_progress" };
          await this.env.DB.prepare(
            "UPDATE lesson_jobs SET status='running',updated_at=? WHERE id=? AND attempt=?",
          )
            .bind(new Date().toISOString(), job.id, job.attempt)
            .run();
          const object = await this.env.MAIL_BUCKET.get(job.content_key);
          if (!object || object.size > 15 * 1024 * 1024)
            throw new LessonError(
              "pdf_unavailable",
              "The PDF is missing or exceeds the 15 MiB parser limit.",
            );
          const response = await lessonRequest(
            this.env,
            "/responses",
            lessonRequestBody(job.filename, await object.arrayBuffer()),
          );
          await this.env.DB.prepare(
            "UPDATE lesson_jobs SET response_id=?,updated_at=? WHERE id=? AND attempt=?",
          )
            .bind(response.id, new Date().toISOString(), job.id, job.attempt)
            .run();
          if (response.status === "completed")
            await this.env.MAIL_BUCKET.put(
              resultKey,
              JSON.stringify(response),
              { httpMetadata: { contentType: "application/json" } },
            );
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
          `wait for Terra ${poll}`,
          test ? "1 second" : "10 seconds",
        );
        status = await step.do(`poll Terra ${poll}`, retry, async () => {
          const response = await lessonRequest(
            this.env,
            `/responses/${submitted.id}`,
          );
          if (response.status === "completed")
            await this.env.MAIL_BUCKET.put(
              resultKey,
              JSON.stringify(response),
              { httpMetadata: { contentType: "application/json" } },
            );
          await this.env.DB.prepare(
            "UPDATE lesson_jobs SET updated_at=? WHERE id=? AND attempt=?",
          )
            .bind(new Date().toISOString(), job.id, job.attempt)
            .run();
          return response.status;
        });
      }
      if (status !== "completed")
        throw new LessonError(
          "provider_incomplete",
          `Lesson model did not finish successfully (${status}).`,
        );
      await step.do(
        "validate and publish all source entries",
        retry,
        async () => {
          const current = await getLessonJob(this.env, job.id);
          if (current.attempt !== job.attempt || current.status !== "running")
            return;
          await this.env.DB.prepare(
            "UPDATE lesson_jobs SET result_key=? WHERE id=? AND attempt=?",
          )
            .bind(resultKey, job.id, job.attempt)
            .run();
          const stored = await this.env.MAIL_BUCKET.get(resultKey);
          if (!stored)
            throw new LessonError(
              "result_missing",
              "The saved model result is unavailable.",
            );
          const extraction = readExtraction(await stored.json());
          const issues = validateExtraction(extraction, job.filename);
          if (
            !extraction.isLessonPlan &&
            lessonFileHint(job.filename).expectedLesson
          )
            throw new LessonError(
              "unrecognized_lesson",
              "The named lesson PDF could not be recognized.",
            );
          if (extraction.isLessonPlan)
            await publishExtraction(this.env, extraction, {
              attachmentId: job.attachment_id,
              messageId: job.message_id,
              filename: job.filename,
            });
          await indexLessonText(this.env, job.content_key, extraction);
          if (issues.length)
            await notifyLessonProblem(
              this.env,
              job,
              `课程已入库。以下原文差异或提取问题已保留并显示：\n${issues.map((issue) => `- ${issue.description}${issue.pages.length ? ` (PDF p. ${issue.pages.join(", ")})` : ""}`).join("\n")}`,
            );
          await this.env.DB.prepare(
            "UPDATE lesson_jobs SET status=?,issues=?,updated_at=? WHERE id=? AND attempt=?",
          )
            .bind(
              extraction.isLessonPlan ? "published" : "ignored",
              JSON.stringify(issues),
              new Date().toISOString(),
              job.id,
              job.attempt,
            )
            .run();
        },
      );
    } catch (error) {
      const code =
        error instanceof LessonError ? error.code : "processing_failed";
      const message =
        error instanceof LessonError
          ? error.message
          : "Lesson processing failed after retries. The original PDF is retained.";
      await step.do("record failure and durable notification", retry, () =>
        failLesson(this.env, job, code, message),
      );
    }
    await step.do("deliver queued notifications", retry, () =>
      sendLessonAlerts(this.env),
    );
  }
}
