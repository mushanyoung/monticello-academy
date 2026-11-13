import { spawnSync } from "node:child_process";
import { requireDeployment } from "../config/deployment.ts";

requireDeployment();
const args = process.argv.slice(2);
if (args.some((a) => a === "--mode" || a.startsWith("--mode=")))
  throw new Error("Deployment always uses production mode.");
const result = spawnSync(
  "pnpm",
  ["exec", "cf", "deploy", "--mode", "production", ...args],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
