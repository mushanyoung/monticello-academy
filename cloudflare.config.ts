import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };
export default defineConfig(({ mode }) => ({
  accountId: "00000000000000000000000000000000",
  worker: {
    name: "family-notebook",
    compatibilityDate: "2026-11-13",
    entrypoint,
    workersDev: true,
    observability: { enabled: true, traces: { enabled: true } },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    env: {
      DB: bindings.d1({
        name: "family-notebook",
        id: "00000000-0000-4000-8000-000000000001",
      }),
      MAIL_BUCKET: bindings.r2({ name: "family-notebook-files" }),
      INBOUND_ADDRESS: bindings.text("notebook@example.com"),
      ALLOWED_FORWARDERS: bindings.text("parent@example.com,parent@example.org"),
      IMPORT_TOKEN:
        mode === "test"
          ? bindings.text("local-e2e-import-token")
          : bindings.secret(),
    },
    triggers: [triggers.email({ addresses: ["notebook@example.com"] })],
  },
}));
