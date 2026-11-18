import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { publicSourceIssues } from "./public-source-rules.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const failures: string[] = [];
function checkPath(path: string, label: string) {
  const privatePart = path
    .split("/")
    .some(
      (part) =>
        part === ".cloudflare" ||
        (/^\.(?:dev\.vars|env)/.test(part) &&
          part !== ".dev.vars.example" &&
          part !== ".env.example"),
    );
  if (privatePart) failures.push(`${label}: private configuration tracked`);
}
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
  checkPath(path, path);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isFile()) scan(path, readFileSync(path, "utf8"));
  else if (stat?.isSymbolicLink()) scan(path, readlinkSync(path));
}
// The index can differ from the working tree even when the file has been removed locally.
const objects = new Map<string, string>();
for (const entry of git("ls-files", "--stage", "-z")
  .split("\0")
  .filter(Boolean)) {
  const tab = entry.indexOf("\t");
  const [mode, oid] = entry.slice(0, tab).split(" ");
  if (oid && mode !== "160000")
    objects.set(oid, `index ${entry.slice(tab + 1)}`);
}
if (process.argv.includes("--history")) {
  for (const entry of git("rev-list", "--objects", "--all")
    .trim()
    .split("\n")) {
    const split = entry.indexOf(" ");
    const object = split < 0 ? entry : entry.slice(0, split);
    const path = split < 0 ? "history" : entry.slice(split + 1);
    if (object && !objects.has(object))
      objects.set(object, `${path} (${object.slice(0, 8)})`);
  }
}
const typed = execFileSync(
  "git",
  ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
  {
    input: Array.from(objects.keys(), (oid) => `${oid}\n`).join(""),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);
for (const entry of typed.trimEnd().split("\n").filter(Boolean)) {
  const [oid, type] = entry.split(" ");
  if (!oid) throw new Error("Missing Git object ID");
  const label = objects.get(oid) ?? oid;
  if (type === "tree") {
    for (const name of git("ls-tree", "-z", "--name-only", oid)
      .split("\0")
      .filter(Boolean))
      checkPath(name, `${label}/${name}`);
  } else if (type === "blob" || type === "commit" || type === "tag") {
    scan(label, git("cat-file", "-p", oid), type);
  } else throw new Error(`Cannot scan Git object ${oid}`);
}
if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log(
  `Public-source checks passed (${paths.size} files${process.argv.includes("--history") ? ", all reachable history and commit metadata" : ""}).`,
);
