import { z } from "zod";
export const mailConfigSchema = z
  .object({
    inboundAddress: z.email(),
    allowedForwarders: z.array(z.email()),
    allowedSenderDomains: z.array(z.string().regex(/^[a-z0-9.-]+$/)),
    classEmails: z
      .object({ sunshine: z.email(), guppy: z.email(), twos: z.email() })
      .strict(),
  })
  .strict();
export type MailConfig = z.infer<typeof mailConfigSchema>;
export function parseMailConfig(value: string): MailConfig {
  return mailConfigSchema.parse(JSON.parse(value));
}
