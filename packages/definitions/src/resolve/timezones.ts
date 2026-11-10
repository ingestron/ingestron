// Time zones (specification section 6.3): the names a definition may use, the zone each table's
// timestamps are in, and which columns a table converts from one zone to another.
import { zones as zoneList } from "../data/index.js";
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar, type Source } from "../diagnostics/index.js";
import { kinds, type ConnectionDoc } from "../documents/index.js";
import type { ResolvedTable } from "../pack/index.js";

/** The zone of timestamps that a connection does not give one for. */
const defaultZone = "UTC";

const zones: ReadonlySet<string> = new Set(zoneList.names);

/** True when the name is on the list of IANA zones the package ships, written exactly. */
export function isZone(name: string): boolean {
  return zones.has(name);
}

/** The zone a connection writes its timestamps in. */
export function connectionZone(connection: ConnectionDoc): string {
  return connection.timezone ?? defaultZone;
}

/**
 * The zones a table's inputs are in, in the order of its inputs and each as the input has it:
 * undefined for an input that has no single zone. `at` is where the inputs are written.
 */
export interface InputZones {
  zones: (string | undefined)[];
  at: Source;
}

/** The one zone all the inputs are in, or undefined when they differ or an input has none. */
export function inputZone({ zones: inputs }: InputZones): string | undefined {
  const [first] = inputs;
  return first !== undefined && inputs.every((zone) => zone === first) ? first : undefined;
}

/** `TIMEZONE_NAME` at `at`: the name is not on the list of zones. */
function reportName(context: Context, name: string, at: Source): void {
  const like = zoneList.names.find((zone) => zone.toLowerCase() === name.toLowerCase());
  context.reporter.error(
    "TIMEZONE_NAME",
    `"${name}" is not a time zone name.`,
    at,
    like
      ? `Did you mean "${like}"?`
      : "Use a name from the IANA time zone database, such as Europe/London, or UTC.",
  );
}

/** True when the name is a zone, or holds an unset reference that decides it later. */
export function isKnownZone(context: Context, name: string): boolean {
  return isZone(name) || holdsUnsetEnvvar(context.project, name);
}

/** Reports the name unless it is a zone; true when it is not reported. */
export function checkZoneName(context: Context, name: string, at: Source): boolean {
  if (isKnownZone(context, name)) return true;
  reportName(context, name, at);
  return false;
}

/**
 * `TIMEZONE_NAME` for each connection's `timezone` and the standard's `cleanse.timestamps.to`
 * that is not a zone. The names a table's columns write are checked with the table.
 */
export function checkZoneNames(context: Context): void {
  for (const document of context.project.all(kinds.connection)) {
    const { timezone } = document.value;
    if (timezone !== undefined)
      checkZoneName(context, timezone, { document, pointer: "/timezone" });
  }
  const to = context.standard.value.cleanse?.timestamps?.to;
  if (to === undefined) return;
  checkZoneName(context, to, { document: context.standard, pointer: "/cleanse/timestamps/to" });
}

/**
 * The zone the table's timestamp columns are in once it is built, or undefined when they are
 * not all in one: a planned column is in its `to` zone, any other in the input zone. A table
 * with no timestamp column has its input zone.
 */
export function zoneAfter(
  contract: ResolvedTable["contract"],
  planned: ReadonlyMap<string, { to: string }>,
  input: string | undefined,
): string | undefined {
  const zonesOf = contract.columns
    .filter((column) => column.logicalType === "timestamp" || planned.has(column.name))
    .map((column) => planned.get(column.name)?.to ?? input);
  const [first] = zonesOf;
  if (zonesOf.length === 0) return input;
  return zonesOf.every((zone) => zone === first) ? first : undefined;
}
