// A flow table's contract compared with its entry in the connection's source metadata, and
// what each difference is reported as (specification section 12.6).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import { contractEntry } from "../contracts/index.js";
import type { FlowDoc } from "../documents/index.js";
import { compareSourceColumns, type SourceBefore, type SourceDifference } from "./compare.js";
import type { TableMatch } from "./table.js";

/** Where a difference is reported: the flow's file, at the table's `contract`. */
type Place = { document: DefinitionDocument<FlowDoc>; pointer: string };

/** The feature of `SOURCE_KEY_CHANGED`, so that a column named `key` is not mistaken for it. */
const keyFeature = "(primary key)";

/**
 * Compares the contract `id` of the flow table `name` with its metadata entry `match`, and
 * reports each difference at the table's `contract`: a table that no entry matches is
 * `SOURCE_TABLE_GONE`, but only when the connection's document has a table captured from a
 * catalog. Nothing is compared when the object matched more than one table (reported
 * already). The context reports as about the table.
 */
export function compareWithContract(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  id: string,
  match: TableMatch | undefined,
): void {
  if (!match || match.ambiguous) return;
  const at = { document: flow, pointer: `/tables/${name}/contract` };
  const { entry } = match;
  if (!entry)
    return tableGone(context, at, match, flow.value.source, flow.value.tables[name]?.object);
  const before = beforeOf(context, id, name);
  if (!before) return;
  const { from } = entry.captured;
  const names = match.document.names;
  const found = compareSourceColumns(before, entry, {
    namesOnly: from === "sample" || from === "assistant",
    caseSensitive: names ? names.caseSensitive : true,
  });
  for (const difference of found)
    report(context, at, {
      code: difference.code,
      kind: difference.kind,
      ...featureOf(difference),
      ...described(difference, id, entry.object),
    });
}

/** What a difference is about: the column, or `(primary key)`; none for a table. */
function featureOf({ code, column }: SourceDifference): { feature?: string } {
  if (code === "SOURCE_KEY_CHANGED") return { feature: keyFeature };
  return column === undefined ? {} : { feature: column };
}

/** `SOURCE_TABLE_GONE`, when a catalog was imported for the connection, and so lists its whole source. */
function tableGone(
  context: Context,
  at: Place,
  match: TableMatch,
  connection: string,
  object: string | undefined,
): void {
  if (!match.document.tables.some((table) => table.captured.from === "catalog")) return;
  report(context, at, {
    code: "SOURCE_TABLE_GONE",
    kind: "breaking",
    message: `The source metadata for "${connection}" was read from a catalog and does not list "${object}".`,
    hint: "Check the object's name, or import the source's metadata again if the table was added since.",
  });
}

/** The contract's columns and key as `compareSourceColumns` takes them; none when it has none. */
function beforeOf(context: Context, id: string, table: string): SourceBefore | undefined {
  const properties = contractEntry(context, id, table)?.properties;
  if (!properties) return undefined;
  const key = properties
    .filter((property) => property.primaryKey === true)
    .sort((a, b) => (a.primaryKeyPosition ?? 0) - (b.primaryKeyPosition ?? 0))
    .map((property) => property.physicalName ?? property.name);
  return {
    columns: properties.map((property) => ({
      name: property.name,
      ...(property.physicalName && { physicalName: property.physicalName }),
      ...(property.logicalType && { logicalType: property.logicalType }),
      ...(isMapping(property.logicalTypeOptions) && {
        logicalTypeOptions: property.logicalTypeOptions,
      }),
      required: property.required === true,
    })),
    primaryKey: key,
  };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The message and hint of a difference. */
function described(
  { code, column, before, after }: SourceDifference,
  contract: string,
  object: string,
): { message: string; hint: string } {
  const metadata = `the source metadata for "${object}"`;
  switch (code) {
    case "SOURCE_COLUMN_GONE":
      return {
        message: `Column "${column}" of contract "${contract}" is not in ${metadata}.`,
        hint: "Remove the column from the contract, or import the source's metadata again if the column is still there.",
      };
    case "SOURCE_COLUMN_NEW":
      return {
        message: `${capital(metadata)} has a column "${column}" that contract "${contract}" does not have.`,
        hint: "Add the column to the contract to use it, or leave it out.",
      };
    case "SOURCE_TYPE_CHANGED":
      return {
        message: `Column "${column}" is ${after} in ${metadata}, but ${before} in contract "${contract}".`,
        hint: "Change the column's type in the contract to one the source's type fits, or ask the source's owner about the change.",
      };
    case "SOURCE_TYPE_FITS":
      return {
        message: `Column "${column}" is ${after} in ${metadata}, which fits ${before} in contract "${contract}".`,
        hint: "Nothing breaks. Change the contract to the source's type if you want it exact.",
      };
    case "SOURCE_NULLABLE":
      return {
        message: `Column "${column}" is required in contract "${contract}", but ${metadata} says it can be null.`,
        hint: "Make the column not required in the contract, or ask the source's owner whether it can be null.",
      };
    default:
      return {
        message: `The primary key of contract "${contract}" is (${before}), but ${metadata} has (${after}).`,
        hint: "Change the contract's primary key to the source's, or ask the source's owner about the change.",
      };
  }
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the `sources.breaking` setting is: the Platform's, else the Standard's, else `fail`. */
function breakingSetting(context: Context): "fail" | "warn" {
  return (
    context.platform?.value.sources?.breaking ?? context.standard.value.sources?.breaking ?? "fail"
  );
}

/**
 * Reports a difference at `at`. A breaking one is an error with `fail`, a warning with `warn`;
 * a compatible one is information. An error carries no subject: only a warning or information
 * has `feature`, with the table the context adds.
 */
function report(
  context: Context,
  at: Place,
  item: {
    code: SourceDifference["code"];
    kind: SourceDifference["kind"];
    feature?: string;
    message: string;
    hint: string;
  },
): void {
  const { code, kind, message, hint } = item;
  const subject = item.feature === undefined ? {} : { feature: item.feature };
  if (kind === "compatible")
    context.reporter.information(code, message, at, hint, undefined, subject);
  else if (breakingSetting(context) === "warn")
    context.reporter.warning(code, message, at, hint, undefined, subject);
  else context.reporter.error(code, message, at, hint);
}
