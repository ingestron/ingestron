// Completion that knows the project: values, tables, ids, methods, fields and settings.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");

/** Completions where `|` is in the edited text of `path`. */
function at(path: string, edit: (text: string) => string) {
  const marked = edit(read(path));
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  const project = openProject(retail, new Map([[join(retail, path), text]]));
  return completionsAt(project, path, text, offset, project.environments[0]);
}
const labels = (items: { label: string }[]) => items.map((item) => item.label).sort();

describe("completion", () => {
  it("offers the project's values after ${values.", () => {
    expect(
      labels(
        at("connections/shop.yaml", (text) => text.replace("${values.storage}", "${values.|")),
      ),
    ).toEqual(["host", "storage"]);
  });

  it("offers the transform's inputs after {{ tables. in its code, never itself", () => {
    expect(
      labels(
        at("transforms/daily_sales.sql", (text) =>
          text.replace("{{ tables.orders }}", "{{ tables.|"),
        ),
      ),
    ).toEqual(["customers", "orders"]);
  });

  it("offers connection ids for a flow's source", () => {
    expect(
      labels(at("flows/shop.yaml", (text) => text.replace("source: shop", "source: |"))),
    ).toEqual(["shop"]);
  });

  it("offers contract ids for a table's contract", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("contract: shop.orders", "contract: |"),
    );
    expect(labels(items)).toContain("shop.customers");
  });

  it("offers the store methods for uses", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("    store:\n", "    store:\n      uses: |\n"),
    );
    expect(labels(items)).toEqual(["materialised-view", "streaming-table"]);
  });

  it("offers allowed values", () => {
    expect(
      labels(
        at("connections/shop.yaml", (text) =>
          text.replace("connectivity: public", "connectivity: |"),
        ),
      ),
    ).toEqual(["private", "public", "workspace"]);
  });

  it("offers only the table's fields not written yet", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("    object: orders\n", "    object: orders\n    |\n"),
    );
    expect(labels(items)).toEqual(["ingest"]);
  });

  it("leaves out settings already written in the same mapping", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace(
        "      with: { mode: upsert, sequence_by: updated_at, delete_when: \"op = 'D'\", except_columns: [op] }",
        "      with:\n        mode: upsert\n        |",
      ),
    );
    expect(labels(items)).not.toContain("mode");
    expect(labels(items)).toContain("sequence_by");
  });

  it("leaves out a contract's fields already written", () => {
    const items = at("contracts/orders.yaml", (text) =>
      text.replace("status: active\n", "status: active\n|\n"),
    );
    expect(labels(items)).not.toContain("status");
    expect(labels(items)).not.toContain("version");
    expect(labels(items)).toContain("description");
  });

  it("offers the settings of the method the table resolves to, with defaults", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("      with: { mode: upsert", "      with:\n        |\n      x: { mode: upsert"),
    );
    expect(labels(items)).toEqual(expect.arrayContaining(["mode", "sequence_by", "cluster_by"]));
    expect(items.find((item) => item.label === "cluster_by")?.detail).toBe("default: auto");
  });

  it("offers the names a naming pattern can use inside {{ }}", () => {
    const items = at("standard.yaml", (text) =>
      text.replace('"{{ environment }}_sales"', '"{{ | }}_sales"'),
    );
    expect(labels(items)).toEqual(["environment", "flow", "layer", "project", "source", "table"]);
    expect(items.find((item) => item.label === "layer")?.documentation).toMatch(/bronze/);
  });

  it("offers a field's examples as values", () => {
    const items = at("contracts/orders.yaml", (text) =>
      text.replace("status: active", "status: |"),
    );
    expect(labels(items)).toEqual(["active", "deprecated", "draft", "proposed", "retired"]);
  });

  it("adds the space after the colon when a value is accepted straight after it", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("    store:\n", "    store:\n      uses:|\n"),
    );
    expect(items.find((item) => item.label === "streaming-table")?.insertText).toBe(
      " streaming-table",
    );
    const spaced = at("flows/shop.yaml", (text) =>
      text.replace("    store:\n", "    store:\n      uses: |\n"),
    );
    expect(spaced.find((item) => item.label === "streaming-table")?.insertText).toBeUndefined();
  });

  it("offers the forms a reference takes after ${", () => {
    const items = at("connections/shop.yaml", (text) => text.replace("${values.storage}", "${|"));
    expect(labels(items)).toEqual([
      "environment.name",
      "envvar:",
      "file:",
      "project.id",
      "project.name",
      "secret:",
      "values.",
    ]);
  });

  it("offers only the project fields project.yaml defines", () => {
    const minimal = join(import.meta.dirname, "../../../samples/starters/minimal");
    const file = "connections/shop.yaml";
    const complete = (marked: string) => {
      const text = marked.replace("|", "");
      const project = openProject(minimal, new Map([[join(minimal, file), text]]));
      return labels(
        completionsAt(project, file, text, marked.indexOf("|"), project.environments[0]),
      );
    };
    expect(complete("path: ${|")).not.toContain("project.name");
    expect(complete("path: ${|")).toContain("project.id");
    expect(complete("path: ${project.|")).toEqual(["id"]);
    expect(complete("path: ${environment.|")).toEqual(["name"]);
  });
});

describe("references in project.yaml", () => {
  it("offers the forms a value may use there, but not values, which may not refer to values", () => {
    const project = openProject(retail, new Map());
    const text = "id: retail\nvalues:\n  account: sa_${";
    const labels = completionsAt(
      project,
      "project.yaml",
      text,
      text.length,
      project.environments[0],
    ).map((item) => item.label);
    expect(labels).toContain("environment.name");
    expect(labels).not.toContain("values.");
  });
});
