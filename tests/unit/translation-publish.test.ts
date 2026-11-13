import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it } from "vitest";
import { translationTemplate } from "../../src/shared/translation";
import { publishTranslation } from "../../src/worker/translation-data";
import type { TranslationJob } from "../../src/worker/translation-jobs";
import { fixturePlan } from "../fixtures/plan";

it("prevents an older translator from overwriting a newer bilingual publication", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const name of readdirSync("migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort())
      sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
    // Execute the production D1 SQL in SQLite; only the binding transport is adapted.
    class Statement {
      constructor(
        readonly sql: string,
        readonly values: SQLInputValue[] = [],
      ) {}
      bind(...values: SQLInputValue[]) {
        return new Statement(this.sql, values);
      }
      run() {
        return {
          meta: {
            changes: Number(
              sqlite.prepare(this.sql).run(...this.values).changes,
            ),
          },
        };
      }
    }
    const env = {
      DB: {
        prepare: (sql: string) => new Statement(sql),
        batch: async (statements: Statement[]) => {
          sqlite.exec("BEGIN");
          try {
            const result = statements.map((statement) => statement.run());
            sqlite.exec("COMMIT");
            return result;
          } catch (error) {
            sqlite.exec("ROLLBACK");
            throw error;
          }
        },
      },
    } as unknown as Env;
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
      created_at: "2026-11-13T00:01:00Z",
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
    expect(await publishTranslation(env, newer, template, segments)).toBe(
      "completed",
    );
    expect(
      await publishTranslation(
        env,
        job,
        template,
        segments.map((segment) => ({
          ...segment,
          zh: segment.zh.replace("新版：", "旧版："),
        })),
      ),
    ).toBe("superseded");
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
    expect(
      sqlite
        .prepare("SELECT status FROM translation_jobs WHERE id=?")
        .get(job.id)?.status,
    ).toBe("superseded");
  } finally {
    sqlite.close();
  }
});
