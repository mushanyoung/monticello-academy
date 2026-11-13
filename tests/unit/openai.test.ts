import { describe, expect, it, vi } from "vitest";
import {
  checkLessonModel,
  LESSON_MODEL,
  lessonRequest,
  lessonRequestBody,
  readExtraction,
} from "../../src/worker/openai";
import { fixtureExtraction } from "../fixtures/extraction";

describe("lesson model readiness", () => {
  it("checks the configured model using the secret only with OpenAI", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: LESSON_MODEL }));
    await expect(
      checkLessonModel("test-provider-key", request),
    ).resolves.toEqual({ model: LESSON_MODEL, available: true });
    expect(request).toHaveBeenCalledWith(
      `https://api.openai.com/v1/models/${LESSON_MODEL}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer test-provider-key" },
      }),
    );
  });
  it("does not make provider requests without a configured key", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(checkLessonModel("", request)).rejects.toMatchObject({
      status: 503,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("does not disclose provider error bodies or report an unavailable model as ready", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "private provider details" } },
          { status: 403 },
        ),
      );
    await expect(
      checkLessonModel("test-provider-key", request),
    ).rejects.toMatchObject({
      status: 502,
      message: "Lesson model access check failed (provider HTTP 403).",
    });
  });
  it("rejects an unexpected model response", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "unexpected-model" }));
    await expect(
      checkLessonModel("test-provider-key", request),
    ).rejects.toMatchObject({ status: 502 });
  });
});
describe("PDF lesson parsing protocol", () => {
  it("sends the PDF with strict output, vision detail and temporary background retention", () => {
    const body = lessonRequestBody(
      "synthetic.pdf",
      Uint8Array.from(new TextEncoder().encode("%PDF fixture")).buffer,
    );
    expect(body).toMatchObject({
      model: LESSON_MODEL,
      background: true,
      store: false,
      text: { format: { strict: true, type: "json_schema" } },
    });
    expect(body.input[1]?.content).toEqual([
      {
        type: "input_file",
        filename: "synthetic.pdf",
        file_data: `data:application/pdf;base64,${btoa("%PDF fixture")}`,
        detail: "high",
      },
    ]);
  });
  it("rejects incomplete, malformed and refused output instead of publishing partial lessons", () => {
    expect(() => readExtraction({ id: "x", status: "incomplete" })).toThrow(
      "incomplete",
    );
    expect(() =>
      readExtraction({
        id: "x",
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }),
    ).toThrow("valid lesson");
    expect(() =>
      readExtraction({
        id: "x",
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"isLessonPlan":true}' }],
          },
        ],
      }),
    ).toThrow("valid lesson");
    expect(
      readExtraction({
        id: "x",
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(fixtureExtraction()),
              },
            ],
          },
        ],
      }),
    ).toEqual(fixtureExtraction());
  });
  it("sanitizes provider failures and rejects invalid response envelopes", async () => {
    const env = {
      OPENAI_API_KEY: "fixture",
      LESSON_OPENAI_BASE: "https://api.openai.com/v1" as const,
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ secret: "private" }, { status: 429 }),
      )
      .mockResolvedValueOnce(Response.json({ status: "completed" }));
    await expect(
      lessonRequest(env, "/responses", {}, request),
    ).rejects.toMatchObject({
      code: "provider_http_429",
      message: "Lesson provider returned HTTP 429.",
    });
    await expect(
      lessonRequest(env, "/responses", {}, request),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
