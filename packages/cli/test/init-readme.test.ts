// What a new project's README.md tells the reader, and that following it works
// (spec/cli/projects.md, "README.md").
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

function created(...flags: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "ingestron-init-readme-"));
  const ingestron = (...args: string[]) => {
    let output = "";
    const code = run(args, { cwd, write: (text) => (output += text) });
    return { code, output };
  };
  const made = ingestron("init", "sales", ...flags, "--yes");
  expect(made.code, made.output).toBe(0);
  const path = (file: string) => join(cwd, "sales", file);
  const read = (file: string) => readFileSync(path(file), "utf8");
  return { ingestron, read, path, readme: read("README.md"), output: made.output };
}

const adf = ["--connector", "sqlserver", "--connectivity", "private", "--via", "adf-databricks"];

describe("README.md on a route through Data Factory", () => {
  it("keeps the storage account and Key Vault in project.yaml, which become parameters", () => {
    const { ingestron, read, path, readme } = created(...adf);
    expect(readme).toContain(
      "The storage account and Key Vault are written for each environment in `project.yaml`",
    );
    expect(readme).toContain("keep the storage account and Key Vault in `project.yaml`");
    // Following it: each environment's own values, written where README.md says.
    const project = ["salesdev", "kv-sales-dev", "salesprod", "kv-sales-prod"].reduce(
      (text, value) => text.replace(/(storage_account|key_vault): REPLACE_ME/, `$1: ${value}`),
      read("project.yaml"),
    );
    writeFileSync(path("project.yaml"), project);
    const plan = ingestron("plan", "--definitions", "sales", "--out", "sales/build");
    expect(plan.code, plan.output).toBe(0);
    expect(plan.output).not.toContain("DEPLOY_VALUE");
    expect(plan.output).not.toContain("storage_account is still REPLACE_ME");
    const applied = ingestron("apply", "--definitions", "sales", "--out", "sales/build");
    expect(applied.code, applied.output).toBe(0);
    expect(read("build/adf/parameters/prod.json")).toContain("salesprod");
    expect(read("build/adf/parameters/prod.json")).toContain("kv-sales-prod");
  });

  it("gives Data Factory's deploy steps that work as written, first, with their placeholders", () => {
    const { readme } = created(...adf);
    const deploy = readme.slice(readme.indexOf("## Deploy"));
    expect(deploy.indexOf("### adf")).toBeLessThan(deploy.indexOf("### databricks"));
    expect(deploy).toContain('"@microsoft/azure-data-factory-utilities": "1.0.3"');
    expect(deploy).toContain("```sh\nnpm install\nnpm run build export build/adf/factory");
    expect(deploy).toContain(
      "`az login` (for the deployment):\n\n```powershell\n./arm/PrePostDeploymentScript.ps1",
    );
    expect(deploy).toContain("`<group>` and `<factory>` are each environment's");
    expect(deploy).toContain("https://docs.ingestron.io/docs/platforms/adf-deploy");
    expect(deploy).toContain("databricks bundle deploy -t <environment>");
    expect(deploy).toContain("sign in to each environment's workspace");
  });

  it("says how to sign in for the PowerShell step and the deployment", () => {
    const { readme } = created(...adf);
    expect(readme).toContain("in PowerShell 7 with the Az modules");
    expect(readme).toContain("`Connect-AzAccount` (for the script) and `az login`");
  });

  it("keeps the export's folders out of Git, and a .gitignore already there gains only what it lacks", () => {
    const fresh = created(...adf);
    expect(fresh.read(".gitignore")).toMatch(/\nnode_modules\/\ndownloads\/\narm\/\n/);
    expect(fresh.readme).toContain("which `.gitignore` keeps out of Git");
    const cwd = mkdtempSync(join(tmpdir(), "ingestron-init-readme-"));
    writeFileSync(join(cwd, ".gitignore"), "node_modules/\n*.log\n");
    let output = "";
    const code = run(["init", ".", ...adf, "--yes"], { cwd, write: (text) => (output += text) });
    expect(code, output).toBe(0);
    const lines = readFileSync(join(cwd, ".gitignore"), "utf8").split("\n");
    expect(lines.slice(0, 2)).toEqual(["node_modules/", "*.log"]);
    expect(lines.filter((line) => line === "node_modules/")).toHaveLength(1);
    expect(lines).toEqual(expect.arrayContaining(["downloads/", "arm/"]));
    expect(output).toContain("added downloads/, arm/ and the .env lines to .gitignore");
    const direct = [
      "--connector",
      "sqlserver",
      "--connectivity",
      "workspace",
      "--via",
      "databricks",
    ];
    expect(created(...direct).read(".gitignore")).not.toContain("downloads/");
  });

  it("writes a Databricks schedule that reads what Data Factory lands, with its comment", () => {
    const { read } = created(...adf);
    expect(read("platform.yaml")).toContain(
      "# Databricks refreshes hourly, at half past, to read the files Data Factory lands\nschedule: {cron: 0 30 * * * ?, timezone: UTC}\n",
    );
  });

  it("counts the README's rows, by name, once", () => {
    const { output, readme } = created(...adf);
    const start = readme.indexOf("## Values to replace");
    const rows = readme
      .slice(start, readme.indexOf("\n## ", start + 1))
      .split("\n")
      .filter((line) => line.startsWith("| `"));
    expect(output).toMatch(
      new RegExp(`\n${rows.length} values are still REPLACE_ME: README.md lists each one`),
    );
    expect(output).not.toContain("ingestron check fails until each is written");
  });
});

