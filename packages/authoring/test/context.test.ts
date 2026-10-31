// What is at the cursor, worked out once for every feature, also while the
// text does not parse.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flowFacts, placeAt } from "../src/context.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const flow = readFileSync(join(retail, "flows/shop.yaml"), "utf8");

/** The place where `|` is in `marked`. */
const at = (marked: string, file = "flows/shop.yaml") =>
  placeAt(file, marked.replace("|", ""), marked.indexOf("|"));

describe("placeAt", () => {
  it("knows a value typed straight after its key", () => {
    const place = at(flow.replace("    store:\n", "    store:\n      uses:|\n"));
    expect(place).toMatchObject({
      kind: "Flow",
      part: "value",
      path: ["tables", "orders", "store", "uses"],
      tight: true,
    });
  });

  it("knows a value after a space", () => {
    expect(at(flow.replace("source: shop", "source: |"))).toMatchObject({
      part: "value",
      path: ["source"],
      tight: false,
    });
  });

  it("knows a new key and the mapping it goes in", () => {
    expect(at(flow.replace("tables:\n", "tables:\n  |\n"))).toMatchObject({
      part: "key",
      path: ["tables"],
    });
  });

  it("knows a list item", () => {
    const text = "apiVersion: ingestron.io/v1\nkind: Transform\ninputs:\n  - |\n";
    expect(at(text, "transforms/x.yaml")).toMatchObject({ part: "item", path: ["inputs"] });
  });

  it("knows the kind and as much data as parses while the text is broken", () => {
    const place = at("apiVersion: ingestron.io/v1\nkind: Flow\nsource: shop\ntables: [\n|");
    expect(place.kind).toBe("Flow");
    expect(place.data.source).toBe("shop");
  });
});

describe("flowFacts", () => {
  it("gives the flow's source and its connection's connector and connectivity", () => {
    const project = openProject(retail, new Map());
    expect(flowFacts(project, at(flow.replace("source: shop", "source: shop|")))).toEqual({
      source: "shop",
      connector: "files",
      connectivity: "public",
    });
  });
});

describe("placeAt in lists of mappings", () => {
  it("counts an item whose first line has a value, such as - name: total", () => {
    const text = [
      "kind: DataContract",
      "schema:",
      "  - name: orders",
      "    properties:",
      "      - name: total",
      "        logicalType: number",
      "        quality:",
      "          - |",
    ].join("\n");
    expect(at(text, "contracts/orders.yaml")).toMatchObject({
      part: "item",
      path: ["schema", "0", "properties", "0", "quality"],
    });
  });

  it("knows a sibling key inside such an item", () => {
    const text = ["kind: DataContract", "schema:", "  - name: orders", "    |"].join("\n");
    expect(at(text, "contracts/orders.yaml")).toMatchObject({ part: "key", path: ["schema", "0"] });
  });
});

describe("placeAt inside { } and [ ] on a line", () => {
  const head = [
    "kind: DataContract",
    "schema:",
    "  - name: customers",
    "    properties:",
    "      - name: demo",
    "        quality:",
  ].join("\n");
  const base = ["schema", "0", "properties", "0", "quality"];

  it("knows a new key after a comma", () => {
    const text = `${head}\n          - { name: not-null, metric: nullValues, mustBe: 0, | }`;
    expect(at(text, "contracts/c.yaml")).toMatchObject({ part: "key", path: [...base, "0"] });
  });

  it("knows a value after a key", () => {
    const text = `${head}\n          - { name: not-null, metric: | }`;
    expect(at(text, "contracts/c.yaml")).toMatchObject({
      part: "value",
      path: [...base, "0", "metric"],
      tight: false,
    });
  });

  it("follows nested braces, and counts which item it is", () => {
    const text = `${head}\n          - { metric: nullValues, mustBe: 0 }\n          - { metric: missingValues, arguments: { | } }`;
    expect(at(text, "contracts/c.yaml")).toMatchObject({
      part: "key",
      path: [...base, "1", "arguments"],
    });
  });

  it("knows an item in a list on the line", () => {
    const text = `${head}\n          - { metric: invalidValues, arguments: { validValues: [a, | ] } }`;
    expect(at(text, "contracts/c.yaml")).toMatchObject({
      part: "item",
      path: [...base, "0", "arguments", "validValues"],
    });
  });
});

describe("placeAt inside { } or [ ] that spans lines", () => {
  it("knows a new key on a line inside a mapping opened on an earlier line", () => {
    const text = "id: x\nenvironments:\n  dev: {\n    |\n  }\n";
    expect(at(text, "project.yaml")).toMatchObject({
      kind: "Project",
      part: "key",
      path: ["environments", "dev"],
    });
  });

  it("knows a value after a key on a later line", () => {
    const text =
      "kind: DataContract\nschema:\n  - name: orders\n    properties:\n      - {\n          name: id,\n          logicalType: |\n        }\n";
    expect(at(text, "contracts/c.yaml")).toMatchObject({
      part: "value",
      path: ["schema", "0", "properties", "0", "logicalType"],
    });
  });
});
