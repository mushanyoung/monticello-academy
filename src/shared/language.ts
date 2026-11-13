export const LANGUAGES = ["zh", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export function isLanguage(value: unknown): value is Language {
  return value === "zh" || value === "en";
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
