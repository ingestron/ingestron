// template.yaml: what a template asks, and the built-in templates (examples with one).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { builtInFolder, builtInTemplates, readTemplate } from "../../src/scaffold/templates.js";

function folderWith(text: string): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-tpl-test-"));
  writeFileSync(join(folder, "template.yaml"), text);
  writeFileSync(join(folder, "project.yaml"), "id: x\n");
  return folder;
}

describe("built-in templates", () => {
  it("are the starters, named by their folder", () => {
    expect(builtInTemplates().map((template) => template.name)).toEqual([
      "duckdb",
      "kafka",
      "minimal",
      "private-files",
      "private-sql-server",
      "pyspark",
      "retail",
      "salesforce",
      "sql-server",
    ]);
  });

  it("ask nothing: what a project cannot know is REPLACE_ME in its files", () => {
    for (const template of builtInTemplates())
      expect(template.questions, template.name).toEqual([]);
  });
});

describe("template.yaml", () => {
  it("refuses an unknown key, so a typo is found at once", () => {
    expect(() => readTemplate(folderWith("titel: x\nsummary: y\n"), "x")).toThrow(
      'template.yaml: unknown key "titel".',
    );
  });

  it("refuses a question without value, ask and default", () => {
    const text = "title: x\nsummary: y\nquestions:\n  - { value: landing }\n";
    expect(() => readTemplate(folderWith(text), "x")).toThrow(
      'template.yaml: question 1 needs "value", "ask" and "default".',
    );
  });
});

describe("where built-in templates are", () => {
  it("is project-templates/ beside dist/, the same in the repository and installed", () => {
    expect(builtInFolder).toBe(join(import.meta.dirname, "../../project-templates"));
  });
});
