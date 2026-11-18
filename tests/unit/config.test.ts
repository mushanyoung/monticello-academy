import { describe, expect, it } from "vitest";
import { deploymentConfig, localDeployment } from "../../config/deployment";
import {
  isAllowedEnvelopeSender,
  mailConfigSchema,
} from "../../src/shared/mail-config";
import { mailConfig } from "../fixtures/mail";

describe("private deployment configuration", () => {
  it("uses template resources for tests and development even with a production cache", () => {
    expect(deploymentConfig("test")).toEqual(localDeployment);
    expect(deploymentConfig("development")).toEqual(localDeployment);
    expect(localDeployment.emailRoutingAddresses).toEqual([]);
  });
  it("rejects incomplete routing and invalid mailbox configuration", () => {
    expect(mailConfigSchema.safeParse(mailConfig).success).toBe(true);
    expect(
      mailConfigSchema.safeParse({
        ...mailConfig,
        inboundAddress: "not-an-address",
      }).success,
    ).toBe(false);
    expect(
      mailConfigSchema.safeParse({
        ...mailConfig,
        classEmails: { sunshine: "sun@example.com" },
      }).success,
    ).toBe(false);
  });
});

describe("Gmail filter envelope senders", () => {
  it("uses the consumer Gmail domains by default for existing configurations", () => {
    const config = mailConfigSchema.parse({
      ...mailConfig,
      gmailForwardingDomains: undefined,
    });
    expect(config.gmailForwardingDomains).toEqual([
      "gmail.com",
      "googlemail.com",
    ]);
    expect(isAllowedEnvelopeSender("parent@example.com", config)).toBe(true);
    expect(
      isAllowedEnvelopeSender(
        "parent+caf_=notebook=example.com@example.com",
        config,
      ),
    ).toBe(false);
  });

  const config = {
    ...mailConfig,
    inboundAddress: "Archive+School@Mail.Example.org",
    allowedForwarders: ["Parent@Example.com", "parent@example.net"],
    gmailForwardingDomains: ["example.com", "workspace.example.org"],
  };
  it("matches the full mailbox, host and encoded archive address case-insensitively", () => {
    expect(
      isAllowedEnvelopeSender(
        "PARENT+CAF_=ARCHIVE+SCHOOL=MAIL.EXAMPLE.ORG@EXAMPLE.COM",
        config,
      ),
    ).toBe(true);
  });
  it.each([
    "other+caf_=archive+school=mail.example.org@example.com",
    "parent+caf_=other=mail.example.org@example.com",
    "parent+caf_=archive+school=other.example.org@example.com",
    "parent+caf_=archive+school=mail.example.org@example.net",
    "parent+caf_=archive+school=mail.example.org@workspace.example.org",
    "parent+news@example.com",
    "parent+extra+caf_=archive+school=mail.example.org@example.com",
    "parent+caf_=archive+school=mail.example.org.extra@example.com",
  ])("rejects an unapproved envelope %s", (from) => {
    expect(isAllowedEnvelopeSender(from, config)).toBe(false);
  });
});
