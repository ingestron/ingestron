// ingestron contract --from-metadata (spec/cli/sources.md, section 6), run on a copy of the
// drafting conformance project.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixture, sourceProject } from "./source-projects.js";

const read = (folder: string, file: string) => readFileSync(join(folder, file), "utf8");
const expected = (name: string) => read(fixture("drafts"), `expected/${name}`);

describe("ingestron contract --from-metadata", () => {
  it("writes the draft of a named table and prints the line to add", () => {
    const { folder, ingestron } = sourceProject("drafts");
    const { code, output } = ingestron(
      "contract",
      "--from-metadata",
      "sales.orders",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(read(folder, "contracts/erp.orders.yaml")).toBe(expected("erp.orders.yaml"));
    expect(output).toBe(
      "Wrote contracts/erp.orders.yaml.\nAdd to sales.orders: contract: erp.orders\n",
    );
  });

  it("writes several tables in the order given, all the Wrote lines before the Add lines", () => {
    const { folder, ingestron } = sourceProject("drafts");
    const { code, output } = ingestron(
      "contract",
      "--from-metadata",
      "landing.events",
      "sales.orders",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(read(folder, "contracts/landing.events.yaml")).toBe(expected("landing.events.yaml"));
    expect(output).toBe(
      [
        "Wrote contracts/landing.events.yaml.",
        "Wrote contracts/erp.orders.yaml.",
        "Add to landing.events: contract: landing.events",
        "Add to sales.orders: contract: erp.orders",
        "",
      ].join("\n"),
    );
  });

  it("with --needed writes the drafts, names a table with no entry, and exits 1; a second run skips them", () => {
    const { folder, ingestron } = sourceProject("drafts");
    const first = ingestron("contract", "--from-metadata", "--needed", "--env", "dev");
    expect(first.code).toBe(1);
    expect(read(folder, "contracts/erp.orders.yaml")).toBe(expected("erp.orders.yaml"));
    expect(first.output).toBe(
      [
        "Wrote contracts/erp.orders.yaml.",
        "Add to sales.orders: contract: erp.orders",
        '"sales.returns" needs a contract but has no entry in the source metadata of "erp"; import it first (ingestron source request says how).',
        "",
      ].join("\n"),
    );
    const edited = `${read(folder, "contracts/erp.orders.yaml")}# edited\n`;
    writeFileSync(join(folder, "contracts/erp.orders.yaml"), edited);
    const second = ingestron("contract", "--from-metadata", "--needed", "--env", "dev");
    expect(read(folder, "contracts/erp.orders.yaml")).toBe(edited);
    expect(second.output).toBe(
      [
        "Skipped contracts/erp.orders.yaml: it already exists.",
        "Add to sales.orders: contract: erp.orders",
        '"sales.returns" needs a contract but has no entry in the source metadata of "erp"; import it first (ingestron source request says how).',
        "",
      ].join("\n"),
    );
  });

  it("exits 0 when a skipped file is the only thing to say", () => {
    const { ingestron } = sourceProject("drafts");
    ingestron("contract", "--from-metadata", "sales.orders", "--env", "dev");
    const { code, output } = ingestron(
      "contract",
      "--from-metadata",
      "sales.orders",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(output).toBe(
      "Skipped contracts/erp.orders.yaml: it already exists.\nAdd to sales.orders: contract: erp.orders\n",
    );
  });

  it("prints each problem, writes the other drafts and exits 1", () => {
    const { folder, ingestron } = sourceProject("drafts");
    const { code, output } = ingestron(
      "contract",
      "--from-metadata",
      "sales.nope",
      "sales.orders",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      [
        "Wrote contracts/erp.orders.yaml.",
        "Add to sales.orders: contract: erp.orders",
        '"sales.nope" is not a flow table. Flow tables: landing.events, sales.orders, sales.invoices, sales.returns.',
        "",
      ].join("\n"),
    );
    expect(existsSync(join(folder, "contracts/erp.orders.yaml"))).toBe(true);
  });

  it("says when no table needs a contract drafted", () => {
    const { folder, ingestron } = sourceProject("drafts");
    const flow = join(folder, "flows/sales.yaml");
    writeFileSync(flow, read(folder, "flows/sales.yaml").replace("layer: silver", "layer: bronze"));
    const { code, output } = ingestron("contract", "--from-metadata", "--needed", "--env", "dev");
    expect(code).toBe(0);
    expect(output).toBe("No table needs a contract drafted.\n");
  });

  it.each([
    [["contract", "--from-metadata"]],
    [["contract", "--from-metadata", "--needed", "sales.orders"]],
    [["contract", "--from-metadata", "--needed", "--env", "dev", "--env", "prod"]],
  ])("%j is a usage mistake: exit 2", (args) => {
    const { code, output } = sourceProject("drafts").ingestron(...args);
    expect(code).toBe(2);
    expect(output).toContain("Usage: ingestron");
  });
});
