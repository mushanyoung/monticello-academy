type ObjectType = "blob" | "commit" | "tag";

function identityEmailRanges(text: string, type: ObjectType) {
  if (type === "blob") return [];
  const headerEnd = text.indexOf("\n\n");
  if (headerEnd < 0) return [];
  const pattern =
    type === "commit"
      ? /^(?:author|committer) [^<>\r\n]+ <([^<>\r\n]+)> -?\d+ [+-]\d{4}$/gm
      : /^tagger [^<>\r\n]+ <([^<>\r\n]+)> -?\d+ [+-]\d{4}$/gm;
  return Array.from(text.slice(0, headerEnd).matchAll(pattern), (match) => {
    const start = match.index + match[0].lastIndexOf("<") + 1;
    return { start, end: start + (match[1]?.length ?? 0) };
  });
}

export function publicSourceIssues(text: string, type: ObjectType = "blob") {
  const issues: string[] = [];
  // The owner permits public Git identities; this exception never applies to files or messages.
  const identities = identityEmailRanges(text, type);
  for (const match of text.matchAll(
    /[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)+[A-Z]{2,}/gi,
  )) {
    if (
      identities.some(
        ({ start, end }) =>
          match.index >= start && match.index + match[0].length <= end,
      )
    )
      continue;
    const domain = match[0].slice(match[0].indexOf("@") + 1).toLowerCase();
    if (
      !/(^|\.)example\.(com|org|net|invalid)$/.test(domain) &&
      !domain.endsWith(".example")
    )
      issues.push("non-example email address");
  }
  if (
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|AKIA[A-Z0-9]{16})\b|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(
      text,
    )
  )
    issues.push("credential-shaped value");
  const ids =
    text.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ) || [];
  if (ids.some((id) => id !== "00000000-0000-4000-8000-000000000001"))
    issues.push("deployment identifier");
  if (/\b[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/i.test(text))
    issues.push("concrete deployment hostname");
  return [...new Set(issues)];
}
