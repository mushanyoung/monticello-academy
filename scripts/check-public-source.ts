import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { publicSourceIssues } from "./public-source-rules.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const failures: string[] = [];
function scan(
  label: string,
  text: string,
  type: "blob" | "commit" | "tag" = "blob",
) {
  failures.push(
    ...publicSourceIssues(text, type).map((issue) => `${label}: ${issue}`),
  );
}
const paths = new Set(
  git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    .split("\0")
    .filter(Boolean),
);
for (const path of paths) {
  if (path === "pnpm-lock.yaml") continue;
  if (
    /^\.dev\.vars(?!\.example)|^\.env(?!\.example)|^\.cloudflare\//.test(path)
  )
    failures.push(`${path}: private configuration tracked`);
  scan(path, readFileSync(path, "utf8"));
}
if (process.argv.includes("--history")) {
  for (const entry of git("rev-list", "--objects", "--all")
    .trim()
    .split("\n")) {
    const split = entry.indexOf(" ");
    const object = split < 0 ? entry : entry.slice(0, split);
    const path = split < 0 ? "commit" : entry.slice(split + 1);
    if (path === "pnpm-lock.yaml" || !object) continue;
    const type = git("cat-file", "-t", object).trim();
    if (type === "blob" || type === "commit" || type === "tag")
      scan(
        `${path} (${object.slice(0, 8)})`,
        git("cat-file", "-p", object),
        type,
      );
  }
}
if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log(
  `Public-source checks passed (${paths.size} files${process.argv.includes("--history") ? ", all reachable history and commit metadata" : ""}).`,
);
