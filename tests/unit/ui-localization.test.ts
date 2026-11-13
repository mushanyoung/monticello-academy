import { readdirSync, readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import { messages } from "../../src/web/messages";

describe("bilingual UI contract", () => {
  it("keeps every translation nonempty and preserves interpolation variables", () => {
    for (const [english, chinese] of Object.entries(messages)) {
      expect(chinese.trim(), english).not.toBe("");
      expect(chinese.match(/\{\w+\}/g)?.sort() || [], english).toEqual(
        english.match(/\{\w+\}/g)?.sort() || [],
      );
    }
  });
  it("requires visible JSX text and accessible labels to use localization", () => {
    const violations: string[] = [];
    for (const filename of readdirSync("src/web").filter(
      (name) =>
        name.endsWith(".tsx") && !["art.tsx", "language.tsx"].includes(name),
    )) {
      const ast = parse(readFileSync(`src/web/${filename}`, "utf8"), {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
      const walk = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, unknown>;
        if (
          node.type === "JSXText" &&
          typeof node.value === "string" &&
          /[a-zA-Z\u4e00-\u9fff]/.test(node.value)
        )
          violations.push(`${filename}: ${node.value.trim()}`);
        if (node.type === "JSXAttribute") {
          const name = node.name as { name?: string } | undefined;
          const content = node.value as
            | { type?: string; value?: string }
            | undefined;
          if (
            name?.name &&
            ["title", "aria-label", "placeholder"].includes(name.name) &&
            content?.type === "StringLiteral"
          )
            violations.push(`${filename}: ${content.value}`);
        }
        for (const [key, child] of Object.entries(node)) {
          if (["loc", "extra", "comments"].includes(key)) continue;
          if (Array.isArray(child)) child.forEach(walk);
          else walk(child);
        }
      };
      walk(ast);
    }
    expect(violations).toEqual([]);
  });
});
