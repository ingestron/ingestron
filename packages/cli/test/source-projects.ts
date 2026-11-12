// The source metadata fixture projects of spec/cli/conformance/sources/, copied to a temporary
// folder, and the CLI run there with a fixed clock.
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/cli/conformance/sources");

/** The time every run reports as now, which an import writes as `captured.at`. */
export const now = new Date("2026-11-12T09:30:00Z");

/** A fixture folder's path, such as `request` or `imports`. */
export const fixture = (name: string): string => join(conformance, name);

/** A copy of the fixture project `name` and a function that runs the CLI in it. */
export function sourceProject(name: "request" | "drafts") {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-sources-"));
  cpSync(fixture(name), folder, { recursive: true });
  const ingestron = (...args: string[]) => {
    let output = "";
    const code = run(args, { cwd: folder, write: (text) => (output += text), now: () => now });
    return { code, output };
  };
  return { folder, ingestron };
}

/** Reads a file of a folder. */
export const read = (folder: string, file: string): string =>
  readFileSync(join(folder, file), "utf8");

/** A file of the imports fixtures. */
export const imports = (name: string): string => read(fixture("imports"), name);

/** The request project with the first catalog export saved where the request says. */
export function withCatalog() {
  const project = sourceProject("request");
  cpSync(
    join(fixture("imports"), "first.catalog.csv"),
    join(project.folder, "sources/erp.catalog.csv"),
  );
  return project;
}
