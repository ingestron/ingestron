// Completion from metadata imported from a sample shows the sample's column names, never a value
// from its rows: the rows here hold values no name or type has, and none of them is shown.
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectSnapshot, type Suggestion } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/cli/conformance/sources/request");
const rows = [
  "order_ref,customer_email,amount,placed",
  "ZQXROW-0001,alice.zqx@example.test,991.37,2026-01-02",
  "ZQXROW-0002,bob.zqx@example.test,12.5,2026-01-03",
  "",
].join("\n");
/** Every value of the rows, and parts of them a careless label could hold. */
const values = ["ZQXROW", "0001", "alice", "bob", "zqx", "example.test", "991.37", "12.5", "01-0"];

const flow = [
  "apiVersion: ingestron.io/v1",
  "kind: Flow",
  "id: landing",
  "source: landing",
  "tables:",
  "  shipments:",
  "    object: shipments",
  "    contract: landing.shipments",
  "    expectations:",
  "      - name: has_ref",
  "        check: order_ref IS NOT NULL",
  "    sequence: placed",
  "    load: { mode: incremental, cursor: placed }",
  "    cleanse:",
  "      columns:",
  "        customer_email: { case: lower }",
  "      deduplicate: { order_by: [placed] }",
  "",
].join("\n");
const contract = [
  "apiVersion: v3.1.0",
  "kind: DataContract",
  "id: landing.shipments",
  "version: 0.1.0",
  "status: draft",
  "schema:",
  "  - name: shipments",
  "    logicalType: object",
  "    properties:",
  "      - name: order_ref",
  "        logicalType: string",
  "",
].join("\n");

let folder = "";
let open = new Map<string, string>();
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "source-completion-rows-"));
  cpSync(conformance, folder, { recursive: true });
  const edit = ProjectSnapshot.open(folder).importSource(
    "sources/landing/shipments.csv",
    Buffer.from(rows),
    { at: "2026-11-12T09:00:00Z" },
  );
  if ("refused" in edit) throw new Error(edit.refused.join("\n"));
  open = new Map(edit.files.map(({ file, text }) => [join(folder, file), text]));
  // The project loads the contract too.
  const project =
    open.get(join(folder, "project.yaml")) ?? readFileSync(join(folder, "project.yaml"), "utf8");
  open.set(join(folder, "project.yaml"), `${project.trimEnd()}\n  - contracts/*.yaml\n`);
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** The completions where `|` is, in `path` with `marked` as its text. */
function at(path: string, marked: string): Suggestion[] {
  const text = marked.replace("|", "");
  const texts = new Map([
    ...open,
    [join(folder, "flows/landing.yaml"), flow],
    [join(folder, "contracts/landing.shipments.yaml"), contract],
    [join(folder, path), text],
  ]);
  return ProjectSnapshot.open(folder, texts).completionsAt(path, text, marked.indexOf("|"), "dev");
}

/** Every string anywhere in the suggestions, whichever field holds it. */
const everything = (items: Suggestion[]) => JSON.stringify(items);

/** The hover where `|` is, in `path` with `marked` as its text. */
function hover(path: string, marked: string): string {
  const text = marked.replace("|", "");
  const texts = new Map([
    ...open,
    [join(folder, "flows/landing.yaml"), flow],
    [join(folder, "contracts/landing.shipments.yaml"), contract],
    [join(folder, path), text],
  ]);
  return ProjectSnapshot.open(folder, texts).hoverAt(path, text, marked.indexOf("|"), "dev") ?? "";
}

describe("completion from a sample's metadata", () => {
  it("shows the sample's columns and its object, and no value from its rows", () => {
    const columns = ["order_ref", "customer_email", "amount", "placed"];
    const inFlow = (from: string, to: string) => at("flows/landing.yaml", flow.replace(from, to));
    const shown = [
      at("flows/landing.yaml", flow.replace("object: shipments", "object: |")),
      at("flows/landing.yaml", flow.replace("check: order_ref IS NOT NULL", "check: |")),
      at("contracts/landing.shipments.yaml", contract.replace("- name: order_ref", "- name: |")),
      inFlow("sequence: placed", "sequence: |"),
      inFlow("cursor: placed", "cursor: | "),
      inFlow("order_by: [placed]", "order_by: [|]"),
      inFlow("        customer_email: { case: lower }", "        |"),
    ];
    expect(shown[0]!.map((item) => item.label)).toContain("shipments");
    for (const items of shown.slice(1))
      expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(columns.slice(0, 1)));
    for (const items of shown.slice(3, 6))
      expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(columns));
    const hovers = [
      hover("flows/landing.yaml", flow.replace("object: shipments", "object: |shipments")),
      hover("flows/landing.yaml", flow.replace("check: order_ref", "check: |order_ref")),
      hover("flows/landing.yaml", flow.replace("sequence: placed", "sequence: |placed")),
      hover(
        "contracts/landing.shipments.yaml",
        contract.replace("- name: order_ref", "- name: |order_ref"),
      ),
    ];
    const words = [...shown.map(everything), ...hovers].join("\n");
    for (const value of values) expect(words).not.toContain(value);
  });
});
