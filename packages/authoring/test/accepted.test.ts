// An accepted warning is not a mark: the Platform's accept list takes it out of the
// problems, as it does out of the CLI's, and a stale entry is marked in its place.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { problems } from "../src/diagnostics/diagnostics.js";
import { openProject } from "../src/project/project.js";

// The DuckDB starter warns that its notNull rule is not applied, as no layer lists `check`.
const starter = join(import.meta.dirname, "../../core/project-templates/duckdb");

/** A copy of the starter whose platform.yaml has `accept` appended. */
function accepting(entry: string): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-accept-"));
  cpSync(starter, folder, { recursive: true });
  const platform = join(folder, "platform.yaml");
  writeFileSync(platform, `${readFileSync(platform, "utf8")}accept:\n${entry}`);
  return folder;
}

const codes = (folder: string) =>
  problems(openProject(folder, new Map()), "dev").map((problem) => problem.code);

describe("accepted warnings", () => {
  it("are marked until an accept entry names them", () => {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-accept-"));
    cpSync(starter, folder, { recursive: true });
    expect(codes(folder)).toEqual(["NOT_APPLIED"]);
  });

  it("get no mark when the Platform accepts them", () => {
    const folder = accepting(
      "  - code: NOT_APPLIED\n    about: { feature: notNull }\n    reason: The nightly job checks it.\n",
    );
    expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
  });

  it("leave other warnings of the same code marked", () => {
    const folder = accepting(
      "  - code: NOT_APPLIED\n    about: { table: customer_totals }\n    reason: The nightly job checks it.\n",
    );
    expect(codes(folder)).toEqual(["NOT_APPLIED", "ACCEPT_UNUSED"]);
  });

  it("show an entry that accepts nothing, at the entry", () => {
    const folder = accepting("  - code: DEDUPLICATE_MODE\n    reason: Left over.\n");
    const found = problems(openProject(folder, new Map()), "dev");
    expect(found.map((problem) => problem.code)).toEqual(["NOT_APPLIED", "ACCEPT_UNUSED"]);
    expect(found[1]).toMatchObject({ file: "platform.yaml", severity: "warning" });
  });
});

describe("a role that no engine applies", () => {
  /** The starter with a role on its orders contract, and `accept` entries added when given. */
  function withRole(accept = ""): string {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-accept-"));
    cpSync(starter, folder, { recursive: true });
    const contract = join(folder, "contracts/orders.yaml");
    writeFileSync(
      contract,
      `${readFileSync(contract, "utf8")}roles:\n  - { role: marketing-analysts, access: read }\n`,
    );
    const platform = join(folder, "platform.yaml");
    writeFileSync(platform, `${readFileSync(platform, "utf8")}${accept}`);
    return folder;
  }
  const roleMarks = (folder: string) =>
    problems(openProject(folder, new Map()), "dev").filter((problem) =>
      problem.message.includes("marketing-analysts"),
    );

  it("is marked at the role's line", () => {
    expect(roleMarks(withRole())).toMatchObject([
      {
        file: "contracts/orders.yaml",
        code: "NOT_APPLIED",
        severity: "warning",
        range: { start: { line: 15 } },
      },
    ]);
  });

  it("is not marked when the Platform accepts its feature", () => {
    const folder = withRole(
      "accept:\n  - code: NOT_APPLIED\n    about: { feature: grants }\n    reason: The folder's permissions do it.\n",
    );
    expect(roleMarks(folder)).toEqual([]);
    // Only the notNull warning is left, and the entry is not stale.
    expect(codes(folder)).toEqual(["NOT_APPLIED"]);
  });
});
