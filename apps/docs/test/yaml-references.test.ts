import { afterEach, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { loadDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";
import { exampleFolder } from "../lib/examples.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "docs-references-"));
  folders.push(folder);
  cpSync(exampleFolder("minimal"), folder, { recursive: true });
  return folder;
}
function edit(folder: string, file: string, change: (doc: any) => void) {
  const path = join(folder, file);
  const doc = parse(readFileSync(path, "utf8"));
  change(doc);
  writeFileSync(path, stringify(doc));
}

it("resolves the documented environment, project, typed value and YAML file references", () => {
  const folder = fixture();
  writeFileSync(join(folder, "shared.yaml"), "csv: { header: true }\n");
  edit(folder, "project.yaml", (doc) => {
    doc.values = {
      landing: "/Volumes/${environment.name}/landing/${project.id}",
      hints: false,
      options: "${file:shared.yaml#/csv}",
    };
  });
  edit(folder, "flows/orders.yaml", (doc) => {
    doc.ingest = {
      with: {
        schema_hints: "${values.hints}",
        options: "${values.options}",
      },
    };
  });
  const result = loadDefinitions(folder, { packs: [databricks], environment: "dev" });
  expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  expect(result.model?.tables[0]?.ingest?.connection.settings.path).toBe(
    "/Volumes/dev/landing/shop",
  );
  expect(result.model?.tables[0]?.ingest?.settings.schema_hints).toBe(false);
  expect(result.model?.tables[0]?.ingest?.settings.options).toEqual({ header: true });
});

it("preserves an escaped external placeholder and requires an explicitly supplied environment variable", () => {
  const folder = fixture();
  edit(folder, "connections/shop.yaml", (doc) => {
    doc.settings.path = "$${bundle.target}";
  });
  const options = { packs: [databricks], environment: "dev" };
  expect(loadDefinitions(folder, options).model?.tables[0]?.ingest?.connection.settings.path).toBe(
    "${bundle.target}",
  );
  edit(folder, "connections/shop.yaml", (doc) => {
    doc.settings.path = "${envvar:SOURCE_PATH}";
  });
  expect(
    loadDefinitions(folder, { ...options, envvars: {} }).diagnostics.map((item) => item.code),
  ).toContain("ENVVAR_MISSING");
  expect(
    loadDefinitions(folder, { ...options, envvars: { SOURCE_PATH: "/Volumes/dev/source" } }).model
      ?.tables[0]?.ingest?.connection.settings.path,
  ).toBe("/Volumes/dev/source");
});

it("rejects composing values from other values as documented", () => {
  const folder = fixture();
  edit(folder, "project.yaml", (doc) => {
    doc.values.landing = "${values.other}";
  });
  expect(
    loadDefinitions(folder, { packs: [databricks], environment: "dev" }).diagnostics.map(
      (item) => item.code,
    ),
  ).toContain("VALUES_SELF_REFERENCE");
});
