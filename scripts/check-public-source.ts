import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const failures: string[] = [];
function scan(label: string, text: string) {
  const emails =
    text.match(/[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)+[A-Z]{2,}/gi) || [];
  for (const address of emails) {
    const domain = address.slice(address.indexOf("@") + 1).toLowerCase();
    if (
      !/(^|\.)example\.(com|org|net|invalid)$/.test(domain) &&
      !domain.endsWith(".example")
    ) {
      failures.push(`${label}: non-example email address`);
    }
  }
  if (
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|AKIA[A-Z0-9]{16})\b|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(
      text,
    )
  )
    failures.push(`${label}: credential-shaped value`);
  const ids =
    text.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ) || [];
  if (ids.some((id) => id !== "00000000-0000-4000-8000-000000000001"))
    failures.push(`${label}: deployment identifier`);
  if (/\b[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/i.test(text))
    failures.push(`${label}: concrete deployment hostname`);
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
      scan(`${path} (${object.slice(0, 8)})`, git("cat-file", "-p", object));
  }
}
if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log(
  `Public-source checks passed (${paths.size} files${process.argv.includes("--history") ? ", all reachable history and commit metadata" : ""}).`,
);
