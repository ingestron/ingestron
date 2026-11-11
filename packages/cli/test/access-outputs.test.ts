// What a project with access shows, one route per engine: plan's and check's warnings, with
// what is not applied under its own heading (spec/cli/outputs.md, section 1), and the
// passport's "Who may use it" (spec/cli/passport.md, "Access").
import { nodeFiles } from "@ingestron/config";
import { generatedOutputs } from "@ingestron/core";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { accessProject, type AccessEngine } from "./access-projects.js";

/** What `ingestron <args>` prints in the folder, and its exit code. */
function ingestron(folder: string, ...args: string[]): { code: number; output: string } {
  let output = "";
  const code = run([...args, "--definitions", ".", "--out", "build"], {
    cwd: folder,
    write: (text) => (output += text),
  });
  return { code, output };
}

/** One section of the product's passport in dev, as plan writes it. */
function section(folder: string, heading: string): string {
  const products = generatedOutputs(nodeFiles(folder)).outputs.find(
    (output) => output.name === "products",
  );
  const page = products!.files["dev/crm.md"]!;
  const start = page.indexOf(`## ${heading}\n`);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The masks' warnings accepted, as a team using DuckDB on synthetic data would. */
const acceptMasks = (files: Record<string, string>) => {
  files["platform.yaml"] +=
    "accept:\n  - code: NOT_APPLIED\n    about: { feature: masks }\n    reason: Synthetic data on a laptop; the shared platform masks it.\n";
};

describe.each<AccessEngine>(["databricks", "duckdb"])("a project with access on %s", (engine) => {
  it("plans, with what is not applied under its own heading", () => {
    const { code, output } = ingestron(accessProject(engine), "plan", "--no-diff");
    expect(code, output).toBe(0);
    expect(output).toMatchSnapshot();
  });

  it("says in its passport who may use it, and what is enforced where", () => {
    expect(section(accessProject(engine), "Who may use it")).toMatchSnapshot();
  });

  it("tags classified columns only where the engine that keeps the table tags them", () => {
    const tagged = section(accessProject(engine), "Columns").includes("tagged in Unity Catalog");
    expect(tagged).toBe(engine === "databricks");
  });
});

describe("access that is not applied", () => {
  it("is listed under its heading by plan and check, and never fails them", () => {
    const folder = accessProject("duckdb");
    const plan = ingestron(folder, "plan", "--no-diff");
    expect(plan.code, plan.output).toBe(0);
    expect(ingestron(folder, "apply", "--no-diff").code).toBe(0);
    const check = ingestron(folder, "check");
    expect(check.code, check.output).toBe(0);
    for (const { output } of [plan, check]) {
      const heading = output.indexOf("Not applied on this platform\n");
      expect(heading, output).toBeGreaterThan(-1);
      for (const what of [
        'Access for the role "marketing-analysts"',
        'Access for the role "data-engineers"',
        'The "hash" mask on "email"',
        'The filter "region_rows"',
      ])
        expect(output.indexOf(what), what).toBeGreaterThan(heading);
    }
  });

  it("is still not enforced in the passport when accepted, and counted in one line", () => {
    const folder = accessProject("duckdb", acceptMasks);
    const { code, output } = ingestron(folder, "plan", "--no-diff");
    expect(code, output).toBe(0);
    expect(output).not.toContain('The "hash" mask on "email"');
    expect(output).toContain("\n1 accepted warning (platform.yaml)\n");
    expect(output).toContain('Access for the role "marketing-analysts"');
    const accepted = section(folder, "Who may use it");
    expect(accepted).toContain(
      "Masked columns:\n\n- `email` (confidential): hashed. Not enforced on DuckDB: DuckDB has no access control.\n",
    );
    expect(accepted).toBe(section(accessProject("duckdb"), "Who may use it"));
  });

  it("is not enforced where the platform has its switch off, for the pack that keeps the table", () => {
    const folder = accessProject("databricks", (files) => {
      files["platform.yaml"] = files["platform.yaml"]!.replace(
        "manage: { tags: true, grants: true, masks: true, filters: true }",
        "manage: { tags: true, grants: true }",
      );
    });
    const { code, output } = ingestron(folder, "plan", "--no-diff");
    expect(code, output).toBe(0);
    expect(output).toContain("CAPABILITY_OFF");
    const access = section(folder, "Who may use it");
    expect(access).toContain("| Granted on Databricks. |");
    expect(access).toContain(
      "- `email` (confidential): hashed. Not enforced on Databricks: the platform has column masks off.",
    );
    expect(access).toContain(
      "from `country`. Not enforced on Databricks: the platform has row filters off.",
    );
  });
});
