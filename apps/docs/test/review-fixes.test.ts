// Fixes from the whole-branch review: downloads, connectivity, search and the error reference.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadingCodeHelp } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { exampleFiles, exampleFolder } from "../lib/examples.js";
import { connectorEntries } from "../lib/reference.js";
import { extraStructure } from "../lib/search.js";

describe("example downloads", () => {
  it("hold only files committed to the repository", () => {
    const stray = join(exampleFolder("minimal"), "stray.local");
    writeFileSync(stray, "not committed");
    try {
      const files = exampleFiles("minimal");
      expect(files).toContain("project.yaml");
      expect(files).toContain("build/dev/databricks.yml");
      expect(files).not.toContain("stray.local");
    } finally {
      rmSync(stray);
    }
  });
});

describe("connector facts", () => {
  it("show the connectivity each method supports", () => {
    expect(connectorEntries("sqlserver").map((entry) => entry.connectivity)).toEqual([
      ["public", "workspace"],
      ["private", "workspace", "public"],
    ]);
  });
});

describe("search", () => {
  const text = (url: string) => JSON.stringify(extraStructure(url));

  it("finds every error code on the errors page", () => {
    expect(text("/docs/reference/errors")).toContain("CONTRACT_TABLE");
    expect(text("/docs/reference/errors")).toContain("UNKNOWN_INPUT");
  });

  it("finds method settings on the packs page", () => {
    expect(text("/docs/reference/packs/adf")).toContain("watermark_column");
  });

  it("indexes native connection fields in their access chapter", () => {
    expect(text("/docs/connectors/snowflake/adf-connection")).toContain("private_key");
    expect(text("/docs/connectors/rest/adf-connection")).toContain("auth_headers");
  });

  it("adds nothing to other pages", () => {
    expect(extraStructure("/docs")).toEqual({ headings: [], contents: [] });
  });
});

describe("loading errors", () => {
  it("explains every code the loader reports", () => {
    const declarations = readFileSync(
      join(
        process.cwd(),
        "../../packages/definitions/node_modules/@ingestron/config/dist/diagnostics.d.ts",
      ),
      "utf8",
    );
    const union = /export type DiagnosticCode = ([^;]+);/.exec(declarations)![1]!;
    const codes = [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]!);
    expect(codes.filter((code) => !(code in loadingCodeHelp))).toEqual([]);
  });
});
