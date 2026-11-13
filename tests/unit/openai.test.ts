import { describe, expect, it, vi } from "vitest";
import { checkLessonModel, LESSON_MODEL } from "../../src/worker/openai";

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
