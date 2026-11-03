// A copy of the minimal starter whose landing folder comes from ${envvar:NAME}, for env tests.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const minimal = join(import.meta.dirname, "../../cli/project-templates/minimal");
export const landing = "abfss://landing@editorenv.dfs.core.windows.net/shop";
// Names no developer's shell sets, so the "unset" cases are unset everywhere.
export const unset = "INGESTRON_TEST_UNSET";
export const fromFile = "INGESTRON_TEST_LANDING";
export const fromHost = "INGESTRON_TEST_HOST";
const names = [unset, fromFile, fromHost];
const saved = new Map<string, string | undefined>();

/** A copy of the minimal starter whose landing folder comes from ${envvar:NAME}. */
function workspace(name: string, files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-env-"));
  cpSync(minimal, folder, { recursive: true, filter: (path) => !path.includes("/build") });
  const project = join(folder, "project.yaml");
  writeFileSync(
    project,
    readFileSync(project, "utf8").replace("/Volumes/dev/landing/shop", `\${envvar:${name}}`),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

const folders: string[] = [];
export const made = (name: string, files?: Record<string, string>) => {
  const folder = workspace(name, files);
  folders.push(folder);
  return folder;
};

/** Clears the test names before each test and restores what was there after it. */
export function cleanEnvironment(): void {
  beforeEach(() => {
    for (const name of names) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
  });
  afterEach(() => {
    for (const name of names) {
      const before = saved.get(name);
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    }
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });
}
