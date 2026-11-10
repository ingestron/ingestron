// Hover and completion cover the fields quality and cleansing add: each says what it does,
// and a value a team looks up (a source's time zone) says where to find it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/assist/completion.js";
import { hoverAt } from "../src/hover/hover.js";
import { replaceMeHelp } from "../src/hover/replace-me.js";
import { openProject } from "../src/project/project.js";
import { filledTemplates } from "./starters.js";

const retail = join(filledTemplates, "retail");
const read = (file: string) => readFileSync(join(retail, file), "utf8");

/** The project with `text` as `file`, and the hover at the first `needle` in it. */
function hover(file: string, text: string, needle: string, plus = 1): string | undefined {
  const project = openProject(retail, new Map([[join(retail, file), text]]));
  return hoverAt(project, file, text, text.indexOf(needle) + plus, "dev");
}

describe("hover on the fields quality and cleansing add", () => {
  const standard = `${read("standard.yaml")}layers:
  - name: silver
    does: [cleanse, check]
    quality: { quarantine: true, results: true }
quality:
  quarantine: true
  results: true
cleanse:
  columns: {}
accept: []
`;
  const connection = read("connections/shop.yaml");

  it("explains a layer's does", () => {
    expect(hover("standard.yaml", standard, "does:", 1)).toMatch(/duties/i);
  });

  it("explains a standard's quarantine and results", () => {
    expect(hover("standard.yaml", standard, "quarantine: true\n  results", 2)).toContain(
      "`<table>_quarantine`",
    );
    expect(hover("standard.yaml", standard, "results: true\ncleanse", 2)).toContain(
      "results of the checks",
    );
  });

  it("explains a layer's quarantine", () => {
    expect(hover("standard.yaml", standard, "quarantine: true, results", 2)).toContain(
      "`<table>_quarantine`",
    );
  });

  it("explains a standard's cleanse", () => {
    expect(hover("standard.yaml", standard, "cleanse:\n  columns", 2)).toContain("Cleansing");
  });

  it("explains a connection's timezone", () => {
    const text = `${connection}timezone: Europe/London\n`;
    expect(hover("connections/shop.yaml", text, "timezone:", 2)).toContain("time zone");
  });

  it("says where to find a REPLACE_ME connection time zone", () => {
    const text = `${connection}timezone: REPLACE_ME\n`;
    const project = openProject(retail, new Map([[join(retail, "connections/shop.yaml"), text]]));
    const help = replaceMeHelp(project, "connections/shop.yaml", "/timezone", "dev");
    expect(help?.field).toBe("timezone");
    expect(help?.find).toMatch(/source/i);
    expect(help?.suggest).toBeDefined();
  });
});

describe("hover on the table, transform and platform fields", () => {
  const duck = join(filledTemplates, "duckdb");
  const at = (file: string, text: string, needle: string, plus = 2) => {
    const project = openProject(duck, new Map([[join(duck, file), text]]));
    return hoverAt(project, file, text, text.indexOf(needle) + plus, "dev");
  };
  const readDuck = (file: string) => readFileSync(join(duck, file), "utf8");

  it("explains a table's cleanse, its quarantine and its column time zone", () => {
    const flow = `${readDuck("flows/orders.yaml").replace(
      "contract: shop.orders }",
      "contract: shop.orders, quality: { quarantine: true }, cleanse: { columns: { ordered_at: { timezone: { from: Europe/London, to: UTC } } } } }",
    )}`;
    expect(at("flows/orders.yaml", flow, "cleanse:")).toContain("Cleansing for this table");
    expect(at("flows/orders.yaml", flow, "quarantine:")).toContain("`<table>_quarantine`");
    expect(at("flows/orders.yaml", flow, "timezone:")).toContain("Converts a timestamp column");
    expect(at("flows/orders.yaml", flow, "from:")).toContain("The zone the column is in");
  });

  it("explains a transform's code and its cleanse", () => {
    const transform = `${readDuck("transforms/customer_totals.yaml")}cleanse: { deduplicate: { order_by: [orders] } }\nquality: { results: true }\n`;
    expect(at("transforms/customer_totals.yaml", transform, "code:")).toContain(
      "{{ tables.orders }}",
    );
    expect(at("transforms/customer_totals.yaml", transform, "cleanse:")).toContain("Cleansing");
    expect(at("transforms/customer_totals.yaml", transform, "results:")).toContain(
      "results of this table's checks",
    );
  });

  it("explains the platform's accept list, its entries and their reason", () => {
    const platform = `${readDuck("platform.yaml")}accept:\n  - code: NOT_APPLIED\n    about: { feature: notNull }\n    reason: Checked in CI.\n`;
    expect(at("platform.yaml", platform, "accept:")).toContain("Warnings the platform team");
    expect(at("platform.yaml", platform, "feature:")).toContain("What is not applied");
    expect(at("platform.yaml", platform, "reason:")).toContain("Why the warning is accepted");
  });
});

describe("completion of the fields quality and cleansing add", () => {
  /** Completions where `|` is in the edited retail standard. */
  const inStandard = (extra: string) => {
    const marked = `${read("standard.yaml")}${extra}`;
    const text = marked.replace("|", "");
    const project = openProject(retail, new Map([[join(retail, "standard.yaml"), text]]));
    return completionsAt(project, "standard.yaml", text, marked.indexOf("|"), "dev");
  };
  const labels = (items: { label: string }[]) => items.map((item) => item.label);

  it("offers the duties a layer may do", () => {
    const items = inStandard("layers:\n  - name: silver\n    does: [|]\n");
    expect(labels(items)).toEqual(
      expect.arrayContaining(["cleanse", "deduplicate", "check", "quarantine"]),
    );
  });

  it("offers a layer's quality settings, with what each does", () => {
    const items = inStandard("layers:\n  - name: silver\n    quality:\n      |\n");
    expect(labels(items)).toEqual(expect.arrayContaining(["quarantine", "results"]));
    const quarantine = items.find((item) => item.label === "quarantine");
    expect(JSON.stringify(quarantine)).toContain("_quarantine");
  });

  it("offers the cleansing a standard gives, and leaves out a duty already written", () => {
    expect(labels(inStandard("cleanse:\n  |\n"))).toEqual(
      expect.arrayContaining(["text", "timestamps"]),
    );
    const more = inStandard("layers:\n  - name: silver\n    does: [cleanse, |]\n");
    expect(labels(more)).toEqual(["deduplicate", "check", "quarantine"]);
  });

  it("describes each duty", () => {
    const items = inStandard("layers:\n  - name: silver\n    does: [|]\n");
    const check = items.find((item) => item.label === "check");
    expect(check?.documentation).toContain("Check rows");
  });

  it("offers the cleansing operations of a table's column", () => {
    const duck = join(filledTemplates, "duckdb");
    const flow = readFileSync(join(duck, "flows/orders.yaml"), "utf8").replace(
      "  orders: { object: orders.csv, contract: shop.orders }\n",
      "  orders:\n    object: orders.csv\n    contract: shop.orders\n    cleanse:\n      columns:\n        customer:\n          |\n",
    );
    const marked = flow;
    const text = marked.replace("|", "");
    const project = openProject(duck, new Map([[join(duck, "flows/orders.yaml"), text]]));
    const items = completionsAt(project, "flows/orders.yaml", text, marked.indexOf("|"), "dev");
    expect(labels(items)).toEqual(
      expect.arrayContaining(["timezone", "trim", "empty", "map", "case", "default"]),
    );
  });
});
