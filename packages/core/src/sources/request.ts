// The source request: for each connection a flow reads from, what to run, call or export to get
// its metadata, the alternatives, where to save each file and the commands that import them
// (spec/cli/sources.md, section 4). The editor shows the same text.
import type { FileSource, Project } from "@ingestron/config";
import { kinds, resolveDefinitions, type SourceTable } from "@ingestron/definitions";
import type { ProjectOptions } from "../generation/index.js";
import { packs } from "../packs/index.js";
import { hostProject, problemsText, resolving } from "../request/index.js";
import { byCodePoint } from "./changes.js";
import type { SourceRecipe } from "./recipe.js";
import { sourceOrigin, sourceRecipes } from "./recipes.js";
import { sourceSection, type SectionInput } from "./request-step.js";

/**
 * The message for a connection the project lacks, with every connection id in code point order
 * (spec/cli/sources.md, section 4, "Resolving"); the import gives it too.
 * @internal
 */
export function notAConnection(id: string, connections: readonly string[]): string {
  const ids = [...connections].sort(byCodePoint);
  return `"${id}" is not a connection of the project. Connections: ${ids.join(", ") || "none"}.`;
}

/**
 * What the source request is for, beyond the environment.
 * @public
 */
export interface SourceRequestOptions extends ProjectOptions {
  /** The one connection to ask about; by default, every connection a flow reads from. */
  connection?: string;
  /** The recipes to use; by default the installed ones and the project's own (`sourceRecipes`). */
  recipes?: Map<string, SourceRecipe>;
}

/** The errors that do not stop the request, since the metadata it asks for settles them. */
const settled = new Set<string>([
  "TABLE_NO_COLUMNS",
  "CONTRACT_NEEDED",
  "SOURCE_COLUMN_GONE",
  "SOURCE_TYPE_CHANGED",
  "SOURCE_NULLABLE",
  "SOURCE_KEY_CHANGED",
  "SOURCE_TABLE_GONE",
]);

/**
 * The errors among the diagnostics that the metadata does not settle, and so stop a request or a
 * draft (spec/cli/sources.md, section 4, "Resolving").
 * @internal
 */
export function stoppingErrors<T extends { severity: string; code: string }>(
  diagnostics: readonly T[],
): T[] {
  return diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error" && !settled.has(diagnostic.code),
  );
}

const introduction =
  "Ingestron needs to know what each source table looks like: its columns, their types and its key. Only names and types are needed, never rows of real data. Save each file where this request says.";

/**
 * The source request as Markdown, ready to send to whoever can reach the sources; a short note
 * instead when the definitions have problems. A variable set nowhere is not an error here.
 * @example
 * console.log(sourceRequest(nodeFiles("."), "dev"));
 * @public
 */
export function sourceRequest(
  files: FileSource,
  environment?: string,
  options: SourceRequestOptions = {},
): string {
  return sourceRequestFor(files, environment, options).text;
}

/**
 * The source request's text, and whether the definitions resolved; false gives the short note.
 * @internal
 */
export function sourceRequestFor(
  files: FileSource,
  environment: string | undefined,
  options: SourceRequestOptions = {},
): { text: string; resolved: boolean } {
  const name = environment ?? "default";
  const envvars = options.envvars ?? process.env;
  const { diagnostics, sourceTables = [] } = resolveDefinitions(files, {
    ...resolving,
    sourceTables: true,
    packs: [...(options.packs ?? packs)],
    envvars,
    environment,
  });
  const project = hostProject(files, environment, envvars);
  const asked = askedFor(files, project, sourceTables, options);
  const errors = stoppingErrors(diagnostics);
  if (errors.length > 0 || asked.problems.length > 0 || project === undefined)
    return {
      text: problemsText(`# Source request (${name})`, errors, asked.problems),
      resolved: false,
    };
  return { text: requestText(project.id, name, asked.sections, environment), resolved: true };
}

/** The request: its title and introduction, each connection's section, and the imports. */
function requestText(
  id: string,
  name: string,
  inputs: readonly SectionInput[],
  environment: string | undefined,
): string {
  const sections = inputs.map(sourceSection);
  return [
    `# Source request: ${id} (${name})`,
    introduction,
    ...(sections.length > 0
      ? sections.map((section) => section.text)
      : ["No flow reads from a connection, so there is nothing to ask for."]),
    importing(
      sections.flatMap((section) => section.imports),
      environment,
    ),
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}

/**
 * What each section is given, and the problems that stop the request: an unknown connection, a
 * recipe that breaks a rule and the recipe problems of each connection the request covers. When
 * the project could not be loaded, its connections are not known, and only its errors are shown.
 */
function askedFor(
  files: FileSource,
  project: Project | undefined,
  sourceTables: readonly SourceTable[],
  options: SourceRequestOptions,
): { sections: SectionInput[]; problems: string[] } {
  if (project === undefined) return { sections: [], problems: [] };
  const connections = project.all(kinds.connection).map(({ value }) => value);
  const problems: string[] = [];
  const ids = connections.map((connection) => connection.id).sort(byCodePoint);
  const { connection: named } = options;
  if (named !== undefined && !ids.includes(named)) problems.push(notAConnection(named, ids));
  const recipes = options.recipes ?? recipesOf(files, problems);
  if (recipes === undefined) return { sections: [], problems };
  const chosen =
    named !== undefined
      ? connections.filter((connection) => connection.id === named)
      : connections
          .filter((connection) => sourceTables.some((table) => table.connection === connection.id))
          .sort((a, b) => byCodePoint(a.id, b.id));
  const sections = chosen.map((connection) => {
    const { recipe, inputs, problems: found } = sourceOrigin(connection, recipes);
    problems.push(...found);
    const tables = sourceTables.filter((table) => table.connection === connection.id);
    const given = givenInputs(inputs, project.unsetEnvvars);
    return { connection: connection.id, tables, inputs: given, ...(recipe && { recipe }) };
  });
  return { sections, problems };
}

/** The inputs given: one whose value holds an unset reference is not (section 1, "Placeholders"). */
function givenInputs(
  inputs: Record<string, string>,
  unset: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(inputs).filter(([, value]) => !unset.some((text) => value.includes(text))),
  );
}

/** The installed recipes and the project's own; a broken one is a problem. */
function recipesOf(files: FileSource, problems: string[]): Map<string, SourceRecipe> | undefined {
  try {
    return sourceRecipes(files);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

/** The commands that import each file the steps save; nothing when nothing was asked for. */
function importing(lines: readonly string[], environment: string | undefined): string | undefined {
  if (lines.length === 0) return undefined;
  const env = environment !== undefined ? ` --env ${environment}` : "";
  const commands = lines.map((line) => `ingestron source import ${line}${env}`).join("\n");
  return [
    "## Importing",
    "Import each file you saved, from the project's folder:",
    `\`\`\`sh\n${commands}\n\`\`\``,
    "A file saved as one of the alternatives is imported the same way, with its own path. Add `--dry-run` to see what a file would change without writing anything.",
  ].join("\n\n");
}
