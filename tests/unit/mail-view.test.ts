import { describe, expect, it } from "vitest";
import {
  emailCsp,
  emailDocument,
  sanitizeEmail,
} from "../../src/worker/mail-view";

describe("original email rendering", () => {
  it("preserves typography, colors, layout tables, and stylesheet rules", () => {
    const { content } = sanitizeEmail(
      '<html><head><style>.title { color: purple; }</style></head><body style="font-family:Calibri"><table cellpadding="8"><tr><td colspan="2"><font size="5" color="orange"><b class="title" style="font-size:28pt">Newsletter</b></font></td></tr></table></body></html>',
    );
    expect(content).toContain(".title { color: purple; }");
    expect(content).toContain('style="font-family:Calibri"');
    expect(content).toContain('cellpadding="8"');
    expect(content).toContain('colspan="2"');
    expect(content).toContain("font-size:28pt");
  });
  it("removes executable markup, navigation metadata, forms, and event handlers", () => {
    const { content } = sanitizeEmail(
      '<meta http-equiv="refresh" content="0;url=https://example.com"><base href="https://example.com"><script>attack()</script><iframe src="https://example.com">hidden</iframe><object>hidden</object><svg onload="attack()"></svg><form action="https://example.com"><input name="secret"></form><img onerror="attack()" src="data:image/svg+xml,unsafe"><a href="javascript:attack()" onclick="attack()">Click</a>',
    );
    expect(content).not.toMatch(
      /<(script|iframe|object|svg|form|input|meta|base)\b|onerror|onclick|attack\(\)|javascript:|data:image\/svg/i,
    );
  });
  it("resolves encoded CID images and blocks missing or malformed references", () => {
    const map = new Map([
      ["photo@school.example.com", "/api/attachments/photo?preview=1"],
    ]);
    const { content } = sanitizeEmail(
      '<img src="cid:photo%40school.example.com"><img src="cid:missing"><img src="cid:%ZZ">',
      map,
    );
    expect(content).toContain('src="/api/attachments/photo?preview=1"');
    expect(content).not.toContain("cid:");
    expect(content.match(/src=/g)).toHaveLength(1);
  });
  it("loads remote images only on request and removes alternate image sources", () => {
    const source =
      '<img src="//images.example.com/photo.png" srcset="https://images.example.com/other.png 2x"><img src="/api/site"><a href="https://example.com" target="_top">Read</a>';
    const hidden = sanitizeEmail(source);
    expect(hidden.externalImages).toBe(1);
    expect(hidden.content).not.toMatch(/src=|srcset=/);
    expect(hidden.content).toContain(
      'target="_blank" rel="noopener noreferrer"',
    );
    const loaded = sanitizeEmail(source, new Map(), true);
    expect(loaded.content).toContain(
      'src="https://images.example.com/photo.png"',
    );
    expect(loaded.content).not.toContain("srcset");
  });
  it("escapes plain text and confines both viewing modes with script-free CSP", () => {
    const html = emailDocument(
      "",
      "<script>literal text</script> & notes",
      new Map(),
      false,
    );
    expect(html).toContain(
      "&lt;script&gt;literal text&lt;/script&gt; &amp; notes",
    );
    expect(html).toContain('data-has-html="false"');
    expect(emailCsp(false)).toContain("img-src 'self' data:;");
    for (const images of [false, true]) {
      expect(emailCsp(images)).toContain("script-src 'none'");
      expect(emailCsp(images)).toContain("sandbox allow-same-origin");
      expect(emailCsp(images)).not.toContain("allow-scripts");
    }
  });
});
