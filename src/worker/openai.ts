import { HttpError } from "./errors";

export const LESSON_MODEL = "gpt-6.1-terra";

export async function checkLessonModel(apiKey: string, request = fetch) {
  if (!apiKey)
    throw new HttpError(503, "The lesson parser API key is not configured.");
  const response = await request(
    `https://api.openai.com/v1/models/${LESSON_MODEL}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(
      502,
      `Lesson model access check failed (provider HTTP ${response.status}).`,
    );
  }
  const model: unknown = await response.json();
  if (
    !model ||
    typeof model !== "object" ||
    !("id" in model) ||
    model.id !== LESSON_MODEL
  )
    throw new HttpError(
      502,
      "The provider did not return the configured lesson model.",
    );
  return { model: LESSON_MODEL, available: true };
}
