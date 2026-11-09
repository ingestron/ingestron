// Platform values reach definitions through ${envvar:…}; there is no product-specific flag.
// A pack that builds every environment together takes them when deploying; any other pack
// reads them from the process environment when generating (spec/cli/outputs.md, section 6).
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { run } from "../src/index.js";
import { fillStarter } from "./starters.js";

const variable = "INGESTRON_TEST_VALUE";

/** A copy of an example with one value replaced by a reference to the variable. */
function workspace(example: string, value: string): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-envvar-"));
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
  writeFileSync(project, readFileSync(project, "utf8").replace(value, `\${envvar:${variable}}`));
  return folder;
}

/** Every generated file under a folder, concatenated. */
function generated(folder: string): string {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}

function ingestron(folder: string, ...args: string[]): { code: number; output: string } {
  let output = "";
  const code = run(args, { cwd: folder, write: (text) => (output += text) });
  return { code, output };
}

afterEach(() => {
  delete process.env[variable];
});

it("leaves ${envvar:…} to the deploying pipeline for packs that build every environment together", () => {
  // The whole Key Vault URL is the variable: Data Factory takes a deploy-time value as a whole value.
  const folder = workspace("project-templates/private-files", "unused");
  const platform = join(folder, "platform.yaml");
  writeFileSync(
    platform,
    readFileSync(platform, "utf8").replace(/key_vault: .*/, `key_vault: \${envvar:${variable}}`),
  );
  process.env[variable] = "https://kv-from-host.vault.azure.net";
  const apply = ingestron(folder, "apply");
  expect(apply.code, apply.output).toBe(0);
  const files = generated(join(folder, "build"));
  expect(files).not.toContain("kv-from-host");
  expect(files).not.toContain(`\${envvar:${variable}}`);
  delete process.env[variable];
  // The same files on a computer without the variable.
  expect(ingestron(folder, "check").code).toBe(0);
});

it("resolves ${envvar:…} from the process environment for a pack that builds one environment at a time", () => {
  const folder = workspace("test/fixtures/duckdb-local", "./published");
  process.env[variable] = "./from-host";
  const apply = ingestron(folder, "apply");
  expect(apply.code, apply.output).toBe(0);
  expect(generated(join(folder, "build/duckdb/local"))).toContain("./from-host");
});
