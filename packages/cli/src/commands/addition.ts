// Independent additions use core's standard-scoped drafts and the scaffold's safe writes.
import { existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { draftConnection, draftFlow, type DefinitionDraft } from "@ingestron/core";
import { writeScaffold } from "@ingestron/core/internal";
import type { Io, Options } from "../terminal/index.js";
import { WriteRefused, writeStaged } from "./write-staged.js";

/** Add a connection or flow without changing the standard or existing definitions. */
export function addition(options: Options, io: Io): number {
  try {
    const folder = resolve(io.cwd, options.definitions);
    const files = nodeFiles(folder);
    const environment = options.environments[0];
    const id = options.additionId!;
    const draft =
      options.command === "connection"
        ? draftConnection(files, {
            id,
            connector: required(options.init.connector, "--connector"),
            connectivity: required(options.init.connectivity, "--connectivity"),
            settings: options.init.set,
            ...(options.method && { method: options.method }),
            ...(environment && { environment }),
          })
        : draftFlow(files, {
            id,
            connection: required(options.connection, "--connection"),
            objects: [required(options.object, "--object")],
            ...(options.method && { method: options.method }),
            ...(environment && { environment }),
          });
    write(folder, draft);
    const imported = draft.imports ? `; project.yaml now imports ${draft.imports.added}` : "";
    io.write(
      `Added ${draft.file}${imported}. Review the definition, then run plan. No source access or deployment occurred.\n`,
    );
    return 0;
  } catch (cause) {
    io.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 1;
  }
}

/** The new file alone, never replacing one; with its import, both files together or neither. */
function write(folder: string, draft: DefinitionDraft): void {
  const clash = (path: string) => new Error(`Nothing written: ${path} already exists.`);
  if (!draft.imports) {
    const result = writeScaffold(folder, { [draft.file]: draft.text });
    if ("clashes" in result) throw clash(result.clashes.join(", "));
    return;
  }
  if (existsSync(join(folder, draft.file))) throw clash(draft.file);
  try {
    writeStaged([
      { file: join(folder, draft.file), text: draft.text },
      { file: join(folder, "project.yaml"), text: draft.imports.project },
    ]);
  } catch (error) {
    if (!(error instanceof WriteRefused)) throw error;
    throw new Error(error.text((file) => relative(folder, file).split(sep).join("/")));
  }
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing ${flag}.`);
  return value;
}
