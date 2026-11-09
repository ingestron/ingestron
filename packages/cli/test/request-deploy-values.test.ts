// "Values to provide" names each deploy-time value as the packs' files take it, from
// building every environment as plan does (spec/cli/request.md).
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { fillStarter } from "./starters.js";

const supplied =
  "The pipeline that deploys the files supplies each one for each environment, under the names given";

/** A copy of an example, with each replacement made in project.yaml. */
function workspace(example: string, replacements: [string, string][] = []): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-request-deploy-"));
  cpSync(
    join(
      import.meta.dirname,
      example.startsWith("project-templates/") ? "../../core" : "..",
      example,
    ),
    folder,
    {
      recursive: true,
      filter: (path) => !path.includes("/build"),
    },
  );
  fillStarter(folder, example.split("/")[1]!);
  const project = join(folder, "project.yaml");
  let text = readFileSync(project, "utf8");
  for (const [from, to] of replacements) text = text.replace(from, to);
  writeFileSync(project, text);
  return folder;
}

function request(folder: string, environment: string): { code: number; output: string } {
  let output = "";
  const code = run(["request", "--env", environment], {
    cwd: folder,
    write: (text) => (output += text),
  });
  return { code, output };
}

describe("ingestron request and values supplied when deploying", () => {
  it("names a Databricks bundle variable, as BUNDLE_VAR_<name>, with the pack", () => {
    const folder = workspace("project-templates/retail", [
      ["storage_account: retailprod", "storage_account: ${envvar:RETAIL_ACCOUNT}"],
    ]);
    const { code, output } = request(folder, "prod");
    expect(code, output).toBe(0);
    expect(output).toContain(supplied);
    expect(output).toContain(
      "- `RETAIL_ACCOUNT`, used for `values.storage_account` in `project.yaml`: not set yet. The deploying pipeline supplies it as `BUNDLE_VAR_retail_account` (databricks).",
    );
    // dev holds no deploy-time value, so its request has no such section.
    expect(request(folder, "dev").output).not.toContain("## Values to provide");
  });

  it("names an ARM parameter, which is not an environment variable, for Data Factory", () => {
    const folder = workspace("project-templates/private-files");
    const platform = join(folder, "platform.yaml");
    const text = readFileSync(platform, "utf8");
    writeFileSync(platform, text.replace(/key_vault: .*/, "key_vault: ${envvar:STORES_VAULT}"));
    const { output } = request(folder, "prod");
    expect(output).toContain(
      "supplies it as `ls_stores_keyvault_properties_typeProperties_baseUrl` (adf).",
    );
  });

  it("lists a value a pack's files take that no variable gives, by the pack's own name", () => {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-request-deploy-"));
    const io = { cwd: folder, write: () => undefined };
    const args = ["--connector", "square", "--via", "adf-landing", "--yes"];
    expect(run(["init", "project", ...args], io)).toBe(0);
    const { output } = request(join(folder, "project"), "dev");
    expect(output).toContain(
      "- `ls_project_square_refreshToken` (adf): no environment variable gives it, so the pipeline that deploys the files supplies it for each environment.",
    );
    expect(output).not.toContain("These values come from environment variables.");
  });

  it("gives no names in an environment that runs on DuckDB, where variables are read when generating", () => {
    const folder = workspace("test/fixtures/duckdb-local", [
      ["published: ./published", "published: ${envvar:LAPTOP_PUBLISHED}"],
    ]);
    const { output } = request(folder, "local");
    expect(output).toContain(
      "- `LAPTOP_PUBLISHED`, used for `values.published` in `project.yaml`: not set yet.",
    );
    expect(output).not.toContain(supplied);
    expect(output).not.toContain("The deploying pipeline supplies");
    // Read when generating, so set where Ingestron runs.
    expect(output).toContain(
      "Set them in the pipeline that runs Ingestron for this environment, or in `.env.local` on your own computer, kept out of Git.",
    );
  });

  it("says to run plan, and names nothing, when generating every environment has problems", () => {
    const folder = workspace("project-templates/retail", [
      ["storage_account: retailprod", "storage_account: ${envvar:RETAIL_ACCOUNT}"],
    ]);
    // A mode supplied only when deploying cannot decide what is generated: DEPLOY_VALUE.
    const platform = join(folder, "platform.yaml");
    writeFileSync(platform, `${readFileSync(platform, "utf8")}mode: \${envvar:RETAIL_MODE}\n`);
    process.env.RETAIL_MODE = "production";
    let output: string;
    try {
      output = request(folder, "prod").output;
    } finally {
      delete process.env.RETAIL_MODE;
    }
    expect(output).toContain(
      "so the names they take them as are not shown. Run `ingestron plan` to see why.",
    );
    expect(output).not.toContain("BUNDLE_VAR_");
  });

  it("says to run plan only for an environment a pack building them together deploys", () => {
    // dev fails; test is deployed by ADF; lab reads a files connection, so only DuckDB has its tables.
    const folder = workspace("test/fixtures/duckdb-local", [
      [
        "  dev: {}\n",
        '  dev: { values: { key_vault: "not a vault" } }\n  test: {}\n  lab: { values: { source: shop } }\n',
      ],
      ["values:\n  landing:", "values:\n  source: erp\n  landing:"],
      [
        "  published: abfss://published@salesdev.dfs.core.windows.net",
        "  published: ${envvar:SALES_PUBLISHED}/published",
      ],
    ]);
    cpSync(
      join(import.meta.dirname, "../../core/project-templates/duckdb/connections/shop.yaml"),
      join(folder, "connections/shop.yaml"),
    );
    const flow = join(folder, "flows/erp.yaml");
    writeFileSync(
      flow,
      readFileSync(flow, "utf8").replace("source: erp", "source: ${values.source}"),
    );
    writeFileSync(join(folder, ".env.lab"), "SALES_PUBLISHED=./lab\n");
    const runPlan = "Run `ingestron plan` to see why.";
    expect(request(folder, "test").output).toContain(runPlan);
    const lab = request(folder, "lab").output;
    expect(lab).toContain(
      "- `SALES_PUBLISHED`, used for `values.published` in `project.yaml`: set in `.env.lab`.",
    );
    expect(lab).not.toContain(runPlan);
  });
});
