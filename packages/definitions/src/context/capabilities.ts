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

/** Warns where something uses a capability that is off, at `pointer` in `document`. */
export function warnOff(
  context: Context,
  id: Id,
  message: string,
  document: DefinitionDocument,
  pointer: string,
): void {
  const capability = context.packs
    .flatMap((pack) => pack.capabilities ?? [])
    .find((item) => item.id === id);
  const needs = capability?.needs.length ? ` It needs: ${capability.needs.join("; ")}.` : "";
  const field = namesMovedHome(context.packs) ? `${movedTo}.manage.${id}` : `manage.${id}`;
  const edits = turnOnEdits(context, id);
  const fixes: Fix[] = edits ? [{ title: `Turn on manage.${id}`, edits }] : [];
  context.reporter.warning(
    "CAPABILITY_OFF",
    `${message}: the platform has ${capability?.title ?? id} off.`,
    { document, pointer },
    `Turn it on with ${field} in platform.yaml.${needs}`,
    fixes,
  );
}

/**
 * The edits that turn the capability on: in the databricks section when the standard names
 * that pack, moving a `manage` written only at the top there as written; else at the top.
 */
function turnOnEdits(context: Context, id: Id): FixEdit[] | undefined {
  const platform = context.platform;
  if (!platform) return undefined;
  const file = platform.file;
  const top: FixEdit[] = [{ file, pointer: `/manage/${id}`, set: true }];
  if (!namesMovedHome(context.packs)) return top;
  const inSection = sectionsOf(platform.value)[movedTo]?.manage !== undefined;
  if (inSection || platform.value.manage === undefined)
    return [{ file, pointer: `/${movedTo}/manage/${id}`, set: true }];
  const written = writtenValue(context.files, file, "/manage")?.value;
  if (written === null || typeof written !== "object" || Array.isArray(written)) return top;
  return [
    { file, pointer: `/${movedTo}/manage`, set: { ...written, [id]: true } },
    { file, pointer: "/manage", remove: true },
  ];
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
