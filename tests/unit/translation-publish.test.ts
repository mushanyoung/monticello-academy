import { expect, it } from "vitest";
import { translationTemplate } from "../../src/shared/translation";
import { publishTranslation } from "../../src/worker/translation-data";
import type { TranslationJob } from "../../src/worker/translation-jobs";
import { fixturePlan } from "../fixtures/plan";
import { d1Binding, migratedDatabase } from "./sqlite";

it("prevents an older translator from overwriting a newer bilingual publication", async () => {
  const sqlite = migratedDatabase();
  try {
    const env = { DB: d1Binding(sqlite) } as Env;
    const messageId = "a".repeat(64),
      now = "2026-11-13T00:00:00Z";
    sqlite
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        messageId,
        "key",
        "hash",
        "Synthetic source",
        "teacher@example.com",
        "Teacher",
        "parents@example.com",
        now,
        now,
        "Synthetic body",
        "{}",
        "original/source",
        "synthetic",
      );
    const plan = fixturePlan(messageId),
      document = JSON.stringify(plan),
      entity = `${plan.classId}:${plan.month}`;
    sqlite
      .prepare("INSERT INTO lesson_plans VALUES(?,?,?,?,?,?,?)")
      .run(
        entity,
        plan.classId,
        plan.month,
        messageId,
        "published",
        document,
        now,
      );
    const job: TranslationJob = {
      id: "b".repeat(64),
      kind: "plan",
      entity_id: entity,
      source_hash: "hash",
      source_document: document,
      translator_version: "1",
      workflow_id: "old",
      status: "running",
      attempt: 1,
      notify: 0,
      input_key: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    };
    const newer = {
      ...job,
      id: "c".repeat(64),
      translator_version: "2",
      workflow_id: "new",
      // Deployment overlap can enqueue both versions in the same millisecond.
      created_at: now,
    };
    for (const value of [job, newer])
      sqlite
        .prepare(
          "INSERT INTO translation_jobs(id,kind,entity_id,source_hash,source_document,translator_version,workflow_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'running',?,?)",
        )
        .run(
          value.id,
          value.kind,
          entity,
          value.source_hash,
          document,
          value.translator_version,
          value.workflow_id,
          value.created_at,
          now,
        );
    const template = translationTemplate(plan);
    const segments = template.segments.map((segment) => ({
      id: segment.id,
      en: segment.text,
      zh: `新版：${segment.text}`,
    }));
    const status = (id: string) =>
      sqlite.prepare("SELECT status FROM translation_jobs WHERE id=?").get(id)
        ?.status;
    sqlite.exec(`CREATE TRIGGER reject_second_language BEFORE INSERT ON plan_localizations
      WHEN NEW.language='zh' BEGIN SELECT RAISE(ABORT, 'test write failure'); END`);
    await expect(
      publishTranslation(env, newer, template, segments),
    ).rejects.toThrow("test write failure");
    expect(status(newer.id)).toBe("running");
    expect(sqlite.prepare("SELECT * FROM plan_localizations").all()).toEqual(
      [],
    );
    sqlite.exec("DROP TRIGGER reject_second_language");
    // A callback from another attempt has the same source and translator version.
    await publishTranslation(env, { ...newer, attempt: 0 }, template, segments);
    expect(sqlite.prepare("SELECT * FROM plan_localizations").all()).toEqual(
      [],
    );
    expect(status(newer.id)).toBe("running");
    await publishTranslation(env, newer, template, segments);
    expect(status(newer.id)).toBe("completed");
    await publishTranslation(
      env,
      job,
      template,
      segments.map((segment) => ({
        ...segment,
        zh: segment.zh.replace("新版：", "旧版："),
      })),
    );
    const rows = sqlite
      .prepare(
        "SELECT language,document FROM plan_localizations ORDER BY language",
      )
      .all();
    expect(rows).toHaveLength(2);
    expect(JSON.parse(String(rows[0]?.document)).title).toBe(plan.title);
    expect(JSON.parse(String(rows[1]?.document)).title).toBe(
      `新版：${plan.title}`,
    );
    expect(status(job.id)).toBe("superseded");
  } finally {
    sqlite.close();
  }
});
