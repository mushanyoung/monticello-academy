import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { z } from "zod";
import example from "./deployment.example.json" with { type: "json" };
export const deploymentSchema = z
  .object({
    workerName: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    databaseId: z.uuid(),
    bucketName: z.string().min(1),
    emailRoutingAddresses: z.array(z.email()),
  })
  .strict();
export const localDeployment = deploymentSchema.parse(example);
export const deploymentPath = fileURLToPath(
  new URL("../.cloudflare/deployment.json", import.meta.url),
);
export function deploymentConfig(mode?: string) {
  if (mode === "test" || mode === "development" || !existsSync(deploymentPath))
    return localDeployment;
  return deploymentSchema.parse(
    JSON.parse(readFileSync(deploymentPath, "utf8")),
  );
}
export function requireDeployment() {
  if (!existsSync(deploymentPath))
    throw new Error(
      "Run pnpm config:pull <worker-name> or create the ignored deployment file from config/deployment.example.json before remote operations.",
    );
  return deploymentConfig("production");
}
