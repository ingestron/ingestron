// The generated files, in memory, exactly as the CLI would write them, and
// the ones that belong to the table at the cursor.
import { kindOf } from "./context.js";
import { environmentName, generationOf } from "./generation.js";
import type { Project } from "./project.js";
import { keyPath } from "./yaml.js";

/** One generated file, at its path in the project (under build/). */
export interface Generated {
  path: string;
  text: string;
}

type Files = Generated[] | { problems: string };
const built = new WeakMap<Project, Map<string, Files>>();

/**
 * Every file `apply` writes that the environment uses, at its path under build/, or what
 * stops plan, as plan prints it; once per project snapshot. Every environment is generated
 * together: a pack that builds them together has one folder for all its environments, such
 * as `build/adf/factory/…`, and the passports and any other pack have a folder for each,
 * such as `build/duckdb/dev/…`, of which only the environment's own is given.
 */
export function generatedFiles(project: Project, environment: string | undefined): Files {
  let byEnvironment = built.get(project);
  if (!byEnvironment) built.set(project, (byEnvironment = new Map()));
  const key = environment ?? "";
  let files = byEnvironment.get(key);
  if (!files) byEnvironment.set(key, (files = build(project, environment)));
  return files;
}

function build(project: Project, environment: string | undefined): Files {
  const generation = generationOf(project);
  if (!generation.ok) return { problems: generation.text.trimEnd() };
  const name = environmentName(environment);
  return generation.outputs
    .filter((output) => output.targets.includes(name))
    .flatMap(({ folder, byEnvironment, files }) =>
      Object.entries(files)
        .filter(([path]) => !byEnvironment || path.startsWith(`${name}/`))
        .map(([path, text]) => ({ path: `build/${folder}/${path}`, text })),
    );
}

/**
 * The generated files for one table: its SQL or Python file, the copy that
 * lands it, the Lakeflow Connect pipeline that ingests it as `physical`, the
 * Synapse view named `physical`, and DuckDB's `tables/<schema>.<physical>.sql`
 * (any schema when `schema` is not given).
 */
export function generatedForTable(
  files: Generated[],
  table: string,
  physical = table,
  schema?: string,
): Generated[] {
  return files.filter(
    (file) =>
      file.text.includes(`(table ${table})`) ||
      file.text.includes(`"copy_${table}"`) ||
      new RegExp(`^\\s*destination_table: ${physical}$`, "m").test(file.text) ||
      file.text.includes(`.[${physical.replaceAll("]", "]]")}] AS\n`) ||
      (file.path.endsWith(schema ? `/${schema}.${physical}.sql` : `.${physical}.sql`) &&
        /^build\/duckdb\/[^/]+\/tables\//.test(file.path)),
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
