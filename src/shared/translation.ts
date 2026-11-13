import { Parser } from "htmlparser2";
import { z } from "zod";
import type { Language } from "./language";

export const TRANSLATION_VERSION = "2";
export const translatedSegmentsSchema = z
  .object({
    segments: z
      .array(
        z
          .object({
            id: z.string().regex(/^s\d+$/),
            en: z.string().min(1).max(16000),
            zh: z.string().min(1).max(16000),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type TranslatedSegment = z.infer<
  typeof translatedSegmentsSchema
>["segments"][number];
export interface TranslationSegment {
  id: string;
  text: string;
  context: string;
}
interface TextRange {
  start: number;
  end: number;
  text: string;
  encoded: boolean;
  unquoted?: boolean;
}
interface Replacement extends TextRange {
  segmentId: string;
  prefix: string;
  suffix: string;
}
interface Field {
  path: string[];
  original: string;
  replacements: Replacement[];
}
export interface TranslationTemplate {
  source: unknown;
  segments: TranslationSegment[];
  fields: Field[];
}
const blockedTags = new Set([
  "style",
  "script",
  "title",
  "textarea",
  "noscript",
  "svg",
  "math",
]);

function htmlRanges(html: string) {
  const ranges: TextRange[] = [];
  const stack: string[] = [];
  let tag = "";
  const parser = new Parser({
    onopentagname(name) {
      tag = name;
    },
    onopentag(name) {
      stack.push(name);
    },
    onclosetag(name) {
      const index = stack.lastIndexOf(name);
      if (index >= 0) stack.splice(index);
    },
    onattribute(name, value, quote) {
      if (
        !["alt", "title"].includes(name) ||
        blockedTags.has(tag) ||
        stack.some((item) => blockedTags.has(item))
      )
        return;
      const raw = html.slice(parser.startIndex, parser.endIndex + 1);
      const prefix = raw.match(/^[^\s=]+\s*=\s*/)?.[0];
      if (!prefix) return;
      const offset = prefix.length + (quote ? 1 : 0);
      const content = quote
        ? raw.slice(offset, raw.indexOf(quote, offset))
        : raw.slice(offset).match(/^[^\s>]+/)?.[0] || "";
      ranges.push({
        start: parser.startIndex + offset,
        end: parser.startIndex + offset + content.length,
        text: value,
        encoded: true,
        unquoted: quote === null,
      });
    },
    ontext(text) {
      if (stack.some((item) => blockedTags.has(item))) return;
      const previous = ranges.at(-1);
      if (
        previous &&
        previous.end === parser.startIndex &&
        previous.unquoted === undefined
      ) {
        previous.end = parser.endIndex + 1;
        previous.text += text;
      } else
        ranges.push({
          start: parser.startIndex,
          end: parser.endIndex + 1,
          text,
          encoded: true,
        });
    },
  });
  parser.end(html);
  return ranges;
}
function plainRanges(value: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (let start = 0; start < value.length; ) {
    let end = Math.min(start + 3000, value.length);
    if (end < value.length) {
      const split = Math.max(
        value.lastIndexOf("\n", end),
        value.lastIndexOf(" ", end),
      );
      if (split > start + 1000) end = split;
    }
    ranges.push({ start, end, text: value.slice(start, end), encoded: false });
    start = end;
  }
  return ranges;
}
const proseKeys = new Set([
  "title",
  "theme",
  "overview",
  "area",
  "description",
  "note",
  "filename",
  "subject",
  "body_text",
  "html",
]);
const proseArrays = new Set([
  "objectives",
  "monthlyReminders",
  "reminders",
  "bring",
  "items",
]);
export function translationTemplate(source: unknown): TranslationTemplate {
  const fields: Field[] = [];
  const segments: TranslationSegment[] = [];
  const byText = new Map<string, string>();
  const walk = (value: unknown, path: string[]) => {
    if (typeof value === "string") {
      const key = path.at(-1) || "",
        parent = path.at(-2) || "";
      if (!proseKeys.has(key) && !proseArrays.has(parent)) return;
      const replacements: Replacement[] = [];
      for (const range of key === "html"
        ? htmlRanges(value)
        : plainRanges(value)) {
        const text = range.text.trim();
        if (!/\p{L}/u.test(text)) continue;
        if (text.length > 16000)
          throw new Error("A text segment exceeds the translation limit");
        let segmentId = byText.get(text);
        if (!segmentId) {
          segmentId = `s${segments.length}`;
          byText.set(text, segmentId);
          segments.push({ id: segmentId, text, context: path.join(".") });
        }
        replacements.push({
          ...range,
          segmentId,
          prefix: range.text.match(/^\s*/)?.[0] || "",
          suffix: range.text.match(/\s*$/)?.[0] || "",
        });
      }
      if (replacements.length)
        fields.push({ path, original: value, replacements });
    } else if (Array.isArray(value))
      value.forEach((child, index) => {
        walk(child, [...path, String(index)]);
      });
    else if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value))
        walk(child, [...path, key]);
  };
  walk(source, []);
  return { source, segments, fields };
}
export function translationBatches(segments: TranslationSegment[]) {
  const batches: TranslationSegment[][] = [];
  let batch: TranslationSegment[] = [];
  let length = 0;
  for (const segment of segments) {
    if (
      batch.length &&
      (length + segment.text.length > 24000 || batch.length >= 150)
    ) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(segment);
    length += segment.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
export function validateTranslations(
  expected: TranslationSegment[],
  actual: TranslatedSegment[],
) {
  const ids = new Set(expected.map((segment) => segment.id));
  if (
    actual.length !== expected.length ||
    new Set(actual.map((segment) => segment.id)).size !== ids.size ||
    actual.some((segment) => !ids.has(segment.id))
  )
    throw new Error(
      "The translation does not cover every source segment exactly once",
    );
  for (const segment of actual) {
    const source = expected.find((item) => item.id === segment.id);
    const protectedText =
      source?.text.match(
        /https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d+(?:[/:.-]\d+)*\b/gi,
      ) || [];
    for (const token of protectedText)
      if (!segment.en.includes(token) || !segment.zh.includes(token))
        throw new Error(
          "A translation changed a protected address, link or number",
        );
  }
}
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function renderTranslation(
  template: TranslationTemplate,
  translated: TranslatedSegment[],
  language: Language,
): unknown {
  validateTranslations(template.segments, translated);
  const target = structuredClone(template.source);
  const strings = new Map(
    translated.map((segment) => [segment.id, segment[language]]),
  );
  for (const field of template.fields) {
    let value = field.original;
    for (const range of [...field.replacements].sort(
      (a, b) => b.start - a.start,
    )) {
      const text = strings.get(range.segmentId);
      if (!text) throw new Error("Missing translated text");
      if (text === range.text.trim()) continue;
      const rendered = `${range.prefix}${text}${range.suffix}`;
      let replacement = range.encoded ? escapeHtml(rendered) : rendered;
      if (range.unquoted) replacement = `"${replacement}"`;
      value =
        value.slice(0, range.start) + replacement + value.slice(range.end);
    }
    let object: unknown = target;
    for (const key of field.path.slice(0, -1)) {
      if (!object || typeof object !== "object")
        throw new Error("Invalid translation path");
      object = Reflect.get(object, key);
    }
    const key = field.path.at(-1);
    if (!object || typeof object !== "object" || !key)
      throw new Error("Invalid translation field");
    Reflect.set(object, key, value);
  }
  return target;
}
