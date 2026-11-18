import { z } from "zod";

const mailDomain = z.string().regex(/^[a-z0-9.-]+$/);
export const mailConfigSchema = z
  .object({
    inboundAddress: z.email(),
    allowedForwarders: z.array(z.email()),
    allowedSenderDomains: z.array(mailDomain),
    gmailForwardingDomains: z
      .array(mailDomain)
      .default(["gmail.com", "googlemail.com"]),
    classEmails: z
      .object({ sunshine: z.email(), guppy: z.email(), twos: z.email() })
      .strict(),
  })
  .strict();
export type MailConfig = z.infer<typeof mailConfigSchema>;
export function parseMailConfig(value: string): MailConfig {
  return mailConfigSchema.parse(JSON.parse(value));
}

export function isAllowedEnvelopeSender(
  from: string,
  config: MailConfig,
): boolean {
  const sender = from.toLowerCase();
  const at = sender.lastIndexOf("@");
  if (at < 1) return false;
  const domain = sender.slice(at + 1);
  if (config.allowedSenderDomains.includes(domain)) return true;

  const usesGmailForwarding = config.gmailForwardingDomains.includes(domain);
  const encodedDestination = config.inboundAddress
    .toLowerCase()
    .replace("@", "=");
  return config.allowedForwarders.some((address) => {
    const forwarder = address.toLowerCase();
    if (sender === forwarder) return true;
    const [mailbox, host] = forwarder.split("@");
    return (
      usesGmailForwarding &&
      sender === `${mailbox}+caf_=${encodedDestination}@${host}`
    );
  });
}
