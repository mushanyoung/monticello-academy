import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export function migratedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  return sqlite;
}

// Run the production statements against migrated SQLite; adapt only the D1 transport.
export function d1Binding(sqlite: DatabaseSync): D1Database {
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
          changes: Number(sqlite.prepare(this.sql).run(...this.values).changes),
        },
      };
    }
    first() {
      return sqlite.prepare(this.sql).get(...this.values) ?? null;
    }
    all() {
      return { results: sqlite.prepare(this.sql).all(...this.values) };
    }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}
