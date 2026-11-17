// The time zones and environments of the triggers policy (specification section 11.6): each
// zone the standard writes, in `operations.triggers` and in `fixed.operations.triggers`, is
// checked, and each environment it names is one the project declares.
import type { Context } from "../context/index.js";
import type { TriggersPolicyDoc, TriggersValuesDoc } from "../intent/index.js";
import { isRecord, writtenValue } from "../internal/index.js";
import { checkZoneName } from "./timezones.js";

/**
 * `TIMEZONE_NAME` for each zone of the triggers policy that is not on the list of zones, and
 * `TRIGGER_ENVIRONMENT` for each environment entry that names no environment of the project.
 */
export function checkTriggerZones(context: Context): void {
  const { operations, fixed } = context.standard.value;
  const declared = declaredEnvironments(context);
  checkPolicy(context, operations?.triggers, "/operations/triggers", declared);
  checkPolicy(context, fixed?.operations?.triggers, "/fixed/operations/triggers", declared);
}

/** The environments `project.yaml` declares, in the order written; `default` when it has none. */
function declaredEnvironments(context: Context): string[] {
  const written = writtenValue(context.files, "project.yaml", "/environments", context.parsed);
  const names = isRecord(written?.value) ? Object.keys(written.value) : [];
  return names.length > 0 ? names : ["default"];
}

/** The policy's zones: its own, then each environment's, in the order written. */
function checkPolicy(
  context: Context,
  policy: TriggersPolicyDoc | undefined,
  at: string,
  declared: string[],
): void {
  if (!policy) return;
  checkValues(context, policy, at);
  for (const [name, entry] of Object.entries(policy.environments ?? {})) {
    const place = `${at}/environments/${escapePointer(name)}`;
    if (!declared.includes(name))
      context.reporter.warning(
        "TRIGGER_ENVIRONMENT",
        `"${name}" names no environment of this project; environments: ${declared.join(", ")}.`,
        { document: context.standard, pointer: place },
        "Name an environment project.yaml declares, or take the entry out.",
      );
    checkValues(context, entry, place);
  }
}

/** The zone a set of values names, and the zone its hours name. */
function checkValues(context: Context, values: TriggersValuesDoc, at: string): void {
  const check = (name: string | undefined, pointer: string) =>
    name !== undefined && checkZoneName(context, name, { document: context.standard, pointer });
  check(values.timezone, `${at}/timezone`);
  if (values.hours && values.hours !== "any") check(values.hours.timezone, `${at}/hours/timezone`);
}

/** A key as one segment of a JSON pointer. */
function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
