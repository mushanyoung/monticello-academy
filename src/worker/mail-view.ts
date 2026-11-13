import PostalMime from "postal-mime";
import sanitizeHtml from "sanitize-html";
import type { Language } from "../shared/language";
import { HttpError, MAX_EMAIL_BYTES } from "./errors";
import { sha256 } from "./mail";

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
export const EMAIL_SANDBOX =
  "allow-same-origin allow-popups allow-popups-to-escape-sandbox";

function contentId(value: string) {
  try {
    return decodeURIComponent(value).trim().replace(/^<|>$/g, "");
  } catch {
    return "";
  }
}
function webUrl(value: string) {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function sanitizeEmail(
  html: string,
  inlineImages: ReadonlyMap<string, string> = new Map(),
  loadImages = false,
  language: Language = "en",
) {
  let externalImages = 0;
  const content = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "style",
      "font",
      "center",
    ],
    allowedAttributes: {
      "*": [
        "style",
        "class",
        "id",
        "dir",
        // The translated document declares its language; source spans must inherit it.
        "title",
        "align",
        "valign",
        "bgcolor",
        "width",
        "height",
      ],
      a: ["href", "target", "rel", "name"],
      img: ["src", "alt", "border", "referrerpolicy"],
      table: ["cellpadding", "cellspacing", "border", "role"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span"],
      font: ["face", "color", "size"],
      ol: ["start", "type"],
      li: ["value"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { img: ["https", "http", "data"] },
    allowProtocolRelative: false,
    // Email CSS is confined to a script-free, CSP-sandboxed document, never the app DOM.
    allowVulnerableTags: true,
    nonTextTags: [
      "script",
      "textarea",
      "option",
      "xmp",
      "noscript",
      "title",
      "iframe",
      "object",
      "svg",
      "math",
    ],
    transformTags: {
      html: "div",
      head: "div",
      body: "div",
      a: (tagName, attribs) => {
        const href = attribs.href?.trim() || "";
        const safe = webUrl(href) || (/^(mailto:|#)/i.test(href) ? href : "");
        return {
          tagName,
          attribs: {
            ...attribs,
            href: safe,
            target: "_blank",
            rel: "noopener noreferrer",
          },
        };
      },
      img: (tagName, attribs) => {
        const src = attribs.src?.trim() || "";
        let safe = "";
        if (/^cid:/i.test(src))
          safe = inlineImages.get(contentId(src.slice(4))) || "";
        else if (
          /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)
        )
          safe = src;
        else {
          const remote = webUrl(src);
          if (remote) {
            externalImages++;
            if (loadImages) safe = remote;
          }
        }
        const cleaned: Record<string, string> = {
          ...attribs,
          referrerpolicy: "no-referrer",
        };
        delete cleaned.src;
        if (safe) cleaned.src = safe;
        else
          cleaned.alt =
            attribs.alt ||
            (language === "zh" ? "图片未加载" : "Image not loaded");
        return { tagName, attribs: cleaned };
      },
    },
  });
  return { content, externalImages };
}

export function emailCsp(loadImages: boolean) {
  return `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:${loadImages ? " https: http:" : ""}; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox ${EMAIL_SANDBOX}`;
}
export function emailDocument(
  html: string,
  text: string,
  inlineImages: ReadonlyMap<string, string>,
  loadImages: boolean,
  language: Language = "en",
) {
  const hasHtml = Boolean(html.trim());
  const result = sanitizeEmail(
    hasHtml
      ? html
      : `<pre>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>`,
    inlineImages,
    loadImages,
    language,
  );
  return `<!doctype html><html lang="${language === "zh" ? "zh-CN" : "en"}" data-email-ready="true" data-has-html="${hasHtml}" data-external-images="${result.externalImages}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${language === "zh" ? "邮件正文" : "Email content"}</title><style>
html { color-scheme: light; }
body { margin: 0; padding: 8px; background: white; color: #222; font: 16px/1.5 Arial, sans-serif; overflow-wrap: anywhere; }
img { max-width: 100% !important; height: auto !important; }
table { max-width: 100% !important; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
</style></head><body>${result.content}</body></html>`;
}

export async function mailView(
  env: Env,
  id: string,
  loadImages: boolean,
  language: Language = "en",
) {
  const row = await env.DB.prepare("SELECT raw_key FROM messages WHERE id=?")
    .bind(id)
    .first<{ raw_key: string }>();
  if (!row) throw new HttpError(404, "Email not found.");
  const object = await env.MAIL_BUCKET.get(row.raw_key);
  if (!object) throw new HttpError(404, "The original email is unavailable.");
  if (object.size > MAX_EMAIL_BYTES)
    throw new HttpError(413, "The original email is too large to preview.");
  const mail = await PostalMime.parse(await object.arrayBuffer(), {
    attachmentEncoding: "arraybuffer",
    forceRfc822Attachments: true,
  });
  const rows = await env.DB.prepare(
    "SELECT id,object_key FROM attachments WHERE message_id=?",
  )
    .bind(id)
    .all<{ id: string; object_key: string }>();
  const inlineImages = new Map<string, string>();
  for (const attachment of mail.attachments) {
    if (!attachment.contentId || !IMAGE_TYPES.has(attachment.mimeType))
      continue;
    const bytes =
      typeof attachment.content === "string"
        ? new TextEncoder().encode(attachment.content)
        : new Uint8Array(attachment.content);
    const key = `attachments/${await sha256(bytes)}`;
    const stored = rows.results.find((item) => item.object_key === key);
    if (stored)
      inlineImages.set(
        contentId(attachment.contentId),
        `/api/attachments/${stored.id}?preview=1`,
      );
  }
  const localized = await env.DB.prepare(
    "SELECT html_key,body_text FROM mail_localizations WHERE message_id=? AND language=? AND source_document=?",
  )
    .bind(id, language, row.raw_key)
    .first<{ html_key: string; body_text: string }>();
  let html = mail.html || "",
    text = mail.text || "";
  if (localized) {
    const translated = await env.MAIL_BUCKET.get(localized.html_key);
    if (!translated)
      throw new HttpError(
        503,
        "The translated email preview is temporarily unavailable.",
      );
    html = await translated.text();
    text = localized.body_text;
  }
  return new Response(
    emailDocument(html, text, inlineImages, loadImages, language),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": emailCsp(loadImages),
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
