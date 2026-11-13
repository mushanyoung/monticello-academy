export function fixtureLessonMail(key: string, filename: string) {
  return [
    "From: Teacher <teacher@school.example.com>",
    "To: archive@example.com",
    `Subject: Lesson plans ${key}`,
    `Message-ID: <${key}@school.example.com>`,
    "Date: Mon, 01 Nov 2027 09:00:00 -0700",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="lesson"',
    "",
    "--lesson",
    "Content-Type: text/plain",
    "",
    "Classroom lesson plan attached.",
    "--lesson",
    "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(
      `%PDF-1.7\n% Synthetic transport fixture ${key}\n%%EOF`,
    ).toString("base64"),
    "--lesson--",
    "",
  ].join("\r\n");
}
