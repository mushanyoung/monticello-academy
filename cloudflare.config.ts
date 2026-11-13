import { bindings, defineConfig, triggers } from "cf/config";
import { deploymentConfig } from "./config/deployment.ts";
import mailExample from "./config/mail.example.json" with { type: "json" };
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };
export default defineConfig(({ mode }) => {
  const deployment = deploymentConfig(mode);
  return {
    worker: {
      name: deployment.workerName,
      compatibilityDate: "2026-11-13",
      entrypoint,
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
            ? bindings.text("")
            : bindings.secret(),
      },
      triggers: deployment.emailRoutingAddresses.length
        ? [triggers.email({ addresses: deployment.emailRoutingAddresses })]
        : [],
    },
  };
});
