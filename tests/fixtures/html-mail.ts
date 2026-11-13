export const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=";
export function htmlMail(key: string) {
  return [
    "From: Teacher <teacher@school.example.com>",
    "To: parents-sunshine@school.example.com",
    `Subject: Colorful newsletter ${key}`,
    `Message-ID: <${key}@school.example.com>`,
    "Date: Fri, 13 Nov 2026 09:00:00 -0800",
    "MIME-Version: 1.0",
    'Content-Type: multipart/related; boundary="html-mail"',
    "",
    "--html-mail",
    "Content-Type: text/html; charset=utf-8",
    "",
    `<html><head><style>@import url('https://images.example.com/tracking.css'); .newsletter-title { color: rgb(112, 80, 160); font-size: 28px; } body { background: rgb(252, 232, 216); } </style></head><body style="font-family:Arial"><h1 class="newsletter-title">A colorful week</h1><table width="600" cellpadding="12"><tr><td style="background-color:rgb(238,231,245)"><b>Monday</b></td><td>Bring rain boots. ${key}</td></tr></table><img src="cid:art@school.example.com" alt="Classroom drawing" width="80"><img src="https://images.example.com/photo.png" alt="External photo" width="80" onerror="parent.document.body.dataset.emailInjected='yes'"><p><a href="https://example.com/school" target="_top">School website</a></p><script>parent.document.body.dataset.emailInjected='yes'</script><form><input name="unsafe"></form><iframe src="https://images.example.com/frame"></iframe></body></html>`,
    "--html-mail",
    "Content-Type: image/png",
    'Content-Disposition: inline; filename="art.png"',
    "Content-ID: <art@school.example.com>",
    "Content-Transfer-Encoding: base64",
    "",
    pixel,
    "--html-mail--",
    "",
  ].join("\r\n");
}
