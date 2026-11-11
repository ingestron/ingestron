// The Platform's pack sections and the Databricks fields that moved into one
// (specification sections 7 and 7.2). Reading only, over the document as written, so
// every module that reads the Platform reads the moved fields the same way.
import { isRecord } from "../internal/index.js";
import type { PlatformDoc } from "./documents.js";

/** The Platform fields that belong to Databricks, written in its section as `databricks.<field>`. */
export const movedFields = [
  "mode",
  "workspace",
  "run_as",
  "compute",
  "permissions",
  "manage",
  "grants",
] as const;

/** One of the {@link movedFields}. */
export type MovedField = (typeof movedFields)[number];

/** The pack whose section the moved fields belong to. */
export const movedTo = "databricks";

/** The keys that are not sections: the fields of the Platform, and two reserved for later. */
const reserved = new Set([
  "apiVersion",
  "kind",
  "id",
  "description",
  "workspace",
  "mode",
  "run_as",
  "compute",
  "settings",
  "naming",
  "tags",
  "permissions",
  "schedule",
  "notifications",
  "manage",
  "grants",
  "alerts",
  "accept",
  "principals",
  "sources",
]);

/** Each pack section the Platform writes, by pack id (a mapping under a key that is not a field). */
export function sectionsOf(doc: PlatformDoc): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(doc))
    if (!reserved.has(key) && isRecord(value)) sections[key] = value;
  return sections;
}

/**
 * The Platform with each moved field as the `databricks` section has it, else as the top
 * has it; the model reads this, so a pack finds them where it always did. Every read of a
 * moved field goes through it.
 */
export function withMovedFields(doc: PlatformDoc): PlatformDoc {
  const section = sectionsOf(doc)[movedTo] ?? {};
  const moved = movedFields.filter((field) => section[field] !== undefined);
  return { ...doc, ...Object.fromEntries(moved.map((field) => [field, section[field]])) };
}

/**
 * True when the packs name the one whose section the moved fields belong to, with a
 * Platform section: only then do warnings and fixes point at the section.
 */
export function namesMovedHome(
  packs: readonly { id: string; platformSection?: unknown }[],
): boolean {
  return packs.some((pack) => pack.id === movedTo && Boolean(pack.platformSection));
}

/**
 * The pointer of a moved field as the Platform writes it: in the `databricks` section when
 * it is written there, else at the top.
 */
export function movedFieldPointer(doc: PlatformDoc, field: MovedField): string {
  return sectionsOf(doc)[movedTo]?.[field] !== undefined ? `/${movedTo}/${field}` : `/${field}`;
}
