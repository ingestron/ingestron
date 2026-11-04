// The commands as a user runs them, on a copy of the retail example.
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const example = join(import.meta.dirname, "../project-templates/retail");
const privateFiles = join(import.meta.dirname, "../project-templates/private-files");

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
    expect(output).toContain("dev: the definitions have problems");
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

describe("--env", () => {
  for (const command of ["plan", "apply", "check"])
    it(`is refused by ${command}, which generates every environment together`, () => {
      const { folder, ingestron } = workspace();
      const { code, output } = ingestron(command, "--env", "dev");
      expect(code).toBe(2);
      expect(output.split("\n\n")[0]).toBe(
        `Every environment is generated together, so ${command} does not take --env. Use compare for two environments, or request for one.`,
      );
      expect(output).toContain("Usage: ingestron");
      expect(existsSync(join(folder, "build"))).toBe(false);
    });
});

describe("warnings", () => {
  it("are printed, and the plan still goes ahead", () => {
    const { folder, ingestron } = workspace();
    const manifest = join(folder, "project.yaml");
    writeFileSync(manifest, `${readFileSync(manifest, "utf8")}  - extra/*.yaml\n`);
    const { code, output } = ingestron("plan");
    expect(code).toBe(0);
    expect(output).toContain("dev: warnings\nproject.yaml");
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

  it("reports an upgraded project's build/<env>/ folders as no longer generated, and check fails until they are deleted", () => {
    const { folder, ingestron } = workspace();
    for (const environment of ["dev", "prod"]) {
      mkdirSync(join(folder, "build", environment), { recursive: true });
      writeFileSync(join(folder, "build", environment, "databricks.yml"), "bundle: {}\n");
      writeFileSync(
        join(folder, "build", environment, ".generated.json"),
        '{ "version": 1, "files": {} }\n',
      );
    }
    const apply = ingestron("apply");
    expect(apply.code).toBe(0);
    for (const environment of ["dev", "prod"])
      expect(apply.output).toContain(
        `build/${environment}: no longer generated. Delete the folder, or delete its .generated.json to keep it as your own.`,
      );
    const check = ingestron("check");
    expect(check.code).toBe(1);
    expect(check.output).toContain("databricks: up to date");
    expect(existsSync(join(folder, "build/dev/databricks.yml"))).toBe(true);
    for (const environment of ["dev", "prod"])
      rmSync(join(folder, "build", environment), { recursive: true });
    expect(ingestron("check")).toEqual({ code: 0, output: "databricks: up to date\n" });
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
      "Usage: ingestron <plan|apply|check|compare|contract|request|schemas|init>",
    );
    expect(ingestron("deploy").code).toBe(2);
    expect(ingestron("plan", "--environment", "dev").code).toBe(2);
  });
});
