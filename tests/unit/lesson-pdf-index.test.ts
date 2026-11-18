import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("backfills PDF indexes and classroom links from confirmed historical sources", () => {
  const db = new DatabaseSync(":memory:");
  const migration = "0006_lesson_pdf_index.sql";
  try {
    for (const name of readdirSync("migrations")
      .filter((name) => name.endsWith(".sql") && name < migration)
      .sort())
      db.exec(readFileSync(`migrations/${name}`, "utf8"));
    for (const id of ["original", "forward", "memo"]) {
      db.prepare(
        `INSERT INTO messages VALUES(?,?,?,'','','','','','','','','','')`,
      ).run(id, id, id);
      db.prepare(
        `INSERT INTO attachments VALUES(?,?, 'file.pdf','application/pdf',10,?,?,?)`,
      ).run(
        id,
        id,
        id === "memo" ? "different" : "lesson-pdf",
        id === "original" ? "dated activities" : "",
        id === "original" ? "extracted" : "filename-only",
      );
    }
    db.exec(`INSERT INTO message_classes VALUES('forward','guppy');
      INSERT INTO lesson_jobs(id,attachment_id,message_id,content_key,parser_version,workflow_id,status,created_at,updated_at)
      VALUES('job','original','original','lesson-pdf','1','workflow','published','','');
      INSERT INTO lesson_plans VALUES('sunshine:2040-01','sunshine','2040-01','original','published','{}','');
      INSERT INTO plan_revisions VALUES('old','sunshine:2040-01','{"sources":[{"messageId":"original","attachmentId":"original"}]}','');`);
    db.exec(readFileSync(`migrations/${migration}`, "utf8"));
    expect(db.prepare("SELECT * FROM lesson_pdf_index").all()).toEqual([
      {
        content_key: "lesson-pdf",
        class_id: "sunshine",
        search_text: "dated activities",
      },
    ]);
    expect(
      db
        .prepare("SELECT * FROM message_classes ORDER BY message_id,class_id")
        .all(),
    ).toEqual([
      { message_id: "forward", class_id: "guppy" },
      { message_id: "forward", class_id: "sunshine" },
      { message_id: "original", class_id: "sunshine" },
    ]);
  } finally {
    db.close();
  }
});
