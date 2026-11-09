// The fix of `SETTING_MOVED` (specification section 11.4): the intent written at the
// setting's place, and the setting removed.
import type { Fix, FixEdit } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { AliasStage } from "./aliases.js";
import { intentPointer, leaves, valueAtIntentPath } from "./intent-values.js";

/** Intent paths the standard's top-level sections hold under another name. */
const standardPointers: Record<string, string> = {
  "load.mode": "/load/default",
  "load.deletes.mode": "/load/deletes",
};

/** The standard's top-level sections that hold intent paths as `Intent` names them. */
const standardSections = ["audit", "rescued", "retention", "storage"];

/**
 * `Write as intent`: in a flow, transform or flow table, its own intent; in the standard's
 * settings, its top-level sections, or every layer for `history`. None when the place has
 * no field for the intent, as in a rule's `with` or the platform.
 */
export function settingMovedFix(context: Context, alias: AliasStage): Fix | undefined {
  const edits = intentEdits(context, alias);
  if (!edits) return undefined;
  const { document, pointer } = alias.at;
  const remove: FixEdit = { file: document.file, pointer, remove: true };
  return { title: "Write as intent", edits: [...edits, remove] };
}

function intentEdits(context: Context, alias: AliasStage): FixEdit[] | undefined {
  const paths = leaves(alias.intent);
  const file = alias.at.document.file;
  if (alias.origin === "definition" || alias.origin === "table") {
    // The setting is at `<owner>/<action>/with/<setting>`; its intent goes on the owner.
    const owner = alias.at.pointer.replace(/\/[^/]+\/with\/[^/]+$/, "");
    return paths.map((path) => ({
      file,
      pointer: owner + intentPointer(path),
      set: valueAtIntentPath(alias.intent, path),
    }));
  }
  return alias.origin === "standard" ? standardEdits(context, alias, paths) : undefined;
}

function standardEdits(
  context: Context,
  alias: AliasStage,
  paths: string[],
): FixEdit[] | undefined {
  const file = context.standard.file;
  const edits = paths.map((path) => {
    const value = valueAtIntentPath(alias.intent, path);
    if (path === "history") return layerEdits(context, value);
    const section = standardSections.includes(path.split(".")[0] ?? "");
    const pointer = standardPointers[path] ?? (section ? intentPointer(path) : undefined);
    return pointer === undefined ? undefined : [{ file, pointer, set: value }];
  });
  return edits.every((edit) => edit !== undefined) ? edits.flat() : undefined;
}

/**
 * `history` on every layer that does not set it, as the standard has no top-level field
 * for it: a layer written as a name becomes an object, and without a list of layers the
 * pack's default layers are written out.
 */
function layerEdits(context: Context, history: unknown): FixEdit[] {
  const file = context.standard.file;
  const written = context.standard.value.layers;
  if (!written) {
    const layers = context.pack.defaults.layers.map((name) => ({ name, history }));
    return [{ file, pointer: "/layers", set: layers }];
  }
  return written.flatMap((layer, index): FixEdit[] => {
    if (typeof layer === "string")
      return [{ file, pointer: `/layers/${index}`, set: { name: layer, history } }];
    if (layer.history !== undefined) return [];
    return [{ file, pointer: `/layers/${index}/history`, set: history }];
  });
}
