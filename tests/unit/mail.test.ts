import { describe, expect, it } from "vitest";
import { CLASSES, identifyClasses } from "../../src/shared/classes";
import { readLimited } from "../../src/worker/errors";
import { parseMail, plainText } from "../../src/worker/mail";
import { fixtureMail } from "../fixtures/mail";

const bytes = (s: string) => new TextEncoder().encode(s);
describe("mail identity and recipients", () => {
  it("recognizes exact recipients and List-ID without matching spoofed suffixes", () => {
    expect(
      identifyClasses(`${CLASSES[0].email.toUpperCase()}, ${CLASSES[1].email}`),
    ).toEqual(["sunshine", "guppy"]);
    expect(identifyClasses(`<${CLASSES[2].email.replace("@", ".")}>`)).toEqual([
      "twos",
    ]);
    expect(identifyClasses(`${CLASSES[0].email}.evil.org`)).toEqual([]);
  });
  it("keeps identity across list deliveries and decodes attachments", async () => {
    const a = await parseMail(bytes(fixtureMail("same")));
    const b = await parseMail(bytes(fixtureMail("same", CLASSES[1].email)));
    expect(a.messageKey).toBe(b.messageKey);
    expect(a.contentHash).toBe(b.contentHash);
    expect(b.classes).toEqual(["guppy"]);
    expect(a.attachments[0]?.text).toContain("Acorn scavenger hunt");
  });
  it("uses content identity when Message-ID is missing but preserves distinct dates", async () => {
    const raw = fixtureMail("missing").replace(/Message-ID:[^\r]+\r\n/, "");
    const a = await parseMail(bytes(raw));
    const b = await parseMail(
      bytes(raw.replace(CLASSES[0].email, CLASSES[2].email)),
    );
    expect(a.messageKey).toBe(b.messageKey);
    const next = await parseMail(bytes(raw.replace("13 Nov", "14 Nov")));
    expect(a.messageKey).not.toBe(next.messageKey);
  });
  it("unwraps an original email attachment to preserve its identity", async () => {
    const original = fixtureMail("forwarded");
    const wrapper = [
      "From: 维护者 <parent@example.com>",
      "To: notebook@example.com",
      "Subject: Fwd: archive",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="forward"',
      "",
      "--forward",
      "Content-Type: message/rfc822",
      'Content-Disposition: attachment; filename="original.eml"',
      "",
      original,
      "--forward--",
    ].join("\r\n");
    expect((await parseMail(bytes(wrapper))).messageKey).toBe(
      (await parseMail(bytes(original))).messageKey,
    );
  });
  it("extracts HTML text without executing markup", () => {
    expect(
      plainText(
        "<h1>Hello &amp; welcome</h1><script>alert(1)</script><p>Boots</p>",
      ),
    ).toContain("Hello & welcome");
    expect(plainText("<script>alert(1)</script>")).not.toContain("alert");
  });
  it("rejects malformed messages and oversized streaming input", async () => {
    await expect(parseMail(bytes("not an email"))).rejects.toThrow("From");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes("12345"));
        controller.close();
      },
    });
    await expect(readLimited(stream, 4)).rejects.toThrow("limit");
  });
});
