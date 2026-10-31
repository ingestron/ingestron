// The description of the field at any place, also inside method settings
// wherever they are written.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";

const erp = join(import.meta.dirname, "../../cli/project-templates/private-sql-server");

/** Completions where `|` is in the edited text of `path`. */
function at(path: string, edit: (text: string) => string) {
  const marked = edit(readFileSync(join(erp, path), "utf8"));
  const text = marked.replace("|", "");
  const project = openProject(erp, new Map([[join(erp, path), text]]));
  return completionsAt(project, path, text, marked.indexOf("|"), project.environments[0]);
}

describe("values of method settings", () => {
  it("offers each allowed value with its meaning in the standard's settings", () => {
    const items = at("standard.yaml", (text) => text.replace("mode: incremental", "mode: |"));
    expect(items.map((item) => item.label)).toEqual(["full", "incremental"]);
    expect(items[1]?.documentation).toBe("Only rows changed in the window, by watermark_column.");
    expect(items[1]?.docs).toBe("/docs/reference/packs/adf#adf-copy-mode");
  });

  it("offers them in the platform's settings too", () => {
    const items = at("platform.yaml", (text) =>
      text.replace(
        "integration_runtime: shir-erp",
        "integration_runtime: shir-erp\n    encrypt: |",
      ),
    );
    expect(items.map((item) => item.label)).toEqual(["mandatory", "optional", "strict"]);
  });

  it("offers nested values, such as a window's frequency", () => {
    const items = at("standard.yaml", (text) =>
      text.replace("every: { frequency: Hour, interval: 1 }", "every:\n        frequency: |"),
    );
    expect(items.map((item) => item.label)).toEqual(["Minute", "Hour", "Month"]);
  });

  it("offers the platform's settings keys for a method, except those written", () => {
    const items = at("platform.yaml", (text) =>
      text.replace("integration_runtime: shir-erp", "integration_runtime: shir-erp\n    |"),
    );
    expect(items.map((item) => item.label)).toContain("mode");
    expect(items.map((item) => item.label)).not.toContain("landing");
  });
});

describe("settings help in a new, unfinished file", () => {
  it("offers a method's values before the file has ever been valid", () => {
    const minimal = join(import.meta.dirname, "../../cli/project-templates/minimal");
    const marked = [
      "apiVersion: ingestron.io/v1",
      "kind: Flow",
      "id: returns",
      "source: shop",
      "ingest:",
      "  with:",
      "    format: |",
      "tables:",
      "  returns: { object: returns, contract: shop.orders }",
      "",
    ].join("\n");
    const text = marked.replace("|", "");
    const project = openProject(minimal, new Map([[join(minimal, "flows/returns.yaml"), text]]));
    const labels = completionsAt(
      project,
      "flows/returns.yaml",
      text,
      marked.indexOf("|"),
      project.environments[0],
    ).map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["csv", "json", "parquet"]));
  });
});
