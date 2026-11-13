import { spawnSync } from "node:child_process";
import { localDeployment, requireDeployment } from "../config/deployment.ts";

const args = process.argv.slice(2);
const deployment = args.includes("--local")
  ? localDeployment
  : requireDeployment();
const result = spawnSync(
  "pnpm",
  ["exec", "cf", "d1", "migrations", "apply", deployment.databaseId, ...args],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
