// The Platform fields each pack says it reads (specification section 7): every
// path must be a field of the Platform schema, or the pack is refused.
import { kinds } from "./documents.js";
import { isRecord } from "./merge.js";
import type { PackInfo } from "./pack.js";
import { branches, type Schema } from "./schema-nodes.js";

const platform = kinds.platform.schema as Schema;

/**
 * Throws for the first path a pack lists in `platformFields` that is not a field of the
 * Platform schema. A pack's list is its own mistake, not the project's, so it is not a
 * diagnostic: whatever tool gives the pack to resolution stops with it.
 */
export function checkPlatformFields(packs: readonly PackInfo[]): void {
  for (const pack of packs) {
    for (const path of pack.platformFields ?? []) {
      if (!isPlatformField(path))
        throw new Error(
          `The pack "${pack.id}" lists the platform field "${path}", which the Platform document does not have.`,
        );
    }
  }
}

/** A dot path from the document's root, `*` for any key of a mapping or any list item. */
function isPlatformField(path: string): boolean {
  let nodes: Schema[] = [platform];
  for (const key of path.split(".")) {
    nodes = nodes.flatMap((node) => childrenAt(node, key));
    if (nodes.length === 0) return false;
  }
  return true;
}

/** The schemas `key` leads to from a node: a property in any branch, or for `*` its values or items. */
function childrenAt(node: Schema, key: string): Schema[] {
  return branches(platform, node).flatMap((part) => {
    if (key !== "*") {
      const properties = part.properties;
      const child = isRecord(properties) && Object.hasOwn(properties, key) && properties[key];
      return isRecord(child) ? [child] : [];
    }
    return [part.additionalProperties, part.items].filter(isRecord);
  });
}
