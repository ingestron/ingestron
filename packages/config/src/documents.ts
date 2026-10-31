// Loads one imported file as a document: resolve, check the header, find
// its kind, validate against the kind's schema.

import { errorCount, readYaml, type LoadContext } from "./context.js";
import { isRecord } from "./data.js";
import { error, type Diagnostic, type Location } from "./diagnostics.js";
import type { KindDefinition } from "./kinds.js";
import { resolveNode } from "./resolve.js";
import type { Scope } from "./scope.js";
import { createSchemaChecker, locateIn } from "./validate.js";

/** One resolved and validated document. */
export interface DefinitionDocument<T = unknown> {
  apiVersion: string;
  kind: string;
  id: string;
  /** Project path of the file the document was read from. */
  file: string;
  /** The whole resolved document, including apiVersion, kind and id. */
  value: T;
  /**
   * Where the value at a JSON Pointer (such as `/store/uses`) was written,
   * for diagnostics of your own. Falls back to the nearest written parent,
   * and finally to the start of the document. Values included with
   * `${file:…}` point into the included file.
   */
  locate(pointer: string): Location;
}

/** A document plus what later checks need: its kind and its source map. */
export interface LoadedDocument {
  definition: KindDefinition;
  document: DefinitionDocument;
  sourceMap: Map<string, Location>;
  /**
   * False when the document failed its schema. It still counts as existing,
   * so links to it are not reported as broken too, but its own links are not
   * checked.
   */
  valid: boolean;
}

type SchemaChecker = ReturnType<typeof createSchemaChecker>;

/**
 * Loads the document in `path`. Returns `undefined` after reporting why it
 * failed, or a document with `valid: false` when only its schema check failed.
 */
export function loadDocument(
  context: LoadContext,
  path: string,
  scope: Scope,
  kinds: readonly KindDefinition[],
  checkSchema: SchemaChecker,
): LoadedDocument | undefined {
  const file = readYaml(context, path);
  if (!file) return undefined;
  const errorsBefore = errorCount(context);
  const walk = {
    context,
    scope,
    sourceMap: new Map<string, Location>(),
    includeStack: [`${path}#`],
  };
  const value = resolveNode(file.document.contents, file, "", walk);
  if (errorCount(context) > errorsBefore) return undefined;

  const root: Location = walk.sourceMap.get("") ?? { file: path, line: 1, column: 1 };
  const header = readHeader(value, path, root, context.diagnostics);
  if (!header) return unloaded(context, value);
  const definition = findKind(kinds, header, root, context.diagnostics);
  if (!definition) return unloaded(context, value);
  const problems = checkSchema(definition.schema, value, locateIn(walk.sourceMap), path);
  context.diagnostics.push(...problems);
  const locate = locateIn(walk.sourceMap);
  const document = {
    ...header,
    file: path,
    value,
    locate: (pointer: string) => locate(pointer) ?? root,
  };
  return { definition, sourceMap: walk.sourceMap, document, valid: problems.length === 0 };
}

type Header = Pick<DefinitionDocument, "apiVersion" | "kind" | "id">;

/** Remembers what a document that could not be loaded says it is. */
function unloaded(context: LoadContext, value: unknown): undefined {
  if (isRecord(value) && typeof value.id === "string")
    context.unloaded.push({
      id: value.id,
      ...(typeof value.kind === "string" && { kind: value.kind }),
    });
  return undefined;
}

function readHeader(
  value: unknown,
  path: string,
  root: Location,
  diagnostics: Diagnostic[],
): Header | undefined {
  const fields = ["apiVersion", "kind", "id"] as const;
  const missing = fields.filter((field) => !isRecord(value) || typeof value[field] !== "string");
  if (missing.length === 0 && isRecord(value)) {
    return {
      apiVersion: value.apiVersion as string,
      kind: value.kind as string,
      id: value.id as string,
    };
  }
  diagnostics.push(
    error(
      "MISSING_HEADER",
      `${path} needs text fields apiVersion, kind and id; missing: ${missing.join(", ")}.`,
      root,
      "Add the missing fields at the top of the file.",
    ),
  );
  return undefined;
}

function findKind(
  kinds: readonly KindDefinition[],
  header: Header,
  root: Location,
  diagnostics: Diagnostic[],
): KindDefinition | undefined {
  const found = kinds.find(
    (kind) => kind.apiVersion === header.apiVersion && kind.kind === header.kind,
  );
  if (found) return found;
  const known = kinds.map((kind) => `${kind.apiVersion} ${kind.kind}`).join(", ") || "none";
  diagnostics.push(
    error(
      "UNKNOWN_KIND",
      `No kind "${header.kind}" with apiVersion "${header.apiVersion}" is registered.`,
      root,
      `Registered kinds: ${known}.`,
    ),
  );
  return undefined;
}

/** Reports a document whose kind and id are already used by an earlier one. */
export function checkDuplicateIds(
  loaded: readonly LoadedDocument[],
  diagnostics: Diagnostic[],
): void {
  const firstFile = new Map<string, string>();
  for (const { document, sourceMap } of loaded) {
    const key = `${document.apiVersion} ${document.kind} ${document.id}`;
    const earlier = firstFile.get(key);
    if (earlier === undefined) {
      firstFile.set(key, document.file);
      continue;
    }
    diagnostics.push(
      error(
        "DUPLICATE_ID",
        `Another ${document.kind} document already has id "${document.id}" (${earlier}).`,
        sourceMap.get(""),
        "Give each document of a kind its own id.",
      ),
    );
  }
}
