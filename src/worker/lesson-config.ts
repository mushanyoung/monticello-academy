import { z } from "zod";
export const lessonConfigSchema = z
  .object({
    enabled: z.boolean(),
    processFrom: z.iso.datetime(),
    notificationFrom: z.email(),
    notificationTo: z.email(),
    siteUrl: z.url().refine((value) => new URL(value).protocol === "https:"),
  })
  .strict();
export function lessonConfig(env: Pick<Env, "LESSON_CONFIG">) {
  return lessonConfigSchema.parse(JSON.parse(env.LESSON_CONFIG));
}
