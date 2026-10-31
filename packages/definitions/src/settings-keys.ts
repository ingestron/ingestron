// Settings are written under a method's name; a name that is no method would
// be silently ignored, so it is refused where it is written, with a fix
// renaming it to the near method (specification section 3).
import type { DefinitionDocument, Fix } from "@ingestron/config";
import type { Context } from "./context.js";
import { isRecord } from "./merge.js";
import type { Action } from "./pack.js";

const actions: Action[] = ["ingest", "transform", "store"];

/** Reports each settings key, in the standard and the platform, that names no method. */
export function checkSettingsKeys(context: Context): void {
  const { standard, platform, pack } = context;
  for (const action of actions) {
    const rules = standard.value[action];
    const methods = Object.keys(pack.methods).filter((id) => pack.methods[id]!.action === action);
    for (const group of ["settings", "fixed"] as const)
      checkKeys(context, standard, `/${action}/${group}`, rules?.[group], methods);
  }
  if (platform)
    checkKeys(context, platform, "/settings", platform.value.settings, Object.keys(pack.methods));
}

function checkKeys(
  context: Context,
  document: DefinitionDocument,
  pointer: string,
  value: unknown,
  methods: string[],
): void {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value).filter((name) => !methods.includes(name))) {
    const near = methods.find((method) => distance(method, key) <= 2);
    const fixes: Fix[] = near
      ? [
          {
            title: `Rename to "${near}"`,
            edits: [{ file: document.file, pointer: `${pointer}/${key}`, rename: near }],
          },
        ]
      : [];
    context.reporter.error(
      "UNKNOWN_METHOD",
      `"${key}" is not a method of the standard's packs, so these settings would apply to nothing.`,
      { document, pointer: `${pointer}/${key}` },
      `Methods: ${methods.join(", ")}.`,
      fixes,
    );
  }
}

/** Edit distance (insert, delete, replace). */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1)
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length]!;
}
