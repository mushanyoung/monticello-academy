import { describe, expect, it } from "vitest";
import { preferredLanguage } from "../../src/shared/language";

describe("client language preferences", () => {
  it("uses a saved choice before client preferences", () => {
    expect(preferredLanguage(["en-US"], "zh")).toBe("zh");
    expect(preferredLanguage(["zh-CN"], "en")).toBe("en");
    expect(preferredLanguage(["en-US"], "invalid")).toBe("en");
  });
  it("matches supported client preferences in order", () => {
    expect(preferredLanguage(["zh-TW", "en-US"])).toBe("zh");
    expect(preferredLanguage(["fr-FR", "en-GB", "zh"])).toBe("en");
    expect(preferredLanguage(["ZH_cn"])).toBe("zh");
  });
  it("falls back to Chinese when no supported preference is available", () => {
    expect(preferredLanguage()).toBe("zh");
    expect(preferredLanguage(["fr-FR"])).toBe("zh");
  });
});
