// The filesystem edge for a reviewed draft, reusing scaffold path and symlink guards.
import { lstatSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DefinitionDraft } from "./add-connection.js";
import { writeScaffold } from "./scaffold.js";

/**
 * Write a new connection or flow draft, refusing existing files and unsafe paths, then the
 * project.yaml that imports it, when the draft carries one. When project.yaml cannot be written,
 * the new file is removed again, so neither is left half done. @public
 */
export function writeDefinitionDraft(folder: string, draft: DefinitionDraft): void {
  if (!/^(connections|flows)\/[a-z][a-z0-9_]*\.yaml$/.test(draft.file))
    throw new Error("A definition draft must name a new connection or flow YAML file.");
  const manifest = join(folder, "project.yaml");
  if (draft.imports && !lstatSync(manifest, { throwIfNoEntry: false })?.isFile())
    throw new Error("Nothing written: project.yaml is not a regular file.");
  const result = writeScaffold(folder, { [draft.file]: draft.text });
  if ("clashes" in result)
    throw new Error(`Nothing written: ${result.clashes.join(", ")} already exists.`);
  if (!draft.imports) return;
  try {
    writeFileSync(manifest, draft.imports.project);
  } catch (cause) {
    rmSync(join(folder, draft.file), { force: true });
    throw cause;
  }
}
