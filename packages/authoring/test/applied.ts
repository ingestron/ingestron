// Samples do not commit generated files; tests that need them use a copy of
// the sample after `ingestron apply`.
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@ingestron/cli";

const templates = join(import.meta.dirname, "../../cli/project-templates");

/** A temporary copy of the starter `<name>` after `ingestron apply`. */
export function appliedSample(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-applied-"));
  cpSync(join(templates, name), folder, { recursive: true });
  let output = "";
  const code = run(["apply", "--no-diff"], { cwd: folder, write: (text) => (output += text) });
  if (code !== 0) throw new Error(`${name} does not apply:\n${output}`);
  return folder;
}
