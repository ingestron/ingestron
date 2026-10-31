// Platform values reach definitions through ${envvar:…}; there is no product-specific flag.
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { run } from "../src/index.js";

const variable = "INGESTRON_TEST_ACCOUNT";

/** A copy of the private-files starter whose storage account comes from the environment. */
function workspace(): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-envvar-"));
  cpSync(join(import.meta.dirname, "../project-templates/private-files"), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  const project = join(folder, "project.yaml");
  writeFileSync(
    project,
    readFileSync(project, "utf8").replace("storeslakedev", `\${envvar:${variable}}`),
  );
  return folder;
}

/** Every generated file under a folder, concatenated. */
function generated(folder: string): string {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}

afterEach(() => {
  delete process.env[variable];
});

it("resolves ${envvar:…} from the process environment", () => {
  const folder = workspace();
  process.env[variable] = "acct1";
  let output = "";
  const code = run(["apply", "--env", "dev"], { cwd: folder, write: (text) => (output += text) });
  expect(code, output).toBe(0);
  expect(generated(join(folder, "build"))).toContain("acct1.dfs.core.windows.net");
});
