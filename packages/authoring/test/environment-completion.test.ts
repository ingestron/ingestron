// Completion for the environment selected: the settings of the method chosen
// there, and the values its standard fixes, resolved from the project's values.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");
const labels = (items: { label: string }[]) => items.map((item) => item.label).sort();

/** Completions where `|` is in the edited text of `path`, for the first environment. */
function at(path: string, edit: (text: string) => string) {
  const marked = edit(read(path));
  const text = marked.replace("|", "");
  const project = openProject(retail, new Map([[join(retail, path), text]]));
  return completionsAt(project, path, text, marked.indexOf("|"), project.environments[0]);
}

describe("values the standard fixes", () => {
  it("offers the fixed value first and marks the others as not allowed", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("except_columns: [op] }", "except_columns: [op], cluster_by: | }"),
    );
    expect(items.map((item) => [item.label, item.detail])).toEqual([
      ["auto", "fixed by the standard"],
      ["none", "not allowed: the standard fixes this to auto"],
    ]);
    expect(items[0]?.preselect).toBe(true);
  });
});

describe("the selected environment", () => {
  /** Retail with the orders table's store method and the fixed clustering set per environment. */
  function perEnvironment(marked: string) {
    const text = marked.replace("|", "");
    const project = openProject(
      retail,
      new Map([
        [
          join(retail, "project.yaml"),
          read("project.yaml")
            .replace("values:\n", "values:\n  store: streaming-table\n  cluster: auto\n")
            .replace(
              "  prod:\n    values:\n",
              "  prod:\n    values:\n      store: materialised-view\n      cluster: none\n",
            ),
        ],
        [
          join(retail, "standard.yaml"),
          read("standard.yaml").replace(
            "streaming-table: { cluster_by: auto }",
            'streaming-table: { cluster_by: "${values.cluster}" }',
          ),
        ],
        [join(retail, "flows/shop.yaml"), text],
      ]),
    );
    return (environment: string) =>
      completionsAt(project, "flows/shop.yaml", text, marked.indexOf("|"), environment);
  }

  it("offers the settings of the method chosen in that environment", () => {
    const flow = `${read("flows/shop.yaml").replace(/ {4}store:\n {6}with: \{[^\n]*\}\n/, "")}store:\n  uses: \${values.store}\n  with:\n    |`;
    const at = perEnvironment(flow);
    expect(labels(at("dev"))).toContain("sequence_by");
    expect(labels(at("prod"))).toContain("cluster_by");
    expect(labels(at("prod"))).not.toContain("sequence_by");
  });

  it("marks the value the standard fixes in that environment, resolved from the project's values", () => {
    const flow = read("flows/shop.yaml").replace(
      "except_columns: [op] }",
      "except_columns: [op], cluster_by: | }",
    );
    const at = perEnvironment(flow);
    expect(at("dev").map((item) => [item.label, item.detail])).toEqual([
      ["auto", "fixed by the standard"],
      ["none", "not allowed: the standard fixes this to auto"],
    ]);
    expect(at("prod")[0]).toMatchObject({ label: "none", detail: "fixed by the standard" });
  });
});
