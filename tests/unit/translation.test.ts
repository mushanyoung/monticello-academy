import { describe, expect, it } from "vitest";
import {
  renderTranslation,
  translationBatches,
  translationTemplate,
  validateTranslations,
} from "../../src/shared/translation";
import { fixturePlan } from "../fixtures/plan";

describe("style-preserving bilingual content", () => {
  it("changes only visible text and labels while preserving HTML, CSS, links and CID images", () => {
    const html =
      '<style>.notice{color:orange}</style><table width="600"><tr><td class="notice"><b>Hello &amp; friends</b> <a href="https://example.com/event">Read more</a><img src="cid:photo" alt="Class photo" title=Photo></td></tr></table><script>doNotTranslate()</script>';
    const template = translationTemplate({ subject: "Hello", html });
    expect(template.segments.map((s) => s.text)).not.toContain(
      ".notice{color:orange}",
    );
    expect(template.segments.map((s) => s.text)).not.toContain(
      "doNotTranslate()",
    );
    const translated = template.segments.map((s) => ({
      id: s.id,
      en: s.text,
      zh:
        (
          {
            Hello: "你好",
            "Hello & friends": "你好，小朋友们",
            "Read more": "阅读更多",
            "Class photo": "班级照片",
            Photo: "照片",
          } as Record<string, string>
        )[s.text] || s.text,
    }));
    expect(renderTranslation(template, translated, "en")).toEqual({
      subject: "Hello",
      html,
    });
    expect(renderTranslation(template, translated, "zh")).toEqual({
      subject: "你好",
      html: '<style>.notice{color:orange}</style><table width="600"><tr><td class="notice"><b>你好，小朋友们</b> <a href="https://example.com/event">阅读更多</a><img src="cid:photo" alt="班级照片" title="照片"></td></tr></table><script>doNotTranslate()</script>',
    });
  });
  it("escapes translated markup and rejects missing, duplicate and changed-number output", () => {
    const template = translationTemplate({ html: "<p>Bring 24 snacks</p>" });
    const segment = template.segments[0];
    if (!segment) throw new Error("Missing fixture segment");
    expect(() => validateTranslations(template.segments, [])).toThrow(
      "every source segment",
    );
    expect(() =>
      validateTranslations(template.segments, [
        { id: segment.id, en: segment.text, zh: "带 30 份点心" },
      ]),
    ).toThrow("protected");
    const translated = [
      {
        id: segment.id,
        en: segment.text,
        zh: '带 24 份点心 <img src=x onerror="alert(1)">',
      },
    ];
    expect(renderTranslation(template, translated, "zh")).toEqual({
      html: "<p>带 24 份点心 &lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
    });
    expect(() =>
      validateTranslations(template.segments, [...translated, ...translated]),
    ).toThrow("exactly once");
  });
  it("keeps plan identity, dates, source IDs and numbers unchanged in both languages", () => {
    const plan = fixturePlan("a".repeat(64));
    const template = translationTemplate(plan);
    expect(
      template.segments.some(
        (s) =>
          s.text === plan.sourceMessageId ||
          s.text === plan.month ||
          s.text === plan.days[0]?.date,
      ),
    ).toBe(false);
    const translated = template.segments.map((s) => ({
      id: s.id,
      en: s.text,
      zh: `中文：${s.text}`,
    }));
    expect(renderTranslation(template, translated, "en")).toEqual(plan);
    expect(renderTranslation(template, translated, "zh")).toMatchObject({
      classId: plan.classId,
      month: plan.month,
      sourceMessageId: plan.sourceMessageId,
      days: [{ date: plan.days[0]?.date, bring: ["中文：Rain boots"] }],
    });
  });
  it("splits long text into bounded batches without losing whitespace or content", () => {
    const body_text = "A long classroom note.\n".repeat(3000);
    const template = translationTemplate({ body_text });
    const batches = translationBatches(template.segments);
    expect(batches.flat()).toEqual(template.segments);
    expect(
      batches.every(
        (batch) =>
          batch.length <= 150 &&
          batch.reduce((sum, s) => sum + s.text.length, 0) <= 24000,
      ),
    ).toBe(true);
    expect(
      renderTranslation(
        template,
        template.segments.map((s) => ({ id: s.id, en: s.text, zh: s.text })),
        "en",
      ),
    ).toEqual({ body_text });
  });
});
