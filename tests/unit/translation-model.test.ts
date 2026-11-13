import { describe, expect, it } from "vitest";
import { requestLanguage } from "../../src/shared/language";
import type { TranslationSegment } from "../../src/shared/translation";
import {
  readTranslatedSegments,
  translationRequestBody,
} from "../../src/worker/translation-model";

describe("translation model protocol", () => {
  const source: TranslationSegment[] = [
    {
      id: "s0",
      context: "body_text",
      text: "Bring 24 cups on 11/13 at 09:30. Visit https://school.example.com or write teacher@example.com.",
    },
  ];
  it("protects literal values while translating surrounding prose", () => {
    const body = translationRequestBody(source);
    expect(body.model).toBe("gpt-6.1-terra");
    const sent = JSON.parse(body.input[1]?.content || "").segments[0];
    expect(sent.text).not.toContain("teacher@example.com");
    const segments = [
      { id: sent.id, en: sent.text, zh: `请注意：${sent.text}` },
    ];
    const result = readTranslatedSegments(
      {
        id: "resp_fixture",
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify({ segments }) },
            ],
          },
        ],
      },
      source,
    );
    expect(result[0]?.en).toBe(source[0]?.text);
    expect(result[0]?.zh).toContain("11/13 at 09:30");
    expect(result[0]?.zh).toContain("teacher@example.com");
    const first = segments[0];
    if (!first) throw new Error("Missing fixture segment");
    first.zh = sent.text.replace("__MTC_s0_0__", "30");
    expect(() =>
      readTranslatedSegments(
        {
          id: "resp_fixture",
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify({ segments }) },
              ],
            },
          ],
        },
        source,
      ),
    ).toThrow("protected");
  });
  it("rejects missing segments and incomplete responses", () => {
    expect(() =>
      readTranslatedSegments(
        {
          id: "resp_fixture",
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"segments":[]}' }],
            },
          ],
        },
        source,
      ),
    ).toThrow("omitted");
    expect(() =>
      readTranslatedSegments(
        { id: "resp_fixture", status: "incomplete" },
        source,
      ),
    ).toThrow("did not complete");
  });
  it("honors explicit language, weighted browser headers and Chinese fallback", () => {
    expect(
      requestLanguage(
        new Request("https://example.com/api/mail?lang=zh", {
          headers: { "Accept-Language": "en-US" },
        }),
      ),
    ).toBe("zh");
    expect(
      requestLanguage(
        new Request("https://example.com/api/mail", {
          headers: { "Accept-Language": "zh;q=0.5, fr;q=1, en;q=0.9" },
        }),
      ),
    ).toBe("en");
    expect(
      requestLanguage(
        new Request("https://example.com/api/mail", {
          headers: { "Accept-Language": "en;q=0, fr;q=1" },
        }),
      ),
    ).toBe("zh");
    expect(requestLanguage(new Request("https://example.com/api/mail"))).toBe(
      "zh",
    );
  });
});
