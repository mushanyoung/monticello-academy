import {
  bindings,
  defineConfig,
  triggers,
  exports as workerExports,
} from "cf/config";
import { deploymentConfig } from "./config/deployment.ts";
import lessonExample from "./config/lessons.example.json" with { type: "json" };
import mailExample from "./config/mail.example.json" with { type: "json" };
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };
export default defineConfig(({ mode }) => {
  const deployment = deploymentConfig(mode);
  return {
    worker: {
      name: deployment.workerName,
      compatibilityDate: "2026-11-13",
      entrypoint,
      exports: {
        TranslationWorkflow: workerExports.workflow({
          name: `${deployment.workerName}-translations`,
          concurrency: { limit: 3 },
        }),
        LessonWorkflow: workerExports.workflow({
          name: `${deployment.workerName}-lessons`,
          concurrency: { limit: 3 },
        }),
      },
      workersDev: true,
      observability: { enabled: true, traces: { enabled: true } },
      assets: {
        notFoundHandling: "single-page-application",
        runWorkerFirst: ["/api/*"],
      },
      env: {
        DB: bindings.d1({ id: deployment.databaseId }),
        MAIL_BUCKET: bindings.r2({ name: deployment.bucketName }),
        MAIL_CONFIG:
          mode === "test" || mode === "development"
            ? bindings.text(JSON.stringify(mailExample))
            : bindings.secret(),
        IMPORT_TOKEN:
          mode === "test"
            ? bindings.text("local-e2e-import-token")
            : bindings.secret(),
        OPENAI_API_KEY:
          mode === "test" || mode === "development"
            ? bindings.text(mode === "test" ? "local-fixture-provider" : "")
            : bindings.secret(),
        LESSON_CONFIG:
          mode === "test" || mode === "development"
            ? bindings.text(
                JSON.stringify({ ...lessonExample, enabled: mode === "test" }),
              )
            : bindings.secret(),
        LESSON_OPENAI_BASE: bindings.text(
          mode === "test"
            ? "http://127.0.0.1:5199/v1"
            : "https://api.openai.com/v1",
        ),
        LESSONS: bindings.workflow({
          name: `${deployment.workerName}-lessons`,
          worker: deployment.workerName,
          exportName: "LessonWorkflow",
        }),
        LESSON_EMAIL: bindings.sendEmail(),
        TRANSLATIONS: bindings.workflow({
          name: `${deployment.workerName}-translations`,
          worker: deployment.workerName,
          exportName: "TranslationWorkflow",
        }),
      },
      triggers: [
        triggers.scheduled({ schedule: "*/15 * * * *" }),
        ...(deployment.emailRoutingAddresses.length
          ? [triggers.email({ addresses: deployment.emailRoutingAddresses })]
          : []),
      ],
    },
  };
});
