// Features that change shared objects on the platform are turned on in the
// platform; a definition that uses one while it is off is a warning with a fix
// that turns it on (specification section 7.1). `manage` and `grants` are read as the
// model has them: from the databricks section, else from the top of the Platform.
import type { DefinitionDocument, Fix, FixEdit } from "@ingestron/config";
import type { Context } from "./context.js";
import {
  movedFieldPointer,
  movedTo,
  namesMovedHome,
  sectionsOf,
  withMovedFields,
} from "../documents/index.js";
import { writtenValue } from "../internal/index.js";
import type { Capability } from "../pack/index.js";

type Id = Capability["id"];

/** True when the platform turns the capability on. */
export function isOn(context: Context, id: Id): boolean {
  const platform = context.platform;
  return platform !== undefined && withMovedFields(platform.value).manage?.[id] === true;
}

/**
 * True when table checks run for a table that `pack` keeps: a pack that declares no `checks`
 * capability runs them itself, with nothing shared to turn on; one that declares it runs them
 * only when the platform turns checks on. Without a known pack, only when checks are on.
 */
export function checksRun(context: Context, pack: string | undefined): boolean {
  const keeper = context.packs.find((candidate) => candidate.id === pack);
  if (keeper && !(keeper.capabilities ?? []).some((capability) => capability.id === "checks"))
    return true;
  return isOn(context, "checks");
}

/**
 * Warns where something uses a capability that is off, at `pointer` in `document`; `table` is
 * the one table the warning is about, when it is about one.
 */
export function warnOff(
  context: Context,
  id: Id,
  message: string,
  document: DefinitionDocument,
  pointer: string,
  table?: string,
): void {
  const capability = context.packs
    .flatMap((pack) => pack.capabilities ?? [])
    .find((item) => item.id === id);
  const needs = capability?.needs.length ? ` It needs: ${capability.needs.join("; ")}.` : "";
  const { field, fixes } = turnOn(context, id);
  context.reporter.warning(
    "CAPABILITY_OFF",
    `${message}: the platform has ${capability?.title ?? id} off.`,
    { document, pointer },
    `Turn it on with ${field} in platform.yaml.${needs}`,
    fixes,
    { ...(table !== undefined && { table }), feature: id },
  );
}

/**
 * How to turn the capability on: the field a hint names and the fix `Turn on manage.<id>`
 * (none without a Platform).
 */
export function turnOn(context: Context, id: Id): { field: string; fixes: Fix[] } {
  const field = namesMovedHome(context.packs) ? `${movedTo}.manage.${id}` : `manage.${id}`;
  const edits = turnOnEdits(context, id);
  return { field, fixes: edits ? [{ title: `Turn on manage.${id}`, edits }] : [] };
}

/**
 * The edits that turn the capability on: in the databricks section when the standard names
 * that pack, removing a `manage` also written at the top, or moving one written only there
 * as written; else at the top.
 */
function turnOnEdits(context: Context, id: Id): FixEdit[] | undefined {
  const platform = context.platform;
  if (!platform) return undefined;
  const file = platform.file;
  const top: FixEdit[] = [{ file, pointer: `/manage/${id}`, set: true }];
  if (!namesMovedHome(context.packs)) return top;
  const removeTop: FixEdit = { file, pointer: "/manage", remove: true };
  const inSection: FixEdit = { file, pointer: `/${movedTo}/manage/${id}`, set: true };
  if (platform.value.manage === undefined) return [inSection];
  if (sectionsOf(platform.value)[movedTo]?.manage !== undefined) return [inSection, removeTop];
  const moved = movedManage(context, file, id);
  return moved ? [moved, removeTop] : top;
}

/** `manage` written only at the top, as written, set in the section with the capability on. */
function movedManage(context: Context, file: string, id: Id): FixEdit | undefined {
  const written = writtenValue(context.files, file, "/manage")?.value;
  if (written === null || typeof written !== "object" || Array.isArray(written)) return undefined;
  return { file, pointer: `/${movedTo}/manage`, set: { ...written, [id]: true } };
}

/** Grants apply only to schemas the bundle manages. */
export function checkGrants(context: Context): void {
  const platform = context.platform;
  if (!platform) return;
  const grants = withMovedFields(platform.value).grants ?? {};
  if (Object.keys(grants).length === 0 || isOn(context, "schemas")) return;
  const pointer = movedFieldPointer(platform.value, "grants");
  warnOff(context, "schemas", "The grants are not applied", platform, pointer);
}
