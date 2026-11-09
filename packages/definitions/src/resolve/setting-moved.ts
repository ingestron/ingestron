// The fix of `SETTING_MOVED` (specification section 11.4): the intent written at the
// setting's place, and the setting removed. Intent reaches more than a setting did, so the
// fix is offered only where the intent covers just the setting's own flow or table.
import type { Fix, FixEdit } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { AliasStage } from "./aliases.js";
import { holdsReference, writtenValue } from "../internal/index.js";
import { intentPointer, leaves, valueAtIntentPath } from "./intent-values.js";

/** The hint of a `SETTING_MOVED` without a fix. */
export const settingMovedHint =
  "Write the intent by hand where it should apply, and remove this setting.";

/** True unless the setting is plainly written: a `${…}` reference cannot become intent. */
function plainlyWritten(context: Context, alias: AliasStage): boolean {
  const text = writtenValue(context.files, alias.at.document.file, alias.at.pointer);
  return text !== undefined && !holdsReference(text.value);
}

/** True for a setting in a flow's `<action>.with` or a flow table's, the only places with a fix. */
function inFlow(alias: AliasStage): boolean {
  const place = alias.origin === "definition" || alias.origin === "table";
  return place && alias.at.document.kind === "Flow";
}

/**
 * `Write as intent`: in a flow or a flow table, its own intent. None anywhere else (the
 * standard, the platform, a rule's `with`, a transform), where intent would reach other
 * methods and steps than the setting did. None either when the setting is written as a
 * `${…}` reference, which the intent cannot keep.
 */
export function settingMovedFix(context: Context, alias: AliasStage): Fix | undefined {
  if (!inFlow(alias) || !plainlyWritten(context, alias)) return undefined;
  const { document, pointer } = alias.at;
  // The setting is at `<owner>/<action>/with/<setting>`; its intent goes on the owner.
  const owner = pointer.replace(/\/[^/]+\/with\/[^/]+$/, "");
  const edits: FixEdit[] = leaves(alias.intent).map((path) => ({
    file: document.file,
    pointer: owner + intentPointer(path),
    set: valueAtIntentPath(alias.intent, path),
  }));
  const remove: FixEdit = { file: document.file, pointer, remove: true };
  return { title: "Write as intent", edits: [...edits, remove] };
}
