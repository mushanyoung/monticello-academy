import { convert } from "html-to-text";
import PostalMime, { type Email } from "postal-mime";
import { type ClassId, identifyClasses } from "../shared/classes";
import { type MailConfig, parseMailConfig } from "../shared/mail-config";
import { HttpError, MAX_EMAIL_BYTES } from "./errors";

const MAX_TEXT = 100_000;
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function plainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
        selector,
        options: { uppercase: false },
      })),
    ],
  }).slice(0, MAX_TEXT);
}
function addressHeaders(mail: Email): string {
  return mail.headers
    .filter((h) =>
      [
        "to",
        "cc",
        "bcc",
        "delivered-to",
        "x-original-to",
        "list-id",
        "list-post",
      ].includes(h.key.toLowerCase()),
    )
    .map((h) => h.value)
    .join("\n");
}
async function parseMessage(
  raw: Uint8Array,
  mail: Email,
  config: MailConfig,
  recipient: string,
  extraClasses: ClassId[],
) {
  const body = (mail.text || plainText(mail.html || "")).slice(0, MAX_TEXT);
  const forwardedRecipients = body
    .split("\n")
    .filter((line) => /^(?:[> ]*)(?:to|cc|收件人|抄送)\s*:/i.test(line))
    .join("\n");
  const classes = [
    ...new Set([
      ...extraClasses,
      ...identifyClasses(
        `${recipient}\n${addressHeaders(mail)}\n${forwardedRecipients}`,
        config.classEmails,
      ),
    ]),
  ];
  const attachments = await Promise.all(
    mail.attachments.map(async (a, index) => {
      const bytes =
        typeof a.content === "string"
          ? new TextEncoder().encode(a.content)
          : Uint8Array.from(new Uint8Array(a.content));
      const textType = /^(text\/|application\/(json|xml))/.test(a.mimeType);
      const decoded = textType
        ? new TextDecoder().decode(bytes.slice(0, MAX_TEXT))
        : "";
      const text = a.mimeType === "text/html" ? plainText(decoded) : decoded;
      return {
        index,
        filename: a.filename || `attachment-${index + 1}`,
        contentType: a.mimeType,
        bytes,
        hash: await sha256(bytes),
        text,
        status: textType
          ? bytes.length > MAX_TEXT
            ? "partial"
            : "indexed"
          : "filename-only",
      };
    }),
  );
  const sent =
    mail.date && Number.isFinite(Date.parse(mail.date))
      ? new Date(mail.date).toISOString()
      : null;
  const sender = mail.from?.address?.toLowerCase();
  if (!sender) throw new HttpError(422, "The email has no valid From address.");
  const subject = mail.subject || "(No subject)";
  const contentHash = await sha256(
    JSON.stringify([
      sender,
      subject,
      sent,
      (mail.text || mail.html || "").replace(/\s+/g, " ").trim(),
      attachments.map((a) => [a.filename, a.hash]).sort(),
    ]),
  );
  const messageKey = mail.messageId
    ? await sha256(`message-id:${sender}:${mail.messageId.trim()}`)
    : contentHash;
  return {
    mail,
    raw,
    body,
    classes,
    attachments,
    sent,
    sender,
    subject,
    contentHash,
    messageKey,
  };
}

type ParsedMail = Awaited<ReturnType<typeof parseMessage>>;

export async function parseMailBatch(
  raw: Uint8Array,
  config: MailConfig,
  recipient = "",
  extraClasses: ClassId[] = [],
): Promise<ParsedMail[]> {
  if (raw.byteLength > MAX_EMAIL_BYTES)
    throw new HttpError(413, "File exceeds the 20 MB import limit.");
  const messages: ParsedMail[] = [];
  async function visit(bytes: Uint8Array, envelopeTo: string, depth: number) {
    const mail = await PostalMime.parse(bytes, {
      attachmentEncoding: "arraybuffer",
      forceRfc822Attachments: true,
    });
    if (!mail.from?.address)
      throw new HttpError(422, "The email has no valid From address.");
    if (mail.attachments.length > 40)
      throw new HttpError(422, "An email may contain at most 40 attachments.");
    const nested = mail.attachments.filter(
      (attachment) => attachment.mimeType === "message/rfc822",
    );
    if (nested.length) {
      if (depth >= 3)
        throw new HttpError(422, "Forwarded emails may nest at most 3 levels.");
      for (const attachment of nested) {
        const content = attachment.content;
        const original =
          typeof content === "string"
            ? new TextEncoder().encode(content)
            : new Uint8Array(content);
        // Each original's own headers determine its classrooms, not the wrapper.
        await visit(original, "", depth + 1);
      }
    }
    // Retain a wrapper with other files so extra attachments are never discarded.
    if (!nested.length || nested.length < mail.attachments.length) {
      if (messages.length >= 20)
        throw new HttpError(
          422,
          "A batch may contain at most 20 emails. Send smaller batches.",
        );
      messages.push(
        await parseMessage(bytes, mail, config, envelopeTo, extraClasses),
      );
    }
  }
  await visit(raw, recipient, 0);
  return messages;
}

