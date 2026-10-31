// What to ask of whoever runs the data platform, for one environment.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { platformRequest } from "../src/platform-request.js";
import { openProject } from "../src/project.js";

const templates = join(import.meta.dirname, "../../cli/project-templates");
const fixtures = join(import.meta.dirname, "../../cli/test/fixtures");

describe("platformRequest", () => {
  it("names the identity, what each switch on needs, and the SQL to run", () => {
    const request = platformRequest(
      openProject(join(fixtures, "platform-setup"), new Map()),
      "dev",
    );
    expect(request).toMatch(/^# Platform request: hr \(dev\)\n/);
    expect(request).toContain("`0b6c3d2e-0000-4000-8000-000000000007`");
    expect(request).toContain("### Managed schemas (`manage.schemas`)");
    expect(request).toContain("- USE CATALOG and CREATE SCHEMA on each catalog");
    expect(request).toContain("```sql\n");
    expect(request).toContain("GRANT USE CATALOG, CREATE SCHEMA ON CATALOG `hr_dev`");
  });

  it("lists features the definitions use while the platform has them off", () => {
    const folder = join(templates, "private-sql-server");
    const contract = join(folder, "contracts/customers.yaml");
    const text = readFileSync(contract, "utf8").replace(
      "{ name: name, logicalType: string }",
      "{ name: name, logicalType: string, unique: true }",
    );
    const request = platformRequest(openProject(folder, new Map([[contract, text]])), "dev");
    expect(request).toContain("## Used by the definitions, but switched off");
    expect(request).toContain("- Table checks (`manage.checks`): unique in contract");
  });

  it("lists the shared infrastructure the methods expect, never a secret", () => {
    const request = platformRequest(
      openProject(join(templates, "private-sql-server"), new Map()),
      "dev",
    );
    expect(request).toContain("## Shared infrastructure");
    expect(request).toContain("- `adf-copy` `integration_runtime`: `shir-erp`");
    expect(request).not.toMatch(/password/i);
  });
});
