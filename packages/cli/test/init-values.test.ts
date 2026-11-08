// What init writes in place of questions: --set by name, refusals before anything is
// written, the user's README.md kept, and comments kept (spec/cli/projects.md).
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { run } from "../src/index.js";

function session() {
  const cwd = mkdtempSync(join(tmpdir(), "ingestron-init-values-"));
  const ingestron = (...args: string[]) => {
    let output = "";
    const code = run(args, {
      cwd,
      write: (text) => (output += text),
      now: () => new Date("2026-11-04T09:00:00Z"),
    });
    return { code, output };
  };
  const read = (path: string) => readFileSync(join(cwd, path), "utf8");
  return { cwd, ingestron, read };
}

const sqlserver = [
  "--connector",
  "sqlserver",
  "--connectivity",
  "private",
  "--via",
  "adf-databricks",
];

describe("--set", () => {
  it("writes a name at every location, and an environment's name at that environment's only", () => {
    const { ingestron, read } = session();
    const set = ["--set", "storage_account=salesdev", "--set", "prod.storage_account=salesprod"];
    const more = ["--set", "source_server=sql01.corp.example", "--set", "key_vault=kv-sales"];
    const { code, output } = ingestron("init", "sales", ...sqlserver, ...set, ...more, "--yes");
    expect(code, output).toBe(0);
    const project = parse(read("sales/project.yaml"));
    expect(project.environments.dev.values).toEqual({
      storage_account: "salesdev",
      key_vault: "kv-sales",
    });
    expect(project.environments.prod.values).toEqual({
      storage_account: "salesprod",
      key_vault: "kv-sales",
    });
    expect(read("sales/connections/sqlserver.yaml")).toContain(
      "  # The host name the integration runtime reaches\n  server: sql01.corp.example\n",
    );
    expect(output).toMatch(/3 values are still REPLACE_ME: README.md lists each one/);
  });

  it("writes a number where the example has one", () => {
    const { ingestron, read } = session();
    const args = ["--connector", "hive", "--connectivity", "private", "--via", "adf-landing"];
    expect(ingestron("init", "p", ...args, "--set", "source_port=6543", "--yes").code).toBe(0);
    expect(parse(read("p/connections/hive.yaml")).settings.port).toBe(6543);
  });

  it.each([
    [
      "landing=abfss://landing@lake.dfs.core.windows.net/sales",
      "--set landing: landing is composed from the storage account now. Write --set storage_account=<the account's name>.",
    ],
    [
      "key_vault=https://kv-sales.vault.azure.net",
      "--set key_vault=https://kv-sales.vault.azure.net: write the Key Vault's name, such as kv-sales, not its URL; the platform composes the URL.",
    ],
    [
      "prod.source_server=sql02",
      "--set prod.source_server: source_server is written once, for every environment. Write --set source_server=…, then give prod its own value in project.yaml under environments.prod.values.",
    ],
    [
      "qa.storage_account=x",
      '--set qa.storage_account: the project has no environment "qa". It has: dev, prod.',
    ],
    [
      "server=sql01",
      '--set server: this project has no value "server". It has: source_server, source_user, source_password, sqlserver_records_object, integration_runtime, storage_account, key_vault.',
    ],
  ])("refuses %s before writing anything", (given, message) => {
    const { cwd, ingestron } = session();
    const { code, output } = ingestron("init", "sales", ...sqlserver, "--set", given, "--yes");
    expect(code).toBe(1);
    expect(output).toBe(`${message}\n`);
    expect(existsSync(join(cwd, "sales"))).toBe(false);
  });
});

describe("README.md", () => {
  it("is kept when the folder has one, and init prints the values to replace instead", () => {
    const { cwd, ingestron, read } = session();
    writeFileSync(join(cwd, "README.md"), "# Our sales data\n");
    const { code, output } = ingestron("init", ".", ...sqlserver, "--yes");
    expect(code, output).toBe(0);
    expect(read("README.md")).toBe("# Our sales data\n");
    expect(output).toContain(
      "6 values are still REPLACE_ME (README.md was already there, so it is kept):\n",
    );
    expect(output).toContain("    Where to find it: Azure portal: Key vaults; the vault's name\n");
    expect(output).toMatch(
      /Secrets to create in the Key Vault:\n {2}[\w-]+-sqlserver-password {2}The login password/,
    );
    // project.yaml does not send the reader to a README.md that is not Ingestron's.
    expect(read("project.yaml")).not.toContain("README.md");
    expect(output).toContain(
      "  source_server  connections/sqlserver.yaml:8  The host name the integration runtime reaches\n",
    );
    expect(output).toMatch(
      / {2}storage_account {2}project\.yaml:\d+, project\.yaml:\d+ {2}Storage account/,
    );
  });

  it("says there is nothing to replace for the DuckDB starter", () => {
    const { ingestron, read } = session();
    const { output } = ingestron("init", "local", "--template", "duckdb", "--yes");
    expect(output).toMatch(/Nothing to replace: the project runs as written.\n$/);
    expect(read("local/README.md")).toContain(
      "Nothing to replace: this project runs on this computer.",
    );
  });
});

describe("comments", () => {
  it("keeps a starter's own comments and adds one above the first window's start", () => {
    const { ingestron, read } = session();
    expect(ingestron("init", "erp", "--template", "private-sql-server", "--yes").code).toBe(0);
    const standard = read("erp/standard.yaml");
    expect(standard).toContain(
      "packs: [databricks@2, adf@2] # Databricks first: the first pack names and types the tables; ADF only copies",
    );
    expect(standard).toContain(
      "      # Start of the first window (UTC): midnight on the day this project was created\n      start: 2026-11-04T00:00:00Z\n",
    );
  });

  it("keeps an example's comments in a connection-first project", () => {
    const { ingestron, read } = session();
    const args = ["--connector", "sqlserver", "--connectivity", "workspace", "--via", "databricks"];
    expect(ingestron("init", "erp", ...args, "--yes").code).toBe(0);
    expect(read("erp/flows/erp.yaml")).toContain("# keep every version of an invoice");
  });
});

describe("a template from elsewhere", () => {
  /** A copy of the minimal starter whose template.yaml lists a question, as older templates do. */
  function asking(cwd: string): string {
    const folder = join(cwd, "asking");
    cpSync(join(import.meta.dirname, "../../core/project-templates/minimal"), folder, {
      recursive: true,
    });
    writeFileSync(
      join(folder, "template.yaml"),
      'title: Asking\nsummary: Asks.\nquestions:\n  - { value: team, ask: "Which team?", default: sales }\n',
    );
    return folder;
  }

  it("never asks its questions: the default is written, or the --set answer", () => {
    const { cwd, ingestron } = session();
    asking(cwd);
    expect(ingestron("init", "a", "--template", "./asking").code).toBe(0);
    expect(ingestron("init", "b", "--template", "./asking", "--set", "team=finance").code).toBe(0);
    expect(parse(readFileSync(join(cwd, "a/project.yaml"), "utf8")).values.team).toBe("sales");
    expect(parse(readFileSync(join(cwd, "b/project.yaml"), "utf8")).values.team).toBe("finance");
  });
});
