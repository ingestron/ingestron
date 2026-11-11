// ingestron request: capabilities are per pack (spec/cli/request.md, "Switched on"). A pack's
// capability is on from its own section, and a pack that keeps no table adds nothing.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { accessProject } from "./access-projects.js";

/** What `ingestron request --env dev` prints in the folder. */
function request(folder: string): string {
  let output = "";
  const code = run(["request", "--env", "dev"], { cwd: folder, write: (text) => (output += text) });
  expect(code, output).toBe(0);
  return output;
}

/** The Synapse views fixture, with a contract role, and `section` added to its Platform. */
function synapseProject(section: string): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-request-synapse-"));
  cpSync(join(import.meta.dirname, "fixtures/synapse-views"), folder, { recursive: true });
  const contract = join(folder, "contracts/customers.yaml");
  writeFileSync(
    contract,
    `${readFileSync(contract, "utf8")}roles:\n  - { role: analysts, access: read }\n`,
  );
  const platform = join(folder, "platform.yaml");
  writeFileSync(
    platform,
    `${readFileSync(platform, "utf8")}principals:\n  analysts: reporting-readers\n${section}`,
  );
  return folder;
}

describe("a project's capabilities, in the request", () => {
  it("lists a Databricks-only project's grants once, and none of Synapse's", () => {
    const text = request(accessProject("databricks"));
    expect(text).toContain("### Grants (`manage.grants`)");
    expect(text).not.toContain("synapse.manage");
    expect(text).not.toContain("views.sql");
    expect(text.match(/^### Grants/gm)).toHaveLength(1);
  });

  it("lists Synapse's grants when its own section turns them on", () => {
    const text = request(synapseProject("synapse:\n  manage: { grants: true }\n"));
    expect(text).toContain("## Switched on");
    expect(text).toContain("### Grants (`synapse.manage.grants`)");
    expect(text).not.toContain("## Used by the definitions, but switched off");
  });

  it("does not take Synapse's grants as on from manage at the top", () => {
    const text = request(synapseProject("manage: { grants: true }\n"));
    expect(text).not.toContain("### Grants");
  });

  it("names Synapse's capability as its own when the definitions use it while it is off", () => {
    const text = request(synapseProject(""));
    expect(text).toContain("## Used by the definitions, but switched off");
    expect(text).toMatch(/^- Grants \(`synapse\.manage\.grants`\): /m);
    expect(text).not.toContain("(`manage.grants`)");
  });
});
