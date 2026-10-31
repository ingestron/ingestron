// Smart defaults: what the project already determines is filled in or offered
// first, and nothing is invented.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { hoverAt } from "../src/hover.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");
const returns = `apiVersion: v3.1.0
kind: DataContract
id: shop.returns
version: 1.0.0
status: draft
schema:
  - name: returns
    logicalType: object
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
`;

/** Completions where `|` is in `marked`, the open text of `path`; `extra` files are open too. */
function at(path: string, marked: string, extra: Record<string, string> = {}) {
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  const open = new Map([
    [join(retail, path), text],
    ...Object.entries(extra).map(([file, body]) => [join(retail, file), body] as [string, string]),
  ]);
  const project = openProject(retail, open);
  return completionsAt(project, path, text, offset, project.environments[0]);
}

describe("a new, empty file", () => {
  it("offers a Flow skeleton in flows/, with the id from the file name and the connections to choose from", () => {
    const [first] = at("flows/web.yaml", "|");
    expect(first?.label).toBe("Flow document");
    expect(first?.snippet).toContain("kind: Flow\nid: ${1:web}\nsource: ${2|shop|}\n");
  });

  it("offers a Connection skeleton per connector in connections/, with its settings to fill", () => {
    const items = at("connections/erp.yaml", "|");
    expect(items.map((item) => item.label)).toEqual([
      "Connection: Files",
      "Connection: SQL Server",
      "Connection: Salesforce",
      "Connection: Kafka",
    ]);
    expect(items[0]?.snippet).toContain(
      "id: ${1:erp}\nconnector: files\nconnectivity: ${2|public,workspace|}\nsettings:\n  path: $3\n",
    );
  });

  it("offers a contract skeleton in contracts/, named after the project's connection", () => {
    const [first] = at("contracts/returns.yaml", "|");
    expect(first?.label).toBe("DataContract document");
    expect(first?.snippet).toContain("id: ${1:shop.returns}");
  });

  it("offers the project manifest in an empty project.yaml, with the id from the folder as init makes it", () => {
    const [first, ...rest] = at("project.yaml", "|");
    expect(first?.label).toBe("Project manifest");
    expect(first?.snippet).toContain("id: ${1:retail}\nenvironments:\n  dev: {}\n  prod: {}\n");
    expect(first?.snippet).toContain("imports:\n  - standard.yaml\n  - connections/*.yaml\n");
    expect(rest).toEqual([]);
  });

  it("offers a Standard in an empty standard.yaml, with the available packs to choose from", () => {
    const [first] = at("standard.yaml", "|");
    expect(first?.label).toBe("Standard document");
    expect(first?.snippet).toMatch(/packs: \[\$\{2\|databricks@1,adf@1,synapse@1\|\}\]/);
  });

  it("offers every kind outside the usual folders", () => {
    const labels = at("misc.yaml", "|").map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Flow document", "Connection: Files", "DataContract document"]),
    );
  });
});

describe("in a flow", () => {
  const flow = read("flows/shop.yaml");

  it("offers a table for each contract no table uses yet", () => {
    const items = at("flows/shop.yaml", flow.replace("tables:\n", "tables:\n  |\n"), {
      "contracts/returns.yaml": returns,
    });
    const table = items.find((item) => item.label === "returns");
    expect(table?.snippet).toBe("returns: { object: returns, contract: shop.returns }");
    expect(items.map((item) => item.label)).not.toContain("orders");
  });

  it("offers the contract named after the source and object first", () => {
    const items = at("flows/shop.yaml", flow.replace("contract: shop.orders", "contract: |"));
    expect(items.find((item) => item.preselect)?.label).toBe("shop.orders");
  });

  it("offers the methods that can read the source first, and says why the others cannot", () => {
    const items = at(
      "flows/shop.yaml",
      flow.replace("    store:\n", "    ingest:\n      uses: |\n    store:\n"),
    );
    expect(items[0]).toMatchObject({ label: "files", preselect: true });
    expect(items.find((item) => item.label === "lakeflow-connect")?.detail).toBe(
      "cannot read files sources",
    );
  });
});

describe("hover on a naming pattern", () => {
  it("shows the names it gives in the selected environment", () => {
    const text = read("standard.yaml");
    const project = openProject(retail, new Map());
    const shown = hoverAt(project, "standard.yaml", text, text.indexOf("catalog:") + 2, "dev");
    expect(shown).toContain("`dev_sales`");
  });
});

describe("a new item in a contract column's quality list", () => {
  const contract = read("contracts/orders.yaml").replace(
    '      - { name: total, logicalType: number, physicalType: "DECIMAL(18,2)" }',
    "      - name: total\n        logicalType: number\n        quality:\n          - |",
  );

  it("offers the rules checked on each row, and the rule's fields", () => {
    const items = at("contracts/orders.yaml", contract);
    const labels = items.map((item) => item.label);
    expect(labels.slice(0, 4)).toEqual([
      "Not null",
      "Allowed values",
      "Matches a pattern",
      "No missing values",
    ]);
    expect(items[0]?.snippet).toBe("{ metric: nullValues, mustBe: 0 }");
    expect(labels.slice(4, 7)).toEqual(["metric", "mustBe", "arguments"]);
  });
});

describe("straight after a list dash, with no space yet", () => {
  it("brings the space, so the suggestions are not filtered by the dash", () => {
    const contract = read("contracts/orders.yaml").replace(
      '      - { name: total, logicalType: number, physicalType: "DECIMAL(18,2)" }',
      "      - name: total\n        quality:\n          -|",
    );
    const [first] = at("contracts/orders.yaml", contract);
    expect(first?.snippet).toBe(" { metric: nullValues, mustBe: 0 }");
    expect(first?.afterDash).toBe(true);
  });
});

describe("inside a quality rule written on one line", () => {
  const rule = (inside: string) =>
    read("contracts/orders.yaml").replace(
      '      - { name: total, logicalType: number, physicalType: "DECIMAL(18,2)" }',
      `      - name: total\n        quality:\n          - { ${inside} }`,
    );

  it("offers the rule's fields not written yet", () => {
    const labels = at(
      "contracts/orders.yaml",
      rule("name: not-null, metric: nullValues, mustBe: 0, |"),
    ).map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["arguments", "unit", "description"]));
    expect(labels).not.toContain("metric");
    expect(labels).not.toContain("mustBe");
  });

  it("offers a field's values", () => {
    const labels = at("contracts/orders.yaml", rule("metric: |")).map((item) => item.label);
    expect(labels).toEqual([
      "nullValues",
      "missingValues",
      "invalidValues",
      "duplicateValues",
      "rowCount",
    ]);
  });
});
