// A flow table's source filter (specification section 5.1): the references it holds, and the
// methods that may filter.
import { describe, expect, it } from "vitest";
import { parameterReferences } from "../../src/triggers/references.js";
import { problems, resolve } from "./project.js";

describe("parameterReferences", () => {
  it("returns the names in order, whatever the spacing inside the braces", () => {
    expect(parameterReferences("d >= {{ parameters.min_date }} AND x = {{parameters.y}}")).toEqual([
      "min_date",
      "y",
    ]);
  });

  it("ignores other braces and other names", () => {
    const text = "a = {{ table }} AND b = { parameters.c } AND d = {{ run.x }}";
    expect(parameterReferences(text)).toEqual([]);
  });

  it("returns each use of a name", () => {
    expect(parameterReferences("{{ parameters.a }} {{ parameters.a }}")).toEqual(["a", "a"]);
  });
});

const declared = "  parameters:\n    min_date: { type: date, default: '2020-01-01' }";
const copy = `  uses: copy\n  with: { landing: /landing }\n${declared}`;
const written = (filter: string) => `, ingest: { filter: "${filter}" }`;

/** The result of a flow of one table that writes `filter`, on the flow's `ingest`. */
function filtered(filter: string, ingest: string) {
  return resolve(ingest, undefined, 1, undefined, written(filter));
}

describe("a table's filter", () => {
  it("is held as written, with its references unexpanded, on a method that filters", () => {
    const text = "d >= {{ parameters.min_date }}";
    const result = filtered(text, copy);
    expect(problems(result)).toEqual([]);
    expect(result.model?.tables[0]?.ingest?.filter).toBe(text);
  });

  it("is absent when the table writes none", () => {
    const result = resolve(copy);
    expect(problems(result)).toEqual([]);
    expect(result.model?.tables[0]?.ingest).not.toHaveProperty("filter");
  });

  it("is FILTER_NOT_SUPPORTED on a method that does not filter, naming the method", () => {
    const result = filtered("x = 1", declared);
    expect(problems(result)).toEqual([
      "FILTER_NOT_SUPPORTED: files does not filter source rows; remove `filter`, or use a method that does.",
    ]);
    expect(result.diagnostics[0]?.location).toMatchObject({ file: "shop.yaml" });
  });

  it("does not check the references of a filter the method refuses", () => {
    const result = filtered("x = {{ parameters.gone }}", declared);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["FILTER_NOT_SUPPORTED"]);
  });

  it("is TRIGGER_PARAMETER for each name the flow does not declare, once", () => {
    const text = "{{ parameters.a }} {{ parameters.min_date }} {{ parameters.a }} {{parameters.b}}";
    const result = filtered(text, copy);
    expect(problems(result)).toEqual([
      'TRIGGER_PARAMETER: "{{ parameters.a }}" names no parameter of the flow.',
      'TRIGGER_PARAMETER: "{{ parameters.b }}" names no parameter of the flow.',
    ]);
    expect(result.diagnostics[0]?.location).toMatchObject({ file: "shop.yaml" });
  });

  it("allows the built-in parameters without a declaration, but not `tables`", () => {
    const text = "{{ parameters.windowStart }} {{ parameters.windowEnd }} {{ parameters.load }}";
    expect(problems(filtered(text, "  uses: copy\n  with: { landing: /landing }"))).toEqual([]);
    expect(problems(filtered("{{ parameters.tables }}", copy))).toEqual([
      'TRIGGER_PARAMETER: "{{ parameters.tables }}" names no parameter of the flow.',
    ]);
  });

  it("is TRIGGER_PARAMETER when the flow declares no parameters", () => {
    const result = filtered(
      "x = {{ parameters.a }}",
      "  uses: copy\n  with: { landing: /landing }",
    );
    expect(problems(result)).toEqual([
      'TRIGGER_PARAMETER: "{{ parameters.a }}" names no parameter of the flow.',
    ]);
  });

  it("allows a filter with no references on a method that filters", () => {
    expect(problems(filtered("x = 1", copy))).toEqual([]);
  });
});
