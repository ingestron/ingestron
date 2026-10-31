import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { toEditorSchema } from "../src/editor-schema.js";
import { parseDefinitionString } from "../src/references.js";

const schema = {
  type: "object",
  properties: {
    workers: { type: "integer" },
    mode: { enum: ["batch", "stream"] },
    table: { type: "string" },
    columns: { type: "array", items: { type: "string" } },
  },
};

const validate = new Ajv2020({ strict: false }).compile(toEditorSchema(schema));

describe("toEditorSchema", () => {
  it.each([
    { workers: 4 },
    { workers: "${values.workers}" },
    { workers: "${envvar:WORKERS}" },
    { mode: "${values.mode}" },
    { table: "raw_${environment.name}" },
    { table: "orders_$${bundle.target}" },
    { columns: "${file:columns.yaml}" },
    { columns: ["a", "${values.extra}"] },
  ])("accepts %j", (document) => {
    expect(validate(document)).toBe(true);
  });

  it.each([
    { workers: "4x" },
    { mode: "both" },
    { table: "orders_${bundle.target}" },
    { columns: "not a list" },
  ])("refuses %j", (document) => {
    expect(validate(document)).toBe(false);
  });

  it("keeps titles and descriptions on the wrapper, where editors show them", () => {
    const editorSchema = toEditorSchema({
      type: "object",
      properties: {
        table: { type: "string", description: "Target table." },
        workers: { type: "integer", title: "Workers", default: 2 },
      },
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(editorSchema.properties.table).toMatchObject({ description: "Target table." });
    expect(editorSchema.properties.workers).toMatchObject({ title: "Workers", default: 2 });
  });

  it("lets a text field with its own pattern hold a whole reference", () => {
    const check = new Ajv2020({ strict: false }).compile(
      toEditorSchema({
        type: "object",
        properties: { name: { type: "string", pattern: "^[a-z_]+$" } },
      }),
    );
    expect(check({ name: "orders" })).toBe(true);
    expect(check({ name: "${values.name}" })).toBe(true);
    expect(check({ name: "Orders!" })).toBe(false);
  });

  it("leaves the original schema unchanged", () => {
    const before = JSON.stringify(schema);
    toEditorSchema(schema);
    expect(JSON.stringify(schema)).toBe(before);
  });
});

describe("editor text pattern agrees with the parser", () => {
  const textValidate = new Ajv2020({ strict: false }).compile(
    toEditorSchema({ type: "object", properties: { text: { type: "string" } } }),
  );
  it.each([
    "plain",
    "$",
    "$$",
    "costs $5",
    "a_${values.x}",
    "a_$${bundle.target}",
    "$$${x}",
    "${bundle.target}",
    "${{ github.ref }}",
    "x ${hiveconf:y}",
    "${ values.x }",
    "${file:a.yaml#/b}",
    "open ${values.x",
  ])("%s", (text) => {
    const parserAccepts = parseDefinitionString(text).ok;
    expect(textValidate({ text })).toBe(parserAccepts);
  });
});
