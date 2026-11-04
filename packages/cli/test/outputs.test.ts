// The output folders as a user meets them (spec/cli/outputs.md): one per pack for every
// environment, --env refused, a project of one environment, an environment that runs on
// DuckDB beside cloud environments, an upgraded project's old folders, and a pack's notices.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import type { Pack } from "@ingestron/definitions";
import { readArgs, type Options } from "../src/args.js";
import { generate } from "../src/generate.js";
import { run } from "../src/index.js";
import { standInPacks } from "./outputs-packs.js";

const templates = join(import.meta.dirname, "../project-templates");

/** A copy of a starter to work in, `change` made to it, and a function that runs the CLI there. */
function workspace(starter = "retail", change: (folder: string) => void = () => {}) {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-outputs-"));
  cpSync(join(templates, starter), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  change(folder);
  const ingestron = (...args: string[]) => {
    let output = "";
    const code = run(args, { cwd: folder, write: (text) => (output += text) });
    return { code, output };
  };
  return { folder, ingestron };
}

/** Replaces text in one of the folder's files. */
function edit(folder: string, file: string, from: string | RegExp, to: string): void {
  const path = join(folder, file);
  writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
}

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

describe("a project with one environment", () => {
  it("gives a bundle with one target and a factory with one parameter file", () => {
    const { folder, ingestron } = workspace("private-files", (root) =>
      edit(root, "project.yaml", /  prod:\n( {4}.*\n)+/, ""),
    );
    const apply = ingestron("apply");
    expect(apply.code, apply.output).toBe(0);
    expect(apply.output).toContain("databricks → build/databricks (dev)");
    expect(apply.output).toContain("adf → build/adf (dev)");
    const bundle = parse(readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8"));
    expect(Object.keys(bundle.targets)).toEqual(["dev"]);
    expect(readdirSync(join(folder, "build/adf/parameters"))).toEqual(["dev.json"]);
    expect(ingestron("check").code).toBe(0);
  });
});

describe("an environment that runs on DuckDB beside cloud environments", () => {
  it("is left out of the bundle and the factory, and has its own folder under build/duckdb", () => {
    const { folder, ingestron } = workspace("private-files", (root) => {
      edit(
        root,
        "project.yaml",
        "values:\n  landing",
        "values:\n  store: streaming-table\n  landing",
      );
      edit(
        root,
        "project.yaml",
        "      key_vault: https://kv-stores-prod.vault.azure.net\n",
        "      key_vault: https://kv-stores-prod.vault.azure.net\n  laptop:\n    runs-on: duckdb\n    values: { store: duckdb-table }\n",
      );
      edit(root, "standard.yaml", "[databricks@2, adf@2]", "[databricks@2, adf@2, duckdb@1]");
      edit(
        root,
        "standard.yaml",
        "      start: 2026-10-01T00:00:00Z\n",
        "      start: 2026-10-01T00:00:00Z\n    duckdb-landed: { landing: ./samples }\n",
      );
      writeFileSync(
        join(root, "standard.yaml"),
        `${readFileSync(join(root, "standard.yaml"), "utf8")}store:\n  default: \${values.store}\n  settings:\n    duckdb-table: { published: ./published }\n`,
      );
    });
    const apply = ingestron("apply");
    expect(apply.code, apply.output).toBe(0);
    expect(apply.output).toContain("databricks → build/databricks (dev, prod)");
    expect(apply.output).toContain("adf → build/adf (dev, prod)");
    expect(apply.output).toContain("duckdb → build/duckdb (laptop)");
    const bundle = parse(readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8"));
    expect(Object.keys(bundle.targets)).toEqual(["dev", "prod"]);
    expect(readdirSync(join(folder, "build/adf/parameters"))).toEqual(["dev.json", "prod.json"]);
    expect(readdirSync(join(folder, "build/duckdb"))).toEqual([".generated.json", "laptop"]);
    expect(readFileSync(join(folder, "build/duckdb/laptop/run.sql"), "utf8")).toContain(
      "./samples/",
    );
    expect(ingestron("check").code).toBe(0);
  });
});

describe("an upgraded project", () => {
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
});

describe("a pack's notices", () => {
  /** The fold stand-in, with a notice among its problems. */
  const noticed: Pack[] = standInPacks.map((pack) =>
    pack.buildEnvironments
      ? {
          ...pack,
          buildEnvironments: (models) => {
            const built = pack.buildEnvironments!(models);
            const notice = {
              code: "PACK_NOTICE" as const,
              severity: "warning" as const,
              message: "The runtime keeps its own settings.",
              hint: "Check the runtime before deploying.",
            };
            return { ...built, problems: [...built.problems, notice] };
          },
        }
      : pack,
  );

  it("are shown as the pack's warnings when generating, and its files are still written", () => {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-notice-"));
    const spec = join(
      import.meta.dirname,
      "../../../spec/cli/conformance/outputs/01-one-pack.yaml",
    );
    for (const [path, text] of Object.entries(
      parse(readFileSync(spec, "utf8")).files as Record<string, string>,
    ))
      writeFileSync(join(folder, path), text);
    let output = "";
    const options = readArgs(["apply"]) as Options;
    const code = generate(options, { cwd: folder, write: (text) => (output += text) }, noticed);
    expect(code, output).toBe(0);
    expect(output).toContain(
      "fold: warnings\n(project)  warning  PACK_NOTICE\n  The runtime keeps its own settings.\n  Check the runtime before deploying.\n",
    );
    expect(existsSync(join(folder, "build/fold/targets.txt"))).toBe(true);
  });
});
