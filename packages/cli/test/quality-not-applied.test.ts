// What the passport says is not applied (spec/cli/passport.md, "Quality"): read from each
// table's notApplied in the model, so a warning about several tables is never guessed at.
import { memoryFiles } from "@ingestron/config";
import { packs } from "@ingestron/core";
import { passports } from "@ingestron/core/internal";
import { loadDefinitions, resolveDefinitions } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { standInPacks } from "./outputs-packs.js";
import { qualityProject } from "./quality-projects.js";

describe("what the passport says is not applied", () => {
  const resolved = () =>
    loadDefinitions(qualityProject("duckdb"), {
      packs: [...packs],
      environment: "dev",
      environmentsTogether: true,
    }).model!;
  const lines = (page: string, heading: string) => {
    const start = page.indexOf(`#### \`${heading}\``);
    return page.slice(start, page.indexOf("\n#### ", start + 1)).split("\n");
  };

  it("leaves an operation the engine does not apply out of the column, and says why", () => {
    const model = resolved();
    const silver = model.tables.find((table) => table.name === "customers_clean")!;
    silver.notApplied = [{ feature: "cleanse.case", reason: "Its engine keeps the case." }];
    const page = lines(passports(model)["crm.md"]!, "crm.silver.customers_clean");
    expect(page).toContain("- `email`: spaces at either end removed; empty text becomes no value.");
    expect(page).toContain("- Changing case is not applied: Its engine keeps the case.");
  });

  it("leaves out only the conversions of the columns not converted", () => {
    const model = resolved();
    const silver = model.tables.find((table) => table.name === "customers_clean")!;
    silver.notApplied = [
      { feature: "cleanse.timezone", reason: "No zone for UTC here.", column: "contacted_at" },
    ];
    const page = lines(passports(model)["crm.md"]!, "crm.silver.customers_clean");
    expect(page.some((line) => line.startsWith("- `contacted_at`: converted"))).toBe(false);
    expect(page).toContain(
      "- `contacted_at`: time zone conversion is not applied: No zone for UTC here.",
    );
    expect(page).toContain("- `last_seen`: converted from Europe/London to UTC.");
    expect(page).toContain("- `updated_at`: converted from Europe/London to UTC.");
  });

  it("says not enforced only on the tables the method does not apply it on", () => {
    // Two tables kept by a method that does not count failing rows, and a third, of the same
    // contract and pack, kept by one that does: the warning about the two has no table.
    const files = {
      "project.yaml": 'id: retail\nenvironments: { dev: {} }\nimports: ["*.yaml"]\n',
      "standard.yaml":
        "apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [quality@1]\n",
      "source.yaml":
        "apiVersion: ingestron.io/v1\nkind: Connection\nid: source\nconnector: quality\nconnectivity: public\nsettings: {}\n",
      "uncounted.yaml":
        "apiVersion: ingestron.io/v1\nkind: Flow\nid: uncounted\nsource: source\nstore: { uses: quality-uncounted }\ntables:\n  orders: { object: orders, contract: orders }\n  returns: { object: returns, contract: orders }\n",
      "counted.yaml":
        "apiVersion: ingestron.io/v1\nkind: Flow\nid: counted\nsource: source\ntables:\n  refunds: { object: refunds, contract: orders }\n",
      "orders.odcs.yaml":
        "apiVersion: v3.1.0\nkind: DataContract\nid: orders\nversion: 1.0.0\nstatus: draft\nschema:\n  - name: orders\n    logicalType: object\n    properties:\n      - { name: id, logicalType: integer, required: true, primaryKey: true }\n",
      "sales.product.yaml":
        "apiVersion: v1.1.0\nkind: DataProduct\nid: sales\nstatus: active\noutputPorts:\n  - { name: orders, contractId: orders }\n",
    };
    const result = resolveDefinitions(memoryFiles(files), {
      packs: standInPacks,
      environment: "dev",
    });
    const warning = result.diagnostics.find((item) => item.code === "NOT_APPLIED");
    expect(warning?.subject).toEqual({ feature: "warn" });
    const page = passports(result.model!)["sales.md"]!;
    const check = (table: string) =>
      lines(page, `dev.bronze.${table}`).find((line) => line.startsWith("- `id_not_null`:"));
    expect(check("orders")).toContain("Not enforced: A failing row is not counted yet.");
    expect(check("returns")).toContain("Not enforced: A failing row is not counted yet.");
    expect(check("refunds")).not.toContain("Not enforced");
  });
});
