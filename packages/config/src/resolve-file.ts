// Resolves `${file:path#/pointer}`. A YAML target is resolved with the same
// rules as the file that refers to it (so this module and resolve.ts call each
// other); any other file is returned as literal text.

import { readProjectFile, readYaml } from "./context.js";
import { error, type Diagnostic, type Location } from "./diagnostics.js";
import { parsePointer } from "./json-pointer.js";
import { resolveProjectPath } from "./paths.js";
import { resolveNode } from "./resolve.js";
import type { Walk } from "./scope.js";
import { isYamlPath, nodeAtKeys, type YamlFile } from "./yaml-file.js";

/** Resolves a `file:` reference written in `file`. */
export function resolveFileReference(
  argument: string,
  source: string,
  location: Location,
  file: YamlFile,
  pointer: string,
  walk: Walk,
): unknown {
  if (!countInclude(source, location, walk)) return undefined;
  const hash = argument.indexOf("#");
  const pathText = hash < 0 ? argument : argument.slice(0, hash);
  const fragment = hash < 0 ? undefined : argument.slice(hash + 1);
  const path = resolveProjectPath(file.path, pathText);
  if (path === undefined) {
    walk.context.diagnostics.push(
      error(
        "PATH_OUTSIDE_PROJECT",
        `"${source}" points outside the project.`,
        location,
        "File references must stay inside the project folder.",
      ),
    );
    return undefined;
  }
  if (isYamlPath(path)) {
    return resolveYamlInclude(path, fragment ?? "", source, location, pointer, walk);
  }
  return readTextInclude(path, fragment, source, location, walk);
}

/**
 * Counts one more include against `limits.maxIncludes`. Without this, a few
 * small files that each include the next several times could expand without bound.
 */
function countInclude(source: string, location: Location, walk: Walk): boolean {
  const { context } = walk;
  context.includeCount += 1;
  if (context.includeCount <= context.limits.maxIncludes) return true;
  context.diagnostics.push(
    error(
      "INCLUDE_LIMIT",
      `"${source}" would exceed ${context.limits.maxIncludes} file includes in one load.`,
      location,
      "Include shared files fewer times, or raise limits.maxIncludes.",
    ),
  );
  return false;
}

/** A file that is not YAML is inserted as its exact text; a pointer makes no sense there. */
function readTextInclude(
  path: string,
  fragment: string | undefined,
  source: string,
  location: Location,
  walk: Walk,
): string | undefined {
  if (fragment === undefined) return readProjectFile(walk.context, path, location);
  walk.context.diagnostics.push(
    error(
      "BAD_POINTER",
      `"${source}": a pointer only applies to YAML files.`,
      location,
      `Remove "#${fragment}".`,
    ),
  );
  return undefined;
}

function resolveYamlInclude(
  path: string,
  fragment: string,
  source: string,
  location: Location,
  pointer: string,
  walk: Walk,
): unknown {
  const { diagnostics } = walk.context;
  const keys = parsePointer(fragment);
  if (keys === undefined) {
    const hint = 'A pointer starts with "/", for example #/columns/0.';
    diagnostics.push(
      error("BAD_POINTER", `"${source}": "${fragment}" is not a JSON Pointer.`, location, hint),
    );
    return undefined;
  }
  const includeKey = `${path}#${fragment}`;
  const problem = includeProblem(includeKey, source, location, walk);
  if (problem) {
    diagnostics.push(problem);
    return undefined;
  }

  const target = readYaml(walk.context, path, location);
  if (!target) return undefined;
  const node = nodeAtKeys(target, keys);
  if (!node) {
    walk.context.diagnostics.push(
      error(
        "BAD_POINTER",
        `"${source}": ${path} has no value at "${fragment || "/"}".`,
        location,
        "Check the pointer against the target file.",
      ),
    );
    return undefined;
  }
  const includeStack = [...walk.includeStack, includeKey];
  return resolveNode(node, target, pointer, { ...walk, includeStack });
}

/** A cycle or an over-deep chain of includes, if following `includeKey` would cause one. */
function includeProblem(
  includeKey: string,
  source: string,
  location: Location,
  walk: Walk,
): Diagnostic | undefined {
  const { includeStack, context } = walk;
  if (includeStack.includes(includeKey)) {
    return error(
      "INCLUDE_CYCLE",
      `"${source}" leads back to itself: ${[...includeStack, includeKey].join(" → ")}.`,
      location,
      "Remove one of the references in the chain.",
    );
  }
  if (includeStack.length > context.limits.maxIncludeDepth) {
    return error(
      "INCLUDE_TOO_DEEP",
      `"${source}" is nested more than ${context.limits.maxIncludeDepth} includes deep.`,
      location,
      "Flatten the chain of includes, or raise limits.maxIncludeDepth.",
    );
  }
  return undefined;
}
