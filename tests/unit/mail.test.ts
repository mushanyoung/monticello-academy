import { describe, expect, it } from "vitest";
import { identifyClasses } from "../../src/shared/classes";
import { readLimited } from "../../src/worker/errors";
import { parseMailBatch, plainText } from "../../src/worker/mail";
import { fixtureMail, forwardedMail, mailConfig } from "../fixtures/mail";

const parseMail = async (raw: Uint8Array) => {
  const messages = await parseMailBatch(raw, mailConfig);
  expect(messages).toHaveLength(1);
  const message = messages[0];
  if (!message) throw new Error("Expected one parsed email");
  return message;
};
const classesFrom = (text: string) =>
  identifyClasses(text, mailConfig.classEmails);
const bytes = (s: string) => new TextEncoder().encode(s);
describe("mail identity and recipients", () => {
  it("recognizes exact recipients and List-ID without matching spoofed suffixes", () => {
    expect(
      classesFrom(
        `${mailConfig.classEmails.sunshine.toUpperCase()}, ${mailConfig.classEmails.guppy}`,
      ),
    ).toEqual(["sunshine", "guppy"]);
    expect(
      classesFrom(`<${mailConfig.classEmails.twos.replace("@", ".")}>`),
    ).toEqual(["twos"]);
    expect(classesFrom(`${mailConfig.classEmails.sunshine}.evil.org`)).toEqual(
      [],
    );
  });
  it("keeps identity across list deliveries and decodes attachments", async () => {
    const a = await parseMail(bytes(fixtureMail("same")));
    const b = await parseMail(
      bytes(fixtureMail("same", mailConfig.classEmails.guppy)),
    );
    expect(a.messageKey).toBe(b.messageKey);
    expect(a.contentHash).toBe(b.contentHash);
    expect(b.classes).toEqual(["guppy"]);
    expect(a.attachments[0]?.text).toContain("Acorn scavenger hunt");
  });
  it("uses content identity when Message-ID is missing but preserves distinct dates", async () => {
    const raw = fixtureMail("missing").replace(/Message-ID:[^\r]+\r\n/, "");
    const a = await parseMail(bytes(raw));
    const b = await parseMail(
      bytes(
        raw.replace(
          mailConfig.classEmails.sunshine,
          mailConfig.classEmails.twos,
        ),
      ),
    );
    expect(a.messageKey).toBe(b.messageKey);
    const next = await parseMail(bytes(raw.replace("13 Nov", "14 Nov")));
    expect(a.messageKey).not.toBe(next.messageKey);
  });
  it("unwraps an original email attachment to preserve its identity", async () => {
    const original = fixtureMail("forwarded");
    const wrapper = [
      "From: Parent <parent@example.com>",
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
    expect((await parseMail(bytes(wrapper))).raw).toEqual(bytes(original));
  });
  it("splits base64 originals without mixing classroom headers or changing their bytes", async () => {
    const originals = [
      fixtureMail("batch-sunshine").replace(
        "Explore colorful leaves.",
        "观察秋天的树叶。",
      ),
      fixtureMail("batch-guppy", mailConfig.classEmails.guppy),
    ];
    const messages = await parseMailBatch(
      bytes(forwardedMail(originals, mailConfig.classEmails.twos)),
      mailConfig,
    );
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.classes)).toEqual([
      ["sunshine"],
      ["guppy"],
    ]);
    expect(messages.map((message) => message.raw)).toEqual(
      originals.map(bytes),
    );
    expect(messages[0]?.body).toContain("观察秋天的树叶。");
    for (const message of messages) {
      expect(message.sender).toBe("teacher@school.example.com");
      expect(message.sent).toBe("2026-11-13T17:00:00.000Z");
      expect(message.attachments[0]?.text).toContain("Acorn scavenger hunt");
    }
  });
  it("retains a wrapper when it carries extra files alongside an original", async () => {
    const original = fixtureMail("extra-files");
    const wrapper = forwardedMail([original]);
    const boundary = wrapper.match(/boundary="([^"]+)"/)?.[1];
    if (!boundary) throw new Error("Fixture boundary missing");
    const withExtraFile = wrapper.replace(
      `--${boundary}--`,
      [
        `--${boundary}`,
        "Content-Type: text/plain",
        'Content-Disposition: attachment; filename="parent-note.txt"',
        "",
        "Additional parent note",
        `--${boundary}--`,
      ].join("\r\n"),
    );
    const messages = await parseMailBatch(bytes(withExtraFile), mailConfig);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.raw).toEqual(bytes(original));
    expect(messages[1]?.raw).toEqual(bytes(withExtraFile));
    expect(
      messages[1]?.attachments.map((attachment) => attachment.filename),
    ).toContain("parent-note.txt");
  });
  it("bounds batches to 20 emails and rejects a malformed member", async () => {
    const originals = Array.from({ length: 20 }, (_, i) =>
      fixtureMail(`limit-${i}`),
    );
    expect(
      await parseMailBatch(bytes(forwardedMail(originals)), mailConfig),
    ).toHaveLength(20);
    await expect(
      parseMailBatch(
        bytes(forwardedMail([...originals, fixtureMail("overflow")])),
        mailConfig,
      ),
    ).rejects.toThrow("at most 20 emails");
    await expect(
      parseMailBatch(
        bytes(forwardedMail([fixtureMail("valid"), "not an email"])),
        mailConfig,
      ),
    ).rejects.toThrow("From");
  });
  it("supports three forwarding levels and rejects deeper nesting", async () => {
    const original = fixtureMail("nested-depth");
    let wrapper = original;
    for (let depth = 0; depth < 3; depth++) wrapper = forwardedMail([wrapper]);
    expect((await parseMail(bytes(wrapper))).raw).toEqual(bytes(original));
    await expect(
      parseMailBatch(bytes(forwardedMail([wrapper])), mailConfig),
    ).rejects.toThrow("at most 3 levels");
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
