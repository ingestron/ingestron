// An unset variable in an environment that a pack building every environment together
// deploys: plan never reads it, so the editor says the deploying pipeline supplies it, under
// the names the files take it as, and asks for no .env entry. DuckDB still reads it.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { problems } from "../src/diagnostics.js";
import { openProject } from "../src/project.js";
import { filledTemplates } from "./starters.js";

const templates = filledTemplates;
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A copy of the starter, with `from` replaced by `to` in `file`. */
function starter(name: string, file: string, from: string, to: string) {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-deploy-"));
  folders.push(folder);
  cpSync(join(templates, name), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  writeFileSync(join(folder, file), readFileSync(join(folder, file), "utf8").replace(from, to));
  return openProject(folder, new Map());
}

const shown = (found: ReturnType<typeof problems>) =>
  found.map(({ code, severity, message }) => ({ code, severity, message }));

describe("an unset variable the deploying pipeline supplies", () => {
  const retail = () =>
    starter(
      "retail",
      "connections/shop.yaml",
      "abfss://landing@${values.storage_account}.dfs.core.windows.net/shop",
      "${envvar:INGT_LANDING_6C}/shop",
    );

  for (const environment of ["dev", "prod"])
    it(`says so in ${environment}, with the name the bundle takes it as`, () => {
      expect(shown(problems(retail(), environment))).toEqual([
        {
          code: "ENVVAR_MISSING",
          severity: "information",
          message: `INGT_LANDING_6C is supplied when deploying, as \`BUNDLE_VAR_ingt_landing_6c\` (databricks). Plan does not read it, so it needs no .env.${environment} entry.`,
        },
      ]);
    });

  it("gives only plan's error where plan refuses it, as a flow's source", () => {
    const minimal = starter(
      "minimal",
      "flows/orders.yaml",
      "source: shop",
      "source: ${envvar:INGT_SRC_6C}",
    );
    expect(problems(minimal, "dev").map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "DEPLOY_VALUE", severity: "error" },
    ]);
  });

  it("keeps the advice to set it for DuckDB, which reads it when generating", () => {
    const duckdb = starter(
      "duckdb",
      "flows/orders.yaml",
      "source: shop",
      "source: ${envvar:INGT_SRC_6C}",
    );
    expect(shown(problems(duckdb, "dev"))).toEqual([
      {
        code: "ENVVAR_MISSING",
        severity: "information",
        message:
          "INGT_SRC_6C isn't set; add it to .env.dev or set it before running Ingestron.\nIngestron reads .env files in the project folder and the environment the editor started with.",
      },
    ]);
  });
});