export async function ingestMail(
  env: Env,
  raw: Uint8Array,
  recipient = "",
  classes: ClassId[] = [],
) {
  // Validate the entire batch before writing any of its messages.
  const messages = await parseMailBatch(
    raw,
    parseMailConfig(env.MAIL_CONFIG),
    recipient,
    classes,
  );
  const results = [];
  for (const parsed of messages) results.push(await storeMail(env, parsed));
  return results;
}

async function storeMail(env: Env, parsed: ParsedMail) {
  const { mail, body, attachments, sender, subject, contentHash, messageKey } =
    parsed;
  const candidateId = await sha256(`mail:${messageKey}`);
  const rawKey = `raw/${await sha256(parsed.raw)}.eml`;
  // R2 writes complete before the atomic D1 batch. Content-addressed keys make retries safe.
  await env.MAIL_BUCKET.put(rawKey, parsed.raw, {
    httpMetadata: { contentType: "message/rfc822" },
  });
  for (const attachment of attachments) {
    await env.MAIL_BUCKET.put(
      `attachments/${attachment.hash}`,
      attachment.bytes,
      { httpMetadata: { contentType: attachment.contentType } },
    );
  }
  const received = new Date().toISOString();
  const recipients = [mail.to, mail.cc, mail.bcc]
    .flatMap((a) => a ?? [])
    .map((a) => a.address)
    .filter(Boolean)
    .join(", ");
  const headers = JSON.stringify(mail.headers).slice(0, 20_000);
  const search = [
    subject,
    sender,
    mail.from?.name,
    recipients,
    body,
    headers,
    ...attachments.flatMap((a) => [a.filename, a.text]),
  ]
    .join("\n")
    .toLowerCase()
    .slice(0, 200_000);
  // Resolve the winner inside each statement: concurrent deliveries cannot leave partial associations.
  const selector =
    "SELECT id FROM messages WHERE message_key = ? OR content_hash = ? LIMIT 1";
  const statements = [
    env.DB.prepare(
      `INSERT INTO messages(id,message_key,content_hash,subject,sender,sender_name,recipients,sent_at,received_at,body_text,headers,raw_key,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
    ).bind(
      candidateId,
      messageKey,
      contentHash,
      subject,
      sender,
      mail.from?.name || "",
      recipients,
      parsed.sent || received,
      received,
      body,
      headers,
      rawKey,
      search,
    ),
  ];
  for (const classId of parsed.classes) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO message_classes(message_id,class_id) SELECT id,? FROM (${selector})`,
      ).bind(classId, messageKey, contentHash),
    );
  }
  for (const attachment of attachments) {
    const id = await sha256(
      `${candidateId}:${attachment.hash}:${attachment.filename}`,
    );
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO attachments(id,message_id,filename,content_type,size,object_key,extracted_text,text_status) SELECT ?,id,?,?,?,?,?,? FROM (${selector})`,
      ).bind(
        id,
        attachment.filename,
        attachment.contentType,
        attachment.bytes.byteLength,
        `attachments/${attachment.hash}`,
        attachment.text,
        attachment.status,
        messageKey,
        contentHash,
      ),
    );
  }
  await env.DB.batch(statements);
  const result = await env.DB.prepare(selector)
    .bind(messageKey, contentHash)
    .first<{ id: string }>();
  if (!result) throw new Error("Message was not persisted");
  return { id: result.id, classIds: parsed.classes };
}
