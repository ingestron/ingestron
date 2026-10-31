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

const example = join(import.meta.dirname, "../project-templates/retail");

/** A copy of the example to work in, and a function that runs the CLI there. */
function workspace() {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-cli-"));
  cpSync(example, folder, { recursive: true, filter: (path) => !path.includes("/build") });
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
    expect(output).toContain("dev → build/dev\ncreate    databricks.yml");
    expect(output).toContain("prod → build/prod\n");
    expect(output).toContain("6 files: 6 create. Ready to apply.");
    expect(existsSync(join(folder, "build"))).toBe(false);
  });

  it("accepts absolute paths for --definitions and --out", () => {
    const { folder } = workspace();
    const elsewhere = mkdtempSync(join(tmpdir(), "ingestron-elsewhere-"));
    let output = "";
    const code = run(
      ["plan", "--env", "dev", "--definitions", folder, "--out", join(elsewhere, "out")],
      {
        cwd: elsewhere,
        write: (text) => (output += text),
      },
    );
    expect({ code, output: output.split("\n")[0] }).toEqual({ code: 0, output: "dev → out/dev" });
  });

  it("plans one environment with --env", () => {
    const { output } = workspace().ingestron("plan", "--env", "prod");
    expect(output).not.toContain("dev → ");
  });

  it("prints definition problems with their location and fails", () => {
    const { folder, ingestron } = workspace();
    const flow = join(folder, "flows/shop.yaml");
    writeFileSync(
      flow,
      readFileSync(flow, "utf8").replace("contract: shop.orders", "contract: shop.order"),
    );
    const { code, output } = ingestron("plan", "--env", "dev");
    expect(code).toBe(1);
    expect(output).toContain("flows/shop.yaml:9:15  error  BROKEN_LINK");
  });
});

describe("warnings", () => {
  it("are printed, and the plan still goes ahead", () => {
    const { folder, ingestron } = workspace();
    const manifest = join(folder, "project.yaml");
    writeFileSync(manifest, `${readFileSync(manifest, "utf8")}  - extra/*.yaml\n`);
    const { code, output } = ingestron("plan", "--env", "dev");
    expect(code).toBe(0);
    expect(output).toContain("project.yaml");
    expect(output).toContain("warning  NO_MATCH");
    expect(output).toContain("Ready to apply.");
  });
});

describe("ingestron apply and check", () => {
  it("writes each environment, after which check reports up to date", () => {
    const { folder, ingestron } = workspace();
    expect(ingestron("apply").code).toBe(0);
    expect(readFileSync(join(folder, "build/prod/databricks.yml"), "utf8")).toContain(
      "mode: production",
    );
    const check = ingestron("check");
    expect(check).toEqual({ code: 0, output: "dev: up to date\nprod: up to date\n" });
  });

  it("fails check when the definitions changed since the last apply", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    appendFileSync(join(folder, "standard.yaml"), "layers: [raw, curated]\n");
    const check = ingestron("check", "--env", "dev");
    expect(check.code).toBe(1);
    expect(check.output).toContain("dev: not up to date");
  });

  it("never overwrites a generated file that was edited by hand", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    const edited = join(folder, "build/dev/databricks.yml");
    appendFileSync(edited, "# my change\n");
    const apply = ingestron("apply", "--env", "dev");
    expect(apply.code).toBe(1);
    expect(apply.output).toContain("conflict  databricks.yml");
    expect(readFileSync(edited, "utf8")).toContain("# my change");
  });

  it("fails check, and keeps the folder, when an environment is no longer generated", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    const manifest = join(folder, "project.yaml");
    writeFileSync(manifest, readFileSync(manifest, "utf8").replace(/ {2}prod:\n( {4}.*\n)+/, ""));
    const check = ingestron("check");
    expect(check.code).toBe(1);
    expect(check.output).toContain("dev: up to date\n");
    expect(check.output).toContain("build/prod: no longer generated");
    expect(ingestron("apply").output).toContain("build/prod: no longer generated");
    expect(existsSync(join(folder, "build/prod/databricks.yml"))).toBe(true);
  });

  it("reports the old folder when a second pack moves the output", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply", "--env", "dev");
    const standard = join(folder, "standard.yaml");
    writeFileSync(
      standard,
      readFileSync(standard, "utf8").replace("[databricks@1]", "[databricks@1, adf@1]"),
    );
    ingestron("apply", "--env", "dev");
    const check = ingestron("check", "--env", "dev");
    expect(check.code).toBe(1);
    expect(check.output).toContain("build/dev: no longer generated");
    expect(check.output).not.toContain("build/dev/databricks: no longer generated");
    expect(check.output).not.toContain("not generated  databricks/");
  });

  it("does not report environments left out with --env", () => {
    const { ingestron } = workspace();
    ingestron("apply");
    expect(ingestron("check", "--env", "dev")).toEqual({ code: 0, output: "dev: up to date\n" });
  });

  it("fails check on a file in an output folder that was not generated", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    writeFileSync(join(folder, "build/dev/src/retail/bronze/extra.sql"), "SELECT 1\n");
    const check = ingestron("check", "--env", "dev");
    expect(check.code).toBe(1);
    expect(check.output).toContain("dev: not generated  src/retail/bronze/extra.sql");
    expect(ingestron("check", "--env", "dev", "--allow-extra").code).toBe(0);
  });

  it("summarises which environments were applied and which were blocked", () => {
    const { folder, ingestron } = workspace();
    ingestron("apply");
    appendFileSync(join(folder, "build/prod/databricks.yml"), "# my change\n");
    appendFileSync(join(folder, "standard.yaml"), "layers: [raw, curated]\n");
    const apply = ingestron("apply");
    expect(apply.code).toBe(1);
    expect(apply.output).toContain("Applied: dev. Not applied: prod.");
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
