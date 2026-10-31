// One action fixes every problem of a kind in the project, with edits that
// several problems share made once.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixAll } from "../src/fix-all.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");
const unique = (file: string, column: string) =>
  readFileSync(join(retail, file), "utf8").replace(
    `{ name: ${column}, logicalType: integer, required: true, primaryKey: true }`,
    `{ name: ${column}, logicalType: integer, required: true, primaryKey: true, unique: true }`,
  );

describe("fixAll", () => {
  it("fixes every problem of the code at once, making a shared edit once", () => {
    const open = new Map([
      [join(retail, "contracts/orders.yaml"), unique("contracts/orders.yaml", "id")],
      [join(retail, "contracts/customers.yaml"), unique("contracts/customers.yaml", "id")],
    ]);
    const project = openProject(retail, open);
    const [fix] = fixAll(project, "dev", "CAPABILITY_OFF");
    expect(fix?.title).toBe("Fix all 2 CAPABILITY_OFF problems");
    expect(fix?.edits).toHaveLength(1);
    expect(fix?.edits[0]?.file).toBe("platform.yaml");
  });

  it("offers nothing for a single problem", () => {
    const open = new Map([
      [join(retail, "contracts/orders.yaml"), unique("contracts/orders.yaml", "id")],
    ]);
    expect(fixAll(openProject(retail, open), "dev", "CAPABILITY_OFF")).toEqual([]);
  });
});
