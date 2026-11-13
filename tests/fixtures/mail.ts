import { Buffer } from "node:buffer";
import example from "../../config/mail.example.json" with { type: "json" };
import { parseMailConfig } from "../../src/shared/mail-config";
export const mailConfig = parseMailConfig(JSON.stringify(example));
export function fixtureMail(
  key: string,
  recipient: string = mailConfig.classEmails.sunshine,
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

export function forwardedMail(
  originals: string[],
  recipient = mailConfig.inboundAddress,
  encoding: "base64" | "7bit" = "base64",
) {
  const boundary = `forward-${crypto.randomUUID()}`;
  return [
    "From: Parent <parent@example.com>",
    `To: ${recipient}`,
    "Subject: History import",
    `Message-ID: <${boundary}@example.com>`,
    "Date: Mon, 16 Nov 2026 09:00:00 -0800",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Please archive these original emails.",
    ...originals.flatMap((original, index) => [
      `--${boundary}`,
      "Content-Type: message/rfc822",
      `Content-Disposition: attachment; filename="original-${index + 1}.eml"`,
      `Content-Transfer-Encoding: ${encoding}`,
      "",
      encoding === "base64"
        ? Buffer.from(original, "utf8")
            .toString("base64")
            .replace(/.{76}/g, "$&\r\n")
        : original,
    ]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
