import { describe, expect, it } from "vitest";
import { planSchema, validDate } from "../../src/shared/plans";
import { TRANSLATION_VERSION } from "../../src/shared/translation";
import {
  highlights,
  listPlans,
  savePlan,
  selectHighlight,
} from "../../src/worker/plans";
import { listMail } from "../../src/worker/queries";
import { fixturePlan } from "../fixtures/plan";
import { d1Binding, migratedDatabase } from "./sqlite";

describe("lesson plan rules", () => {
  const plan = fixturePlan("a".repeat(64));
  it("validates real dates, month membership and unique daily plans", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(planSchema.safeParse(plan).success).toBe(true);
    expect(planSchema.safeParse({ ...plan, month: "2040-12" }).success).toBe(
      false,
    );
    expect(
      planSchema.safeParse({ ...plan, days: [...plan.days, ...plan.days] })
        .success,
    ).toBe(false);
  });
  it("distinguishes absent plans and dates and rejects approval states", () => {
    expect(selectHighlight("sunshine", "2040-11-13").status).toBe(
      "awaiting-plan",
    );
    expect(planSchema.safeParse({ ...plan, status: "draft" }).success).toBe(
      false,
    );
    expect(selectHighlight("sunshine", "2040-11-14", plan).status).toBe(
      "no-day",
    );
    expect(selectHighlight("sunshine", "2040-11-13", plan).day?.bring).toEqual([
      "Rain boots",
    ]);
  });
  it("reports untranslated Chinese source content accurately in both languages", async () => {
    const sqlite = migratedDatabase();
    try {
      const db = d1Binding(sqlite);
      sqlite
        .prepare(
          "INSERT INTO messages VALUES(?,'k','h','本月通知','','','','','','','','raw','')",
        )
        .run(plan.sourceMessageId);
      sqlite
        .prepare("INSERT INTO message_classes VALUES(?,'sunshine')")
        .run(plan.sourceMessageId);
      const { id } = await savePlan(db, { ...plan, title: "本月课程" });
      const document = sqlite
        .prepare("SELECT document FROM lesson_plans WHERE id=?")
        .get(id)?.document;
      if (typeof document !== "string")
        throw new Error("Missing plan document");
      for (const [version, expected] of [
        ["0", "translating"],
        [TRANSLATION_VERSION, "unavailable"],
      ] as const) {
        for (const [kind, entity, source] of [
          ["plan", id, document],
          ["mail", plan.sourceMessageId, "raw"],
        ] as const)
          sqlite
            .prepare(`INSERT INTO translation_jobs(id,kind,entity_id,source_hash,source_document,translator_version,workflow_id,status,created_at,updated_at)
            VALUES(?,?,?,'hash',?,?,'workflow','failed','','')`)
            .run(`${kind}-${version}`, kind, entity, source, version);
        for (const lang of ["en", "zh"]) {
          const url = new URL(
            `https://example.com/?lang=${lang}&class=sunshine&date=2040-11-13`,
          );
          expect((await listMail(db, url)).items[0]).toMatchObject({
            subject: "本月通知",
            translationStatus: expected,
          });
          expect((await listPlans(db, url)).items[0]).toMatchObject({
            title: "本月课程",
            translationStatus: expected,
          });
          expect(
            (await highlights(db, url)).classes[0]?.translationStatus,
          ).toBe(expected);
        }
      }
    } finally {
      sqlite.close();
    }
  });
});
