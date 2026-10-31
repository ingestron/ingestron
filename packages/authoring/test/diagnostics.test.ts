// Problems as the CLI finds them, at their file and line, following unsaved edits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { problems } from "../src/diagnostics.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");
const minimal = join(import.meta.dirname, "../../../samples/starters/minimal");
const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");

function edited(folder: string, path: string, change: (text: string) => string) {
  return openProject(folder, new Map([[join(folder, path), change(read(folder, path))]]));
}

describe("problems", () => {
  it("has none for a correct project", () => {
    expect(problems(openProject(retail, new Map()), "dev")).toEqual([]);
  });

  it("shows a broken link where it is written", () => {
    const project = edited(retail, "flows/shop.yaml", (text) =>
      text.replace("source: shop", "source: shops"),
    );
    expect(problems(project, "dev")).toMatchObject([
      {
        file: "flows/shop.yaml",
        code: "BROKEN_LINK",
        severity: "error",
        range: { start: { line: 4, character: 8 } },
      },
    ]);
  });

  it("shows a misspelt setting with the method's settings in the message", () => {
    const project = edited(retail, "flows/shop.yaml", (text) =>
      text.replace("with: { format: csv", "with: { formt: csv"),
    );
    const [problem] = problems(project, "dev");
    expect(problem).toMatchObject({ file: "flows/shop.yaml", code: "BAD_SETTING" });
    expect(problem?.message).toContain('"formt" is not a setting');
  });

  it("reports a syntax error instead of failing", () => {
    const project = edited(retail, "flows/shop.yaml", (text) =>
      text.replace("tables:", "tables: [\n"),
    );
    expect(problems(project, "dev").map((problem) => problem.code)).toContain("YAML_SYNTAX");
  });

  it("warns on a generated file changed by hand", () => {
    const project = edited(
      retail,
      "build/dev/src/retail/bronze/orders.sql",
      (text) => `${text}-- mine\n`,
    );
    expect(problems(project, "dev")).toMatchObject([
      {
        file: "build/dev/src/retail/bronze/orders.sql",
        severity: "warning",
        code: "EDITED",
        message: expect.stringContaining("the next apply reports a conflict"),
      },
    ]);
  });

  it("checks template.yaml", () => {
    const project = edited(minimal, "template.yaml", (text) => text.replace("title:", "titel:"));
    expect(problems(project, "dev")).toMatchObject([
      { file: "template.yaml", code: "TEMPLATE", message: 'template.yaml: unknown key "titel".' },
    ]);
  });
});

describe("files the imports leave out", () => {
  it("says a transform outside the imports is not part of the project, with a fix", () => {
    const transform = join(minimal, "transforms/paid_orders.yaml");
    const project = openProject(
      minimal,
      new Map([
        [
          transform,
          "apiVersion: ingestron.io/v1\nkind: Transform\nid: paid_orders\ninputs: [orders]\ncode: SELECT 1\n",
        ],
      ]),
    );
    const found = problems(project, "dev").filter((problem) => problem.code === "NOT_IMPORTED");
    expect(found).toMatchObject([{ file: "transforms/paid_orders.yaml", severity: "warning" }]);
    expect(found[0]?.fixes?.[0]).toEqual({
      title: 'Import "transforms/*.yaml" in project.yaml',
      edits: [{ file: "project.yaml", pointer: "/imports/-", set: "transforms/*.yaml" }],
    });
  });
});
