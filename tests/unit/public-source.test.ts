import { describe, expect, it } from "vitest";
import { publicSourceIssues } from "../../scripts/public-source-rules";

// Reserved, non-routable domain; construct it so source scanning still checks the fixtures.
const identity = ["owner", "private.invalid"].join("@");
const commit = (body = "Update project", name = "Owner") =>
  [
    `tree ${"a".repeat(40)}`,
    `author ${name} <${identity}> 1794600000 -0800`,
    `committer ${name} <${identity}> 1794600000 -0800`,
    "",
    body,
  ].join("\n");

describe("public Git identity exception", () => {
  it("allows commit identity emails only when scanning a commit object", () => {
    expect(publicSourceIssues(commit(), "commit")).toEqual([]);
    expect(publicSourceIssues(commit(), "blob")).toContain(
      "non-example email address",
    );
  });
  it("still rejects the same email in a message, custom header, or malformed identity", () => {
    expect(publicSourceIssues(commit(identity), "commit")).toContain(
      "non-example email address",
    );
    expect(
      publicSourceIssues(
        commit(`author Owner <${identity}> 1794600000 -0800`),
        "commit",
      ),
    ).toContain("non-example email address");
    expect(
      publicSourceIssues(
        commit().replace("tree ", `contact ${identity}\ntree `),
        "commit",
      ),
    ).toContain("non-example email address");
    expect(
      publicSourceIssues(
        commit().replace("author Owner", "author-contact Owner"),
        "commit",
      ),
    ).toContain("non-example email address");
  });
  it("limits annotated tag exceptions to the tagger header", () => {
    const tag = [
      `object ${"a".repeat(40)}`,
      "type commit",
      "tag v1",
      `tagger Owner <${identity}> 1794600000 +0000`,
      "",
      "Release",
    ].join("\n");
    expect(publicSourceIssues(tag, "tag")).toEqual([]);
    expect(publicSourceIssues(`${tag}\n${identity}`, "tag")).toContain(
      "non-example email address",
    );
    expect(publicSourceIssues(tag, "commit")).toContain(
      "non-example email address",
    );
  });
  it("keeps credential and deployment checks active inside identity fields", () => {
    const token = ["sk", "proj", "x".repeat(32)].join("-");
    expect(publicSourceIssues(commit("Update", token), "commit")).toContain(
      "credential-shaped value",
    );
    expect(
      publicSourceIssues(
        commit().replaceAll(identity, `${token}@private.invalid`),
        "commit",
      ),
    ).toContain("credential-shaped value");
    expect(
      publicSourceIssues(commit("Update", crypto.randomUUID()), "commit"),
    ).toContain("deployment identifier");
    const hostname = [
      "example-worker",
      "example-account",
      "workers",
      "dev",
    ].join(".");
    expect(publicSourceIssues(commit("Update", hostname), "commit")).toContain(
      "concrete deployment hostname",
    );
  });
  it("accepts reserved source examples and detects non-example source addresses", () => {
    expect(
      publicSourceIssues(
        "teacher@school.example.com contributors@example.invalid",
      ),
    ).toEqual([]);
    expect(publicSourceIssues(`const address = '${identity}';`)).toContain(
      "non-example email address",
    );
  });
});
