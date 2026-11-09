// Editor schemas for VS Code's YAML extension. One combined schema chooses
// each document's schema by its `kind`, so a single setting covers every file.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { manifestSchema, toEditorSchema, type JsonSchema } from "@ingestron/config";
import { kinds } from "@ingestron/definitions";
import type { Options } from "../terminal/index.js";
import type { Io } from "../terminal/index.js";
import { packs, templateSchema } from "@ingestron/core";

/** Writes the schemas to `.ingestron/schemas` and prints the VS Code setting. */
export function writeSchemas(options: Options, io: Io): number {
  const folder = join(io.cwd, ".ingestron", "schemas");
  mkdirSync(folder, { recursive: true });
  const write = (name: string, schema: JsonSchema) =>
    writeFileSync(join(folder, name), `${JSON.stringify(schema, null, 2)}\n`);
  write("project.json", manifestSchema);
  const branches = Object.values(kinds).map((kind) => {
    const file = `${kind.kind.toLowerCase()}.json`;
    write(file, toEditorSchema(kind.kind === "Platform" ? withSections(kind.schema) : kind.schema));
    return {
      if: { required: ["kind"], properties: { kind: { const: kind.kind } } },
      then: { $ref: file },
    };
  });
  write("template.json", templateSchema as JsonSchema);
  // Without a kind: project.yaml has an id, a template's template.yaml does not.
  branches.push(
    {
      if: { not: { required: ["kind"] }, required: ["id"] },
      then: { $ref: "project.json" },
    } as never,
    {
      if: { not: { anyOf: [{ required: ["kind"] }, { required: ["id"] }] } },
      then: { $ref: "template.json" },
    } as never,
  );
  write("definitions.json", { title: "Ingestron definitions", allOf: branches });
  const files = join(
    relative(io.cwd, resolve(io.cwd, options.definitions)) || ".",
    "**/*.yaml",
  ).replace(/^\.\//, "");
  const setting = {
    "yaml.schemas": { [relative(io.cwd, join(folder, "definitions.json"))]: files },
  };
  io.write(
    `Wrote editor schemas to ${relative(io.cwd, folder)}.\nAdd this to .vscode/settings.json:\n${JSON.stringify(setting, null, 2)}\n`,
  );
  return 0;
}

/** The Platform's schema with each pack's section, which the loader checks (definitions spec 7.2). */
function withSections(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") return schema;
  const sections = Object.fromEntries(
    packs.flatMap((pack) => (pack.platformSection ? [[pack.id, pack.platformSection]] : [])),
  );
  return { ...schema, properties: { ...(schema.properties as object), ...sections } };
}