describe("Values to check", () => {
  it("lists an example's value that nothing warns about, and where to find the real one", () => {
    const hive = ["--connector", "hive", "--connectivity", "private", "--via", "adf-landing"];
    const { read, readme } = created(...hive);
    expect(read("connections/hive.yaml")).toContain(
      "  # Source TCP port; the example's value, check it\n  port: ",
    );
    const section = readme.slice(readme.indexOf("## Values to check"));
    expect(section).toMatch(
      /\| `source_port` \| `connections\/hive\.yaml:\d+` \| Source TCP port \|/,
    );
    expect(section).toMatch(/\| `source_transport` \|/);
  });

  it("leaves out optional settings, never writing REPLACE_ME for them", () => {
    const rest = ["--connector", "rest", "--connectivity", "public", "--via", "adf-landing"];
    const { read } = created(...rest);
    const connection = read("connections/rest.yaml");
    expect(connection).not.toContain("scope");
    expect(connection).not.toContain("authentication");
    expect(read("flows/rest.yaml")).not.toContain("REPLACE_ME\n      request_body");
  });

  it("keeps a source option the connector needs, as REPLACE_ME", () => {
    const snowflake = [
      "--connector",
      "snowflake",
      "--connectivity",
      "private",
      "--via",
      "adf-landing",
    ];
    const { read } = created(...snowflake);
    expect(read("flows/snowflake.yaml")).toMatch(/\n {6}staging_path: REPLACE_ME\n/);
  });
});

describe("Secrets to create", () => {
  it("says what each secret holds, without saying it is a Key Vault secret twice", () => {
    const snowflake = [
      "--connector",
      "snowflake",
      "--connectivity",
      "private",
      "--via",
      "adf-landing",
    ];
    const { read, readme } = created(...snowflake);
    expect(read("connections/snowflake.yaml")).not.toMatch(/# Key Vault secret: [a-z][A-Z]/);
    const secrets = readme.slice(
      readme.indexOf("## Secrets to create"),
      readme.indexOf("## Deploy"),
    );
    expect(secrets).not.toMatch(/Key Vault secret holding|in Key Vault \||as a Key Vault secret/);
    expect(secrets).toContain("Objects, Secrets, + Generate/Import");
  });

  it("says there is none for a Unity Catalog connection", () => {
    const sf = ["--connector", "salesforce", "--connectivity", "public", "--via", "databricks"];
    expect(created(...sf).readme).toContain(
      "## Secrets to create\n\nNone: no connection here names a Key Vault secret.",
    );
  });
});
