// Features that change shared objects on the platform are turned on in the
// platform; a definition that uses one while it is off is a warning with a fix
// that turns it on (specification section 7.1).
import type { DefinitionDocument, Fix } from "@ingestron/config";
import type { Context } from "./context.js";
import type { Capability } from "./pack.js";

type Id = Capability["id"];

/** True when the platform turns the capability on. */
export function isOn(context: Context, id: Id): boolean {
  return context.platform?.value.manage?.[id] === true;
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
  const platform = context.platform;
  const fixes: Fix[] = platform
    ? [
        {
          title: `Turn on manage.${id}`,
          edits: [{ file: platform.file, pointer: `/manage/${id}`, set: true }],
        },
      ]
    : [];
  context.reporter.warning(
    "CAPABILITY_OFF",
    `${message}: the platform has ${capability?.title ?? id} off.`,
    { document, pointer },
    `Turn it on with manage.${id} in platform.yaml.${needs}`,
    fixes,
  );
}

/** Grants apply only to schemas the bundle manages. */
export function checkGrants(context: Context): void {
  const platform = context.platform;
  const grants = platform?.value.grants ?? {};
  if (!platform || Object.keys(grants).length === 0 || isOn(context, "schemas")) return;
  warnOff(context, "schemas", "The grants are not applied", platform, "/grants");
}
