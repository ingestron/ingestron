// The generated files, in memory, exactly as the CLI would write them, and
// the ones that belong to the table at the cursor.
import { kindOf } from "./context.js";
import { formatDiagnostics } from "@ingestron/config";
import { generatedOutputs } from "@ingestron/cli";
import { resolved, type Project } from "./project.js";
import { keyPath } from "./yaml.js";

/** One generated file, at its path in the project (under build/). */
export interface Generated {
  path: string;
  text: string;
}

type Files = Generated[] | { problems: string };
const built = new WeakMap<Project, Map<string, Files>>();

/** Every file `apply` would write for the environment, or the problems that stop it; once per project snapshot. */
export function generatedFiles(project: Project, environment: string | undefined): Files {
  let byEnvironment = built.get(project);
  if (!byEnvironment) built.set(project, (byEnvironment = new Map()));
  const key = environment ?? "";
  let files = byEnvironment.get(key);
  if (!files) byEnvironment.set(key, (files = build(project, environment)));
  return files;
}

function build(project: Project, environment: string | undefined): Files {
  const name = environment ?? "default";
  const { model, diagnostics } = resolved(project, environment);
  if (!model)
    return {
      problems: `${name}: the definitions have problems\n${formatDiagnostics(diagnostics)}`,
    };
  return generatedOutputs(model, name).flatMap(({ label, files }) =>
    Object.entries(files).map(([path, text]) => ({ path: `build/${label}/${path}`, text })),
  );
}

/**
 * The generated files for one table: its SQL or Python file, the copy that
 * lands it, and the Lakeflow Connect pipeline that ingests it as `physical`.
 */
export function generatedForTable(
  files: Generated[],
  table: string,
  physical = table,
): Generated[] {
  return files.filter(
    (file) =>
      file.text.includes(`(table ${table})`) ||
      file.text.includes(`"copy_${table}"`) ||
      new RegExp(`^\\s*destination_table: ${physical}$`, "m").test(file.text),
  );
}

/** The flow table the cursor is in, or the transform's table. */
export function tableAtCursor(text: string, offset: number): string | undefined {
  const kind = kindOf(text);
  if (kind === "Transform") return /^id:\s*(\S+)/m.exec(text)?.[1];
  if (kind !== "Flow") return undefined;
  const lineEnd = text.indexOf("\n", offset);
  const path = keyPath(text, lineEnd === -1 ? text.length : lineEnd);
  const line = text.slice(
    text.lastIndexOf("\n", offset - 1) + 1,
    lineEnd === -1 ? undefined : lineEnd,
  );
  const own = /^ {2}([\w-]+):/.exec(line)?.[1];
  return path[0] === "tables" ? (path[1] ?? own) : undefined;
}
