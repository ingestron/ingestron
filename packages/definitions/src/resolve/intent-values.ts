// Intent as the documents write it, turned into the shape of `Intent`
// (specification section 11.2), and the checks of which values take part.
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import { isRecord } from "../internal/index.js";
import type { AuditDoc, Intent } from "../intent/index.js";

/** The keys of a document that are intent, as `Intent` names them. */
const intentKeys = ["load", "history", "sequence", "audit", "rescued", "retention", "storage"];

/** The intent a document, or a part of one, writes: its intent keys, with audit entries named. */
export function intentOfDocument(document: object): Intent {
  const written = document as Record<string, unknown>;
  const picked = Object.fromEntries(
    intentKeys.filter((key) => written[key] !== undefined).map((key) => [key, written[key]]),
  );
  const audit = written["audit"] as AuditDoc | undefined;
  return tidy({
    ...picked,
    ...(audit && {
      audit: audit.map((entry) =>
        typeof entry === "string" ? { value: entry, as: `_${entry}` } : entry,
      ),
    }),
  }) as Intent;
}

/** The value without empty mappings, and without mappings that held nothing else. */
export function tidy(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const entries = Object.entries(value)
    .map(([key, child]) => [key, tidy(child)] as const)
    .filter(([, child]) => child !== undefined && !(isRecord(child) && isEmpty(child)));
  return Object.fromEntries(entries);
}

function isEmpty(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}

/** The intent without `load`: a transform's table is not loaded from a source. */
export function withoutLoad(intent: Intent): Intent {
  const rest = { ...intent };
  delete rest.load;
  return rest;
}

/** Every intent path that has a value in the intent; a list is one value. */
export function leaves(value: unknown, prefix = ""): string[] {
  if (!isRecord(value)) return prefix === "" ? [] : [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

/**
 * The intent without the values that decide what is generated and hold a deploy-time
 * value: they are not known, so they set nothing (specification section 11.2).
 */
export function decided(context: Context, intent: Intent): Intent {
  const unset = (value: unknown) => holdsUnsetEnvvar(context.project, value);
  const result = structuredClone(intent);
  if (unset(result.history)) delete result.history;
  if (result.load) loadDecided(result.load, unset);
  if (result.storage) featuresDecided(result.storage, unset);
  return tidy(result) as Intent;
}

function loadDecided(load: NonNullable<Intent["load"]>, unset: (value: unknown) => boolean): void {
  if (unset(load.mode)) delete load.mode;
  if (load.deletes && unset(load.deletes.mode)) delete load.deletes.mode;
}

function featuresDecided(
  storage: NonNullable<Intent["storage"]>,
  unset: (value: unknown) => boolean,
): void {
  const known = storage.features?.filter((feature) => !unset(feature));
  if (known?.length === storage.features?.length) return;
  if (known && known.length > 0) storage.features = known;
  else delete storage.features;
}
