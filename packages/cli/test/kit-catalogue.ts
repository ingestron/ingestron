// What the init --kit tests share: the installed kits, the CLI run in a folder, and a catalogue
// as a bare file:// repository made in the test, so no test goes online.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { installedKits } from "@ingestron/core";
import { run } from "../src/index.js";

export const temp = (prefix = "ingestron-kit-test-") => mkdtempSync(join(tmpdir(), prefix));
export const cliVersion = (
  JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as {
    version: string;
  }
).version;

export const kits = installedKits();
const duckdbKit = kits.find((kit) => kit.id === "duckdb/local-medallion")!;
export const databricksKit = kits.find((kit) => kit.id === "databricks/lakehouse-streaming")!;

export function ingestron(cwd: string, ...args: string[]) {
  let output = "";
  const code = run(args, {
    cwd,
    write: (text) => (output += text),
    now: () => new Date("2026-11-10T09:00:00Z"),
  });
  return { code, output };
}

/** The installed DuckDB kit as another id and version, with `change` made to its kit.yaml. */
export function kitCopy(
  to: string,
  id: string,
  version: string,
  change = (text: string) => text,
): void {
  cpSync(duckdbKit.folder, to, { recursive: true });
  const kitYaml = readFileSync(join(to, "kit.yaml"), "utf8")
    .replace(/^id: .*$/m, `id: ${id}`)
    .replace(/^version: .*$/m, `version: ${version}`)
    .replace(/^features: .*$/m, `features: ${version.endsWith("-preview") ? "preview" : "ga"}`);
  writeFileSync(join(to, "kit.yaml"), change(kitYaml));
  const standard = readFileSync(join(to, "standard.yaml"), "utf8")
    .replace(/standard: duckdb\/local-medallion/, `standard: ${id}`)
    .replace(/version: 2026-11-10/, `version: ${version}`)
    .replace(/^features: .*$/m, `features: ${version.endsWith("-preview") ? "preview" : "ga"}`);
  writeFileSync(join(to, "standard.yaml"), standard);
}

interface Published {
  id: string;
  version: string;
  change?: (text: string) => string;
  /** Changes to the kit's other files, by path in the kit's folder. */
  files?: Record<string, (text: string) => string>;
  /** Symbolic links to add to the kit, by path in the kit's folder, to what they point at. */
  links?: Record<string, string>;
}

/** A bare repository laid out as the catalogue: `kits/<id>/<version>/`, each tagged `<id>@<version>`. */
export function catalogue(published: Published[]): string {
  const work = temp();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, stdio: "ignore" });
  git("init", "--quiet", "--initial-branch", "main");
  writeFileSync(join(work, "README.md"), "Kits\n");
  for (const { id, version, change, files = {}, links = {} } of published) {
    const folder = join(work, "kits", id, version);
    kitCopy(folder, id, version, change);
    for (const [path, edit] of Object.entries(files))
      writeFileSync(join(folder, path), edit(readFileSync(join(folder, path), "utf8")));
    for (const [path, target] of Object.entries(links)) symlinkSync(target, join(folder, path));
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", version);
    git("tag", `${id}@${version}`);
  }
  const bare = join(temp(), "standards.git");
  execFileSync("git", ["clone", "--quiet", "--bare", work, bare], { stdio: "ignore" });
  return `file://${bare}`;
}

/** Runs `body` with TMPDIR at a folder of its own, and returns what is left in it. */
export function leftBehind(body: () => void): string[] {
  const own = temp();
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = own;
  try {
    body();
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
  return readdirSync(own);
}

/** Points the catalogue at a repository that is not there, for each test: never the real one. */
export function offlineCatalogue(): void {
  let savedRepository: string | undefined;
  beforeEach(() => {
    savedRepository = process.env.INGESTRON_STANDARDS_REPOSITORY;
    // Never the real catalogue: a test that reaches it fails here instead of going online.
    process.env.INGESTRON_STANDARDS_REPOSITORY = "file:///no/such/standards.git";
  });
  afterEach(() => {
    if (savedRepository === undefined) delete process.env.INGESTRON_STANDARDS_REPOSITORY;
    else process.env.INGESTRON_STANDARDS_REPOSITORY = savedRepository;
  });
}

/** Runs git in `folder` as a test user, quietly. */
export function git(folder: string, ...args: string[]): void {
  const user = ["-c", "user.name=t", "-c", "user.email=t@example.com"];
  execFileSync("git", [...user, ...args], { cwd: folder, stdio: "ignore" });
}

/** Makes `folder` a git repository with everything in it committed. */
export function committed(folder: string): void {
  git(folder, "init", "--quiet", "--initial-branch", "main");
  git(folder, "add", ".");
  git(folder, "commit", "--quiet", "-m", "project");
}
