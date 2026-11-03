import type { DefinitionDocument } from "./documents.js";
import type { KindDefinition } from "./kinds.js";
import type { Scope } from "./scope.js";

/**
 * One `${envvar:…}` reference a load resolved (spec/config/syntax.md §4.6). It never holds
 * the variable's value.
 * @example
 * { name: "LANDING", file: "project.yaml", pointer: "/values/landing", setIn: ".env.dev" }
 */
export interface EnvvarReference {
  /** The variable's name. */
  name: string;
  /** The file of the document the reference feeds, or the manifest for its values. */
  file: string;
  /** The JSON Pointer of the value it feeds in that document. */
  pointer: string;
  /**
   * Where the value came from: `host` for the environment Ingestron runs in,
   * `.env.<environment>` or `.env`. Absent when the variable is set nowhere.
   */
  setIn?: string;
}

/** A successfully loaded project. */
export interface Project {
  id: string;
  name?: string;
  /** The selected environment's name, if one was selected. */
  environment?: string;
  /** The pack the selected environment runs on (its `runs-on`), if it names one. */
  runsOn?: string;
  /** Project values after the environment's values were merged in. */
  values: unknown;
  /**
   * The text of each `${envvar:…}` reference left as written because its variable is set
   * nowhere, each once, in the order first left. Only a load with `missingEnvvars:
   * "information"` leaves any. A text value that contains one is not known yet, so checks
   * leave it alone (spec/config/syntax.md §5.1).
   */
  unsetEnvvars: readonly string[];
  /**
   * Each `${envvar:…}` reference the load resolved, once per name, file and pointer, in the
   * order first resolved, so a tool can say which variables the project needs.
   */
  envvarReferences: readonly EnvvarReference[];
  /** Every document, in file path order. */
  documents: readonly DefinitionDocument[];
  /** The document of this kind with this id, if there is one. */
  get<T>(kind: KindDefinition<T>, id: string): DefinitionDocument<T> | undefined;
  /** Every document of this kind, in file path order. */
  all<T>(kind: KindDefinition<T>): DefinitionDocument<T>[];
}

/** Builds the {@link Project} returned by a successful load. */
export function createProject(
  scope: Scope,
  documents: readonly DefinitionDocument[],
  runsOn?: string,
  envvars: { unset: readonly string[]; references: readonly EnvvarReference[] } = {
    unset: [],
    references: [],
  },
): Project {
  // Documents passed their kind's schema, so treating them as `T` is safe
  // as long as `T` matches the schema; defineKind's documentation says so.
  const all = <T>(kind: KindDefinition<T>) =>
    documents.filter(
      (document) => document.apiVersion === kind.apiVersion && document.kind === kind.kind,
    ) as DefinitionDocument<T>[];
  return {
    id: scope.project.id,
    name: scope.project.name,
    environment: scope.environment?.name,
    ...(runsOn && { runsOn }),
    values: scope.values,
    unsetEnvvars: envvars.unset,
    envvarReferences: envvars.references,
    documents,
    all,
    get: (kind, id) => all(kind).find((document) => document.id === id),
  };
}
