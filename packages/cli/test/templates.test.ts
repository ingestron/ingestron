// template.yaml: what a template asks, and the built-in templates (examples with one).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { builtInFolderFor, builtInTemplates, readTemplate } from "../src/templates.js";

function folderWith(text: string): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-tpl-test-"));
  writeFileSync(join(folder, "template.yaml"), text);
  writeFileSync(join(folder, "project.yaml"), "id: x\n");
  return folder;
}

describe("built-in templates", () => {
  it("are the starters, named by their folder", () => {
    expect(builtInTemplates().map((template) => template.name)).toEqual([
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

  it("ask their questions with defaults", () => {
    const minimal = builtInTemplates().find((template) => template.name === "minimal");
    expect(minimal?.questions).toEqual([
      {
        value: "landing",
        ask: "Where do the source files land?",
        default: "/Volumes/dev/landing/shop",
      },
    ]);
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
  it("uses project-templates beside a bundle, not the pack's templates folder", () => {
    const root = mkdtempSync(join(tmpdir(), "ingestron-tpl-test-"));
    mkdirSync(join(root, "templates"));
    expect(builtInFolderFor(root)).toBe(join(root, "../../samples/starters"));
    mkdirSync(join(root, "project-templates"));
    expect(builtInFolderFor(root)).toBe(join(root, "project-templates"));
  });
});
