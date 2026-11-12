// The commands as a user runs them, on a copy of the retail example.
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { filledStarter } from "./starters.js";

const example = filledStarter("retail");
const privateFiles = filledStarter("private-files");

/** A copy of the example to work in, and a function that runs the CLI there. */
function workspace(from = example) {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-cli-"));
  cpSync(from, folder, { recursive: true, filter: (path) => !path.includes("/build") });
  const ingestron = (...args: string[]) => {
    let output = "";
    const code = run(args, { cwd: folder, write: (text) => (output += text) });
    return { code, output };
  };
  return { folder, ingestron };
}

describe("ingestron plan", () => {
  it("shows what would be written for every environment, and writes nothing", () => {
    const { folder, ingestron } = workspace();
    const { code, output } = ingestron("plan");
    expect(code).toBe(0);
    expect(output).toContain("databricks → build/databricks (dev, prod)\ncreate    databricks.yml");
    expect(output).toContain("6 files: 6 create. Ready to apply.");
    expect(existsSync(join(folder, "build"))).toBe(false);
  });

  it("accepts absolute paths for --definitions and --out", () => {
    const { folder } = workspace();
    const elsewhere = mkdtempSync(join(tmpdir(), "ingestron-elsewhere-"));
    let output = "";
    const code = run(["plan", "--definitions", folder, "--out", join(elsewhere, "out")], {
      cwd: elsewhere,
      write: (text) => (output += text),
    });
    expect({ code, output: output.split("\n")[0] }).toEqual({
      code: 0,
      output: "databricks → out/databricks (dev, prod)",
    });
  });

  it("prints definition problems with their location and fails", () => {
    const { folder, ingestron } = workspace();
    const flow = join(folder, "flows/shop.yaml");
    writeFileSync(
      flow,
      readFileSync(flow, "utf8").replace("contract: shop.orders", "contract: shop.order"),
    );
    const { code, output } = ingestron("plan");
    expect(code).toBe(1);
    expect(output).toContain("dev, prod: the definitions have problems\nflows/shop.yaml");
    expect(output).toContain("flows/shop.yaml:9:15  error  BROKEN_LINK");
    expect(output).not.toContain("databricks → ");
  });

  it("gives PACK_VERSION, with the fix to @2, for a standard that names databricks@1", () => {
    const { folder, ingestron } = workspace();
    const standard = join(folder, "standard.yaml");
    writeFileSync(standard, readFileSync(standard, "utf8").replace("databricks@2", "databricks@1"));
    const { code, output } = ingestron("plan");
    expect(code).toBe(1);
    expect(output).toContain("error  PACK_VERSION");
    expect(output).toContain('Fix: Change to "databricks@2".');
  });
});

describe("warnings", () => {
  it("are printed, and the plan still goes ahead", () => {
    const { folder, ingestron } = workspace();
    const manifest = join(folder, "project.yaml");
    writeFileSync(manifest, `${readFileSync(manifest, "utf8")}  - extra/*.yaml\n`);
    const { code, output } = ingestron("plan");
    expect(code).toBe(0);
    expect(output).toContain("dev, prod: warnings\nproject.yaml");
    expect(output).toContain("warning  NO_MATCH");
    expect(output).toContain("Ready to apply.");
  });
});

