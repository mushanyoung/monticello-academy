import { CLASSES } from "../../src/shared/classes";
export function fixtureMail(
  key: string,
  recipient: string = CLASSES[0].email,
  date = "Fri, 13 Nov 2026 09:00:00 -0800",
) {
  return [
    "From: Monroe Teachers <teacher@school.example.com>",
    `To: ${recipient}`,
    `Subject: Autumn discoveries ${key}`,
    `Date: ${date}`,
    `Message-ID: <${key}@school.example.com>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="notebook"',
    "",
    "--notebook",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Explore colorful leaves. Bring rain boots. ${key}`,
    "--notebook",
    'Content-Type: text/plain; charset=utf-8; name="November checklist.txt"',
    'Content-Disposition: attachment; filename="November checklist.txt"',
    "",
    "Acorn scavenger hunt. Bring a reusable water bottle.",
    "--notebook--",
    "",
  ].join("\r\n");
}
