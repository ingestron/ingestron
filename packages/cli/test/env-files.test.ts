// .env files feed ${envvar:…} in every command, and a missing variable still stops apply.
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { fillStarter } from "./starters.js";

// A name no developer's shell sets, so "unset" is unset everywhere; any real value is restored.
const name = "INGESTRON_TEST_LANDING";
let previous: string | undefined;
const dev = "abfss://landing@envfiledev.dfs.core.windows.net/stores";
const prod = "abfss://landing@envfileprod.dfs.core.windows.net/stores";

/** A copy of the private-files starter whose landing folder comes from ${envvar:INGESTRON_TEST_LANDING}. */
function workspace(
  files: Record<string, string>,
  value = /abfss:\/\/landing@\$\{values\.storage_account\}\.dfs\.core\.windows\.net\/stores/g,
): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-env-files-"));
  cpSync(join(import.meta.dirname, "../../core/project-templates/private-files"), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  fillStarter(folder, "private-files");
  const project = join(folder, "platform.yaml");
  writeFileSync(project, readFileSync(project, "utf8").replace(value, `\${envvar:${name}}`));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

/** A copy of the duckdb starter, with `text` in its platform or standard read from the variable. */
function duckdb(files: Record<string, string>, text = "published: ./published"): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-env-files-"));
  cpSync(join(import.meta.dirname, "../../core/project-templates/duckdb"), folder, {
    recursive: true,
  });
  const [key] = text.split(":");
  for (const file of ["platform.yaml", "standard.yaml"]) {
    const path = join(folder, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(text, `${key}: "\${envvar:${name}}"`));
  }
  for (const [file, value] of Object.entries(files)) writeFileSync(join(folder, file), value);
  return folder;
}

function ingestron(cwd: string, ...args: string[]) {
  let output = "";
  const code = run(args, { cwd, write: (text) => (output += text) });
  return { code, output };
}

/** Every generated file under a folder, concatenated. */
function generated(folder: string): string {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}

beforeEach(() => {
  previous = process.env[name];
  delete process.env[name];
});

afterEach(() => {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
});

describe("ingestron and .env files", () => {
  it("apply reads .env.dev for a pack that builds one environment at a time", () => {
    const folder = duckdb({ ".env.dev": `${name}=./from-env-file\n` });
    const { code, output } = ingestron(folder, "apply");
    expect(code, output).toBe(0);
    expect(generated(join(folder, "build/duckdb/dev"))).toContain("./from-env-file");
  });

  it("apply reads .env, and the host environment wins", () => {
    const folder = duckdb({ ".env": `${name}=./from-env-file\n` });
    process.env[name] = "./from-host";
    const { code, output } = ingestron(folder, "apply");
    expect(code, output).toBe(0);
    expect(generated(join(folder, "build"))).toContain("./from-host");
    expect(generated(join(folder, "build"))).not.toContain("./from-env-file");
  });

  it("apply leaves the value to the deploying pipeline, and reads no .env, for packs that build every environment together", () => {
    const vault = "https://kv-envfile.vault.azure.net";
    const folder = workspace(
      { ".env.prod": `${name}=${vault}\n` },
      /https:\/\/kv-stores-prod[^\n]+/,
    );
    const { code, output } = ingestron(folder, "apply");
    expect(code, output).toBe(0);
    expect(generated(join(folder, "build"))).not.toContain("kv-envfile");
  });

  it("compare and request read .env too", () => {
    const folder = workspace({ ".env": `${name}=${dev}\n`, ".env.prod": `${name}=${prod}\n` });
    const compared = ingestron(folder, "compare", "--env", "dev", "--env", "prod");
    expect(compared.code, compared.output).toBe(0);
    expect(compared.output).not.toContain("the definitions have problems");
    expect(compared.output).toContain("envfiledev");
    expect(compared.output).toContain("envfileprod");
    const requested = ingestron(folder, "request", "--env", "prod");
    expect(requested.code, requested.output).toBe(0);
    expect(requested.output).not.toContain("have problems");
    expect(requested.output).toContain("envfileprod");
    expect(requested.output).not.toContain("envfiledev");
  });

  it("compare and request read the host environment, which wins over .env", () => {
    const folder = workspace({ ".env": `${name}=${dev}\n` });
    process.env[name] = prod;
    const compared = ingestron(folder, "compare", "--env", "dev", "--env", "prod");
    expect(compared.output).not.toContain("the definitions have problems");
    expect(compared.output).not.toContain("envfiledev");
    const requested = ingestron(folder, "request", "--env", "dev");
    expect(requested.output).toContain("envfileprod");
    expect(requested.output).not.toContain("envfiledev");
  });

  it("a missing variable is still an error for apply, where a pack reads it when generating", () => {
    const folder = duckdb({});
    const { code, output } = ingestron(folder, "apply");
    expect(code).not.toBe(0);
    expect(output).toContain("ENVVAR_MISSING");
    expect(output).toContain("add it to .env.dev or .env");
    expect(output).not.toContain("VS Code");
    expect(output).toMatch(/error\s+ENVVAR_MISSING/);
  });

  it("an invalid value from .env is still reported, with the value", () => {
    const folder = duckdb({ ".env.dev": `${name}=xml\n` }, "format: csv");
    const { code, output } = ingestron(folder, "apply");
    expect(code).not.toBe(0);
    expect(output).toContain("BAD_SETTING");
    expect(output).toContain('"xml"');
  });
});
