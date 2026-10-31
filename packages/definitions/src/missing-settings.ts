// Required settings nobody set: one problem where the method is used, with a
// fix that adds each key, empty, where it belongs (specification section 3).
import type { DefinitionDocument, FixEdit } from "@ingestron/config";
import type { Context } from "./context.js";
import { isRecord } from "./merge.js";
import type { Action, Method } from "./pack.js";

/** The flow or transform that uses a method, and where in it the problem is shown. */
export interface SettingsUser {
  owner: DefinitionDocument;
  at: string;
}

/** One method used by one flow or transform. */
export interface MethodUse {
  action: Action;
  id: string;
  method: Method;
  user: SettingsUser;
}

/** Reports the missing keys once, with what each holds and the fix. */
export function reportMissing(context: Context, use: MethodUse, missing: string[]): void {
  const properties =
    (use.method.settings as { properties?: Record<string, { description?: string }> }).properties ??
    {};
  const hint = missing
    .map((key) => `${key}: ${properties[key]?.description ?? "required."}`)
    .join("\n");
  context.reporter.error(
    "BAD_SETTING",
    `"${use.id}" needs settings: ${missing.join(", ")}.`,
    { document: use.user.owner, pointer: use.user.at },
    hint,
    [{ title: "Add the missing settings", edits: missingEdits(context, use, missing) }],
  );
}

interface Home {
  document: DefinitionDocument;
  pointer: string;
  existing: unknown;
}

/** Where each key belongs: the platform, the standard, or the flow or transform. */
function homeOf(context: Context, use: MethodUse, key: string): Home {
  const { platform = [], standard = [] } = use.method.placement ?? {};
  if (platform.includes(key) && context.platform) return platformHome(context, use);
  if (platform.includes(key) || standard.includes(key)) return standardHome(context, use);
  const own = (use.user.owner.value as Record<string, { with?: unknown } | undefined>)[use.action];
  return { document: use.user.owner, pointer: `/${use.action}/with`, existing: own?.with };
}

function platformHome(context: Context, { id }: MethodUse): Home {
  const document = context.platform!;
  return { document, pointer: `/settings/${id}`, existing: document.value.settings?.[id] };
}

function standardHome(context: Context, { action, id }: MethodUse): Home {
  const document = context.standard;
  const existing = document.value[action]?.settings?.[id];
  return { document, pointer: `/${action}/settings/${id}`, existing };
}

/** Into a mapping that exists, one key each; otherwise the mapping with every key. */
function missingEdits(context: Context, use: MethodUse, missing: string[]): FixEdit[] {
  const homes = new Map<string, { home: Home; keys: string[] }>();
  for (const key of missing) {
    const home = homeOf(context, use, key);
    const name = `${home.document.file}#${home.pointer}`;
    const entry = homes.get(name) ?? { home, keys: [] };
    entry.keys.push(key);
    homes.set(name, entry);
  }
  return [...homes.values()].flatMap<FixEdit>(({ home, keys }) =>
    isRecord(home.existing)
      ? keys.map((key) => ({
          file: home.document.file,
          pointer: `${home.pointer}/${key}`,
          set: null,
        }))
      : [
          {
            file: home.document.file,
            pointer: home.pointer,
            set: Object.fromEntries(keys.map((key) => [key, null])),
          },
        ],
  );
}
