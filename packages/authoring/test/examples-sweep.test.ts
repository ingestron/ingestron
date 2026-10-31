// Every editor feature on every line of every example: Databricks and ADF,
// files, Lakeflow Connect, Kafka, private networks, transforms and PySpark.
// Nothing may fail, every example resolves, and every flow table is annotated.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { annotationsIn, generatedLenses } from "../src/annotations.js";
import { completionsAt } from "../src/completion.js";
import { problems } from "../src/diagnostics.js";
import { quickFixes } from "../src/fixes.js";
import { hoverAt } from "../src/hover.js";
import { moveSetting } from "../src/moves.js";
import { definitionAt } from "../src/navigation.js";
import { openProject } from "../src/project.js";
import { referenceAt } from "../src/reference.js";

const examples = join(import.meta.dirname, "../../../samples");
const names = ["starters", "guides"].flatMap((kind) =>
  readdirSync(join(examples, kind))
    .filter((name) => statSync(join(examples, kind, name)).isDirectory())
    .map((name) => `${kind}/${name}`),
);

function yamlFiles(folder: string, root = folder): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (entry === "build") return [];
    if (statSync(path).isDirectory()) return yamlFiles(path, root);
    return /\.ya?ml$/.test(entry) ? [relative(root, path)] : [];
  });
}

describe.each(names)("%s", (name) => {
  const folder = join(examples, name);
  const project = openProject(folder, new Map());
  const environment = project.environments[0];

  it("resolves without errors", () => {
    const errors = problems(project, environment).filter((item) => item.severity === "error");
    expect(errors.map((item) => `${item.file}: ${item.code} ${item.message}`)).toEqual([]);
  });

  it.each(yamlFiles(folder))("runs every feature on every line of %s without failing", (file) => {
    const text = readFileSync(join(folder, file), "utf8");
    let offset = 0;
    for (const [line, content] of text.split("\n").entries()) {
      const colon = content.indexOf(":");
      const spots = [offset + Math.max(0, colon - 1), offset + content.length];
      for (const at of spots) {
        completionsAt(project, file, text, at, environment);
        hoverAt(project, file, text, at, environment, { docs: (path) => path });
        referenceAt(project, file, text, at, environment);
        definitionAt(project, file, at);
        moveSetting(project, file, text, at, environment);
      }
      quickFixes(project, environment, file, {
        start: { line, character: 0 },
        end: { line, character: content.length },
      });
      offset += content.length + 1;
    }
    annotationsIn(project, file, text, environment);
    generatedLenses(project, file, text, environment);
  });

  it("gives every flow table its full name and generated files", () => {
    for (const file of yamlFiles(folder).filter((path) => path.startsWith("flows/"))) {
      const text = readFileSync(join(folder, file), "utf8");
      const tables = Object.keys((parse(text) as { tables?: object }).tables ?? {});
      const named = annotationsIn(project, file, text, environment).filter((item) =>
        item.label.startsWith("→ "),
      );
      const lenses = generatedLenses(project, file, text, environment);
      expect(named, file).toHaveLength(tables.length);
      expect(lenses.filter((lens) => lens.methods === "" || lens.files.length === 0)).toEqual([]);
    }
  });
});
