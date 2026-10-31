import type { DefinitionDocument } from "./documents.js";
import type { KindDefinition } from "./kinds.js";
import type { Scope } from "./scope.js";

/** A successfully loaded project. */
export interface Project {
  id: string;
  name?: string;
  /** The selected environment's name, if one was selected. */
  environment?: string;
  /** Project values after the environment's values were merged in. */
  values: unknown;
  /** Every document, in file path order. */
  documents: readonly DefinitionDocument[];
  /** The document of this kind with this id, if there is one. */
  get<T>(kind: KindDefinition<T>, id: string): DefinitionDocument<T> | undefined;
  /** Every document of this kind, in file path order. */
  all<T>(kind: KindDefinition<T>): DefinitionDocument<T>[];
}

/** Builds the {@link Project} returned by a successful load. */
export function createProject(scope: Scope, documents: readonly DefinitionDocument[]): Project {
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
    values: scope.values,
    documents,
    all,
    get: (kind, id) => all(kind).find((document) => document.id === id),
  };
}
