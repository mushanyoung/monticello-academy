import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { deploymentPath, deploymentSchema } from "../config/deployment.ts";

const execute = promisify(execFile);
const workerName = process.argv[2];
if (!workerName || !/^[a-z0-9][a-z0-9-]*$/.test(workerName))
  throw new Error("Usage: pnpm config:pull <worker-name>");
async function cf(args: string[]): Promise<unknown> {
  const result = await execute("pnpm", ["exec", "cf", ...args], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}
const version = z
  .object({
    bindings: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        database_id: z.string().optional(),
        bucket_name: z.string().optional(),
      }),
    ),
  })
  .parse(
    await cf(["workers", "versions", "get", "latest", "--worker", workerName]),
  );
const ruleSchema = z.array(
  z.object({
    enabled: z.boolean(),
    actions: z.array(
      z.object({ type: z.string(), value: z.array(z.string()).optional() }),
    ),
    matchers: z.array(
      z.object({ field: z.string().optional(), value: z.string().optional() }),
    ),
  }),
);
const addresses: string[] = [];
for (let page = 1; ; page++) {
  const rules = ruleSchema.parse(
    await cf([
      "email-routing",
      "rules",
      "list-account",
      "--per-page",
      "100",
      "--page",
      String(page),
    ]),
  );
  for (const rule of rules) {
    if (
      rule.enabled &&
      rule.actions.some(
        (a) => a.type === "worker" && a.value?.includes(workerName),
      )
    ) {
      for (const match of rule.matchers)
        if (match.field === "to" && match.value) addresses.push(match.value);
    }
  }
  if (rules.length < 100) break;
}
const deployment = deploymentSchema.parse({
  workerName,
  databaseId: version.bindings.find((b) => b.name === "DB")?.database_id,
  bucketName: version.bindings.find((b) => b.name === "MAIL_BUCKET")
    ?.bucket_name,
  emailRoutingAddresses: addresses,
});
await mkdir(dirname(deploymentPath), { recursive: true });
await writeFile(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  "Deployment bindings and routing configuration refreshed from Cloudflare into the ignored local file.",
);
