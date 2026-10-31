// Reads the project manifest: identity, values, environments and imports.

import { readYaml, type LoadContext } from "./context.js";
import { isRecord, mergeValues } from "./data.js";
import { error, warning } from "./diagnostics.js";
import { matchesGlob } from "./glob.js";
import { parsePointer } from "./json-pointer.js";
import type { JsonSchema } from "./kinds.js";
import { resolveProjectPath } from "./paths.js";
import { resolveNode } from "./resolve.js";
import type { Scope } from "./scope.js";
import { createSchemaChecker } from "./validate.js";
import { locationOf, nodeAtKeys, type YamlFile } from "./yaml-file.js";

const idPattern = "^[A-Za-z][A-Za-z0-9_-]*$";

/**
 * JSON Schema for the manifest file, with descriptions for editor hover.
 * Use it as it is for project.yaml: the manifest's fields are read literally,
 * so it needs no `toEditorSchema` step.
 * @example
 * writeFileSync("project.editor.json", JSON.stringify(manifestSchema));
 */
export const manifestSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "imports"],
  properties: {
    id: {
      type: "string",
      pattern: idPattern,
      description:
        "Identifier of the project, read by `${project.id}`. Letters, digits, `_` and `-`.",
    },
    name: {
      type: "string",
      description: "Display name of the project, read by `${project.name}`.",
    },
    values: {
      type: "object",
      description:
        "Values that documents read with `${values.…}`. Entries may use references, but not `${values.…}`.",
    },
    environments: {
      type: "object",
      description:
        "Environments that can be selected when loading. Each one's `values` are merged over the top-level `values`.",
      propertyNames: { pattern: idPattern },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          values: {
            type: "object",
            description: "Values that replace or add to the top-level `values`.",
          },
          "runs-on": {
            type: "string",
            pattern: "^[a-z][a-z0-9-]*$",
            description:
              "Run every step after the files land with this pack here, such as duckdb for local runs.",
            examples: ["duckdb"],
          },
        },
      },
    },
    imports: {
      type: "array",
      minItems: 1,
      description:
        "Glob patterns of the documents to load, relative to this file. `*` stays in one folder; `**` crosses folders.",
      items: { type: "string", minLength: 1 },
    },
  },
};

interface ManifestFields {
  id: string;
  name?: string;
  environments?: Record<string, unknown>;
  imports: string[];
}

/** The manifest after reading: its file, the reference scope, and the import patterns. */
export interface Manifest {
  file: YamlFile;
  scope: Scope;
  imports: string[];
  /** The pack the selected environment runs on; references cannot read it. */
  runsOn?: string;
}

/** Reads and checks the manifest, then resolves the values for `environment`. */
export function readManifest(
  context: LoadContext,
  path: string,
  environment: string | undefined,
): Manifest | undefined {
  const file = readYaml(context, path);
  if (!file) return undefined;
  const fields = manifestFields(context, file);
  if (fields === undefined) return undefined;
  const check = createSchemaChecker();
  const problems = check(
    manifestSchema,
    fields,
    (pointer) => locationOf(file, nodeAtKeys(file, parsePointer(pointer) ?? [])),
    path,
  );
  context.diagnostics.push(...problems);
  if (problems.length > 0 || !isRecord(fields)) return undefined;
  const manifest = fields as unknown as ManifestFields;

  const selected = selectEnvironment(context, file, manifest, environment);
  const scope: Scope = {
    project: { id: manifest.id, ...(manifest.name === undefined ? {} : { name: manifest.name }) },
    environment: selected && { name: selected.name },
  };
  scope.values = resolveValues(context, file, scope);
  return {
    file,
    scope,
    imports: manifest.imports,
    ...(selected?.runsOn && { runsOn: selected.runsOn }),
  };
}

/** The manifest as plain data. The YAML library throws when aliases expand too far. */
function manifestFields(context: LoadContext, file: YamlFile): unknown {
  try {
    return file.document.toJS({ maxAliasCount: context.limits.maxAliases }) as unknown;
  } catch {
    context.diagnostics.push(
      error(
        "ALIAS_LIMIT",
        `${file.path} expands YAML aliases more than ${context.limits.maxAliases} times.`,
        locationOf(file, undefined),
        "Use fewer aliases, or raise limits.maxAliases.",
      ),
    );
    return undefined;
  }
}

function selectEnvironment(
  context: LoadContext,
  file: YamlFile,
  manifest: ManifestFields,
  environment: string | undefined,
): { name: string; runsOn?: string } | undefined {
  if (environment === undefined) return undefined;
  const declared = Object.keys(manifest.environments ?? {});
  if (declared.includes(environment)) {
    const runsOn = (manifest.environments?.[environment] as { "runs-on"?: unknown } | undefined)?.[
      "runs-on"
    ];
    return { name: environment, ...(typeof runsOn === "string" && { runsOn }) };
  }
  context.diagnostics.push(
    error(
      "UNKNOWN_ENVIRONMENT",
      `Environment "${environment}" is not declared in ${file.path}.`,
      locationOf(file, nodeAtKeys(file, ["environments"])),
      declared.length > 0
        ? `Declared environments: ${declared.join(", ")}.`
        : "Declare it under environments:.",
    ),
  );
  return undefined;
}

/** Top-level values, with the selected environment's values merged over them. */
function resolveValues(context: LoadContext, file: YamlFile, scope: Scope): unknown {
  const walk = { context, scope, sourceMap: new Map(), includeStack: [`${file.path}#`] };
  const base = resolveNode(nodeAtKeys(file, ["values"]), file, "/values", walk);
  if (!scope.environment) return base ?? {};
  const keys = ["environments", scope.environment.name, "values"];
  const override = resolveNode(nodeAtKeys(file, keys), file, "/values", walk);
  return mergeValues(base ?? {}, override ?? {});
}

/** The project files matched by the manifest's imports, in path order. */
export function importedPaths(context: LoadContext, manifest: Manifest): string[] {
  const allPaths = context.files.list().filter((path) => path !== manifest.file.path);
  const found = new Set<string>();
  manifest.imports.forEach((pattern, index) => {
    const location = locationOf(
      manifest.file,
      nodeAtKeys(manifest.file, ["imports", String(index)]),
    );
    const fullPattern = resolveProjectPath(manifest.file.path, pattern);
    if (fullPattern === undefined) {
      context.diagnostics.push(
        error(
          "PATH_OUTSIDE_PROJECT",
          `Import "${pattern}" points outside the project.`,
          location,
          "Imports are relative to the manifest's folder and must stay inside it.",
        ),
      );
      return;
    }
    const matches = allPaths.filter((path) => matchesGlob(path, fullPattern));
    if (matches.length === 0) {
      context.diagnostics.push(
        warning(
          "NO_MATCH",
          `No files match the import "${pattern}".`,
          location,
          "Check the pattern. It is relative to the manifest's folder.",
        ),
      );
    }
    matches.forEach((path) => found.add(path));
  });
  return [...found].sort();
}
