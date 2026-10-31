// Every field the editor describes is offered as a key, has a value to
// suggest unless it is free text, and has a Reference entry: for every
// document kind, project.yaml included, and every setting of every method.
import { join } from "node:path";
import { packs } from "@ingestron/cli";
import {
  documentReference,
  methodReference,
  referenceKinds,
  type FieldInfo,
} from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";
import { referenceAt } from "../src/reference.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");
const project = openProject(retail, new Map());

/** The file each kind is written in, and its first lines. */
const files: Record<string, { file: string; head: string }> = {
  Project: { file: "project.yaml", head: "id: retail\n" },
  Standard: { file: "standard.yaml", head: "apiVersion: ingestron.io/v1\nkind: Standard\n" },
  Platform: { file: "platform.yaml", head: "apiVersion: ingestron.io/v1\nkind: Platform\n" },
  Connection: {
    file: "connections/x.yaml",
    head: "apiVersion: ingestron.io/v1\nkind: Connection\n",
  },
  Flow: { file: "flows/x.yaml", head: "apiVersion: ingestron.io/v1\nkind: Flow\n" },
  Transform: { file: "transforms/x.yaml", head: "apiVersion: ingestron.io/v1\nkind: Transform\n" },
};

/** Free text with nothing to suggest: ids, names, descriptions, paths and code. */
const freeText = (field: FieldInfo) =>
  !field.values &&
  field.default === undefined &&
  field.example === undefined &&
  !/mapping|list|true or false/.test(field.type);

const at = (text: string, offset = text.length) => ({ text, offset });

describe.each(Object.keys(files))("%s", (kind) => {
  const { file, head } = files[kind]!;
  const top = documentReference(kind as keyof typeof referenceKinds).filter(
    (field) => field.path.length === 1 && !["apiVersion", "kind"].includes(field.name),
  );
  // A field already in the head is checked as a value, from a head without it.
  const headFor = (name: string) => head.replace(new RegExp(`^${name}:.*\\n`, "m"), "");

  it("offers every top-level field as a key", () => {
    const { text, offset } = at(head);
    const labels = completionsAt(project, file, text, offset, project.environments[0]).map(
      (item) => item.label,
    );
    const unwritten = top.map((field) => field.name).filter((name) => !head.includes(`${name}:`));
    expect(unwritten.filter((name) => !labels.includes(name))).toEqual([]);
  });

  it.each(top.filter((field) => !freeText(field)).map((field) => [field.name, field]))(
    "suggests a value for %s",
    (_, field) => {
      const name = (field as FieldInfo).name;
      const { text, offset } = at(`${headFor(name)}${name}:`);
      expect(
        completionsAt(project, file, text, offset, project.environments[0]).length,
      ).toBeGreaterThan(0);
    },
  );

  it("has a Reference entry for every top-level field", () => {
    const missing = top.filter((field) => {
      const text = `${headFor(field.name)}${field.name}: x\n`;
      return !referenceAt(project, file, text, text.indexOf(`${field.name}:`) + 1, "dev")?.text;
    });
    expect(missing.map((field) => field.name)).toEqual([]);
  });
});

describe.each(
  packs.flatMap((pack) => Object.keys(pack.methods).map((id) => [`${pack.id}:${id}`, pack, id])),
)("method %s", (_, pack, id) => {
  const method = (pack as (typeof packs)[number]).methods[id as string]!;
  const head = `apiVersion: ingestron.io/v1\nkind: Standard\npacks: [databricks@1, adf@1]\n${method.action}:\n  settings:\n    ${id as string}:\n      `;
  const settings = methodReference(pack as (typeof packs)[number], id as string).filter(
    (field) => field.path.length === 1,
  );

  it("offers every setting as a key", () => {
    const labels = completionsAt(
      project,
      "standard.yaml",
      head,
      head.length,
      project.environments[0],
    ).map((item) => item.label);
    expect(settings.map((field) => field.name).filter((name) => !labels.includes(name))).toEqual(
      [],
    );
  });

  it("suggests a value for every setting that is not free text", () => {
    const empty = settings.filter((field) => {
      if (freeText(field)) return false;
      const text = `${head}${field.name}:`;
      return (
        completionsAt(project, "standard.yaml", text, text.length, project.environments[0])
          .length === 0
      );
    });
    expect(empty.map((field) => field.name)).toEqual([]);
  });
});
