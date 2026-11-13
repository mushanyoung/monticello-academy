import { describe, expect, it } from "vitest";
import { deploymentConfig, localDeployment } from "../../config/deployment";
import { mailConfigSchema } from "../../src/shared/mail-config";
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
