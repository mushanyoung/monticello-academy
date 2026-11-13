import { defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };
export default defineConfig({
  accountId: "00000000000000000000000000000000",
  worker: {
    name: "family-notebook",
    compatibilityDate: "2026-11-13",
    entrypoint,
    workersDev: true,
    observability: { enabled: true, traces: { enabled: true } },
  },
});
