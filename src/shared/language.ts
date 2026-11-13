export const LANGUAGES = ["zh", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export type TranslationStatus = "ready" | "translating" | "unavailable";
export function isLanguage(value: unknown): value is Language {
  return value === "zh" || value === "en";
}
export function requestLanguage(request: Request): Language {
  const explicit = new URL(request.url).searchParams.get("lang");
  if (isLanguage(explicit)) return explicit;
  const preferences = (request.headers.get("Accept-Language") || "")
    .split(",")
    .map((value) => {
      const [language = "", ...parameters] = value.trim().split(";");
      const quality = Number(
        parameters
          .find((item) => item.trim().startsWith("q="))
          ?.trim()
          .slice(2) ?? 1,
      );
      return { language, quality };
    })
    .filter((value) => value.quality > 0 && value.quality <= 1)
    .sort((a, b) => b.quality - a.quality)
    .map((value) => value.language);
  return preferredLanguage(preferences);
}
export function preferredLanguage(
  preferences: readonly string[] = [],
  saved?: unknown,
): Language {
  if (isLanguage(saved)) return saved;
  for (const preference of preferences) {
    const language = preference.trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(language)) return language;
  }
  return "zh";
}