describe("ingestron apply and check", () => {
  it("writes one bundle for every environment, after which check reports up to date", () => {
    const { folder, ingestron } = workspace();
    expect(ingestron("apply").code).toBe(0);
    const bundle = readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8");
    expect(bundle).toContain("  dev:\n");
    expect(bundle).toContain("  prod:\n");
    expect(bundle).toContain("mode: production");
    const check = ingestron("check");
    expect(check).toEqual({ code: 0, output: "databricks: up to date\n" });
  });

  it("fails check when the definitions changed since the last apply", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    appendFileSync(join(folder, "standard.yaml"), "layers: [raw, curated]\n");
    const check = ingestron("check");
    expect(check.code).toBe(1);
    expect(check.output).toContain("databricks: not up to date");
  });

  it("never overwrites a generated file that was edited by hand", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    const edited = join(folder, "build/databricks/databricks.yml");
    appendFileSync(edited, "# my change\n");
    const apply = ingestron("apply");
    expect(apply.code).toBe(1);
    expect(apply.output).toContain("conflict  databricks.yml");
    expect(readFileSync(edited, "utf8")).toContain("# my change");
  });

  it("drops an environment's target from the bundle when the environment is removed", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    const manifest = join(folder, "project.yaml");
    writeFileSync(manifest, readFileSync(manifest, "utf8").replace(/ {2}prod:\n( {4}.*\n)+/, ""));
    expect(ingestron("check").output).toContain("databricks: not up to date");
    expect(ingestron("apply").output).toContain("databricks → build/databricks (dev)");
    expect(readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8")).not.toContain(
      "  prod:",
    );
    expect(ingestron("check").code).toBe(0);
  });

  it("keeps the first pack's folder where it is when the standard names a second pack", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    const standard = join(folder, "standard.yaml");
    writeFileSync(
      standard,
      readFileSync(standard, "utf8").replace("[databricks@2]", "[databricks@2, adf@2]"),
    );
    const check = ingestron("check");
    expect(check).toEqual({ code: 0, output: "databricks: up to date\n" });
  });

  it("fails check on a file in an output folder that was not generated", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    writeFileSync(join(folder, "build/databricks/src/retail/bronze/extra.sql"), "SELECT 1\n");
    const check = ingestron("check");
    expect(check.code).toBe(1);
    expect(check.output).toContain("databricks: not generated  src/retail/bronze/extra.sql");
    expect(ingestron("check", "--allow-extra").code).toBe(0);
  });

  it("summarises which output folders were applied and which were blocked", () => {
    const { folder, ingestron } = workspace(privateFiles);
    ingestron("apply");
    appendFileSync(join(folder, "build/adf/parameters/prod.json"), "\n");
    const manifest = join(folder, "project.yaml");
    writeFileSync(
      manifest,
      readFileSync(manifest, "utf8").replace("kv-stores-prod", "kv-stores-live"),
    );
    appendFileSync(join(folder, "standard.yaml"), "layers: [raw, curated]\n");
    const apply = ingestron("apply");
    expect(apply.code).toBe(1);
    expect(apply.output).toContain("Applied: databricks. Not applied: adf.");
  });
});

describe("ingestron schemas, help and mistakes", () => {
  it("writes editor schemas and prints the VS Code setting", () => {
    const { folder, ingestron } = workspace();
    const { code, output } = ingestron("schemas");
    expect(code).toBe(0);
    expect(existsSync(join(folder, ".ingestron/schemas/definitions.json"))).toBe(true);
    expect(output).toContain('"yaml.schemas"');
  });

  it("explains usage, and refuses unknown commands and options", () => {
    const { ingestron } = workspace();
    expect(ingestron("--help").output).toContain(
      "Usage: ingestron <plan|apply|check|compare|contract|request|schemas|init|standard|source|assistant>",
    );
    expect(ingestron("deploy").code).toBe(2);
    expect(ingestron("plan", "--environment", "dev").code).toBe(2);
  });

  it("says in help what init and standard start from", () => {
    const { ingestron } = workspace();
    const help = ingestron("--help").output;
    expect(help).toContain(
      "  init      Create a project from a connection, a starter or a published standard.\n",
    );
    expect(help).toContain("  standard  Install or list published standards.\n");
  });

  it("lists source and the flags of source metadata in help", () => {
    const { ingestron } = workspace();
    const help = ingestron("--help").output;
    expect(help).toMatch(
      /\n {2}source {4}Request source metadata from its owners, or import the file they send\./,
    );
    for (const flag of [
      "--connection <id>",
      "--object <text>",
      "--dry-run",
      "--from-metadata",
      "--needed",
    ])
      expect(help).toContain(`  ${flag}`);
  });
});
