import { rm } from "node:fs/promises";
import { URL } from "node:url";

// Only generated e2e state is reset. Development and remote resources are untouched.
await rm(new URL("../.cloudflare/test-state", import.meta.url), {
  recursive: true,
  force: true,
});
