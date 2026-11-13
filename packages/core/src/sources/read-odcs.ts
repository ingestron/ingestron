// The ODCS reader (spec/cli/sources.md, section 2.3): a data contract, such as one a source's team
// keeps. Each entry of `schema` is a table, each property a column.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { logicalTypes } from "./recipe.js";
import { isRecord } from "./records.js";
import type { Outcome, Reader, ReaderInput, Refused, SourceTableRead } from "./result.js";
import { itemsName } from "./sample-columns.js";
import { extensionOf } from "./text.js";
import { unknownTypeNote } from "./types.js";

type Data = Record<string, unknown>;

function nameOf(entry: Data, fallback?: string): string | undefined {
  for (const key of ["physicalName", "name"])
    if (typeof entry[key] === "string" && entry[key] !== "") return entry[key];
  return fallback;
}

/**
 * The key positions of a list of properties: for each with `primaryKey: true`, the one it gives, or
 * the next after the highest the keys give. A position on a property that is not in the key is
 * ignored.
 */
function keyPositions(properties: Data[]): (number | undefined)[] {
  const given = (property: Data): number | undefined => {
    const place = property.primaryKeyPosition;
    return typeof place === "number" && Number.isInteger(place) && place >= 1 ? place : undefined;
  };
  const keys = properties.filter((property) => property.primaryKey === true);
  let next = Math.max(0, ...keys.map((property) => given(property) ?? 0)) + 1;
  return properties.map((property) =>
    property.primaryKey === true ? (given(property) ?? next++) : undefined,
  );
}

/** What a property's reading needs besides the property: the table, and the notes to add to. */
interface Context {
  object: string;
  notes: string[];
}

/** The property's logical type; one that is text and not known reads as string, with a note. */
function logicalTypeOf(property: Data, path: string[], context: Context): string {
  const declared = property.logicalType;
  if (typeof declared !== "string") return "string";
  const known = logicalTypes.find((type) => type === declared);
  if (known === undefined)
    context.notes.push(unknownTypeNote(declared, context.object, path.join(".")));
  return known ?? "string";
}

function columnOf(
  property: Data,
  path: string[],
  context: Context,
  place?: number,
): SourceColumnDoc {
  return {
    name: path[path.length - 1]!,
    ...(typeof property.physicalType === "string" && { sourceType: property.physicalType }),
    logicalType: logicalTypeOf(property, path, context),
    ...(isRecord(property.logicalTypeOptions) && {
      logicalTypeOptions: { ...property.logicalTypeOptions },
    }),
    required: property.required === true,
    ...(place !== undefined && { primaryKeyPosition: place }),
    ...(Array.isArray(property.properties) && {
      properties: columnsOf(property.properties, path, context),
    }),
    ...(isRecord(property.items) && {
      items: columnOf(property.items, [...path, nameOf(property.items, itemsName)!], context),
    }),
  };
}

function columnsOf(list: unknown[], parents: string[], context: Context): SourceColumnDoc[] {
  const properties = list.filter(isRecord).filter((property) => nameOf(property) !== undefined);
  const places = keyPositions(properties);
  return properties.map((property, at) =>
    columnOf(property, [...parents, nameOf(property)!], context, places[at]),
  );
}

/** The contract in the file's text, undefined when it is not a data contract; or the refusal. */
function contractOf(input: ReaderInput): { value: Data } | Refused | undefined {
  const parsed = extensionOf(input.file) === ".json" ? input.json() : input.yaml();
  if ("refused" in parsed) return parsed;
  return isRecord(parsed.value) && parsed.value.kind === "DataContract"
    ? { value: parsed.value }
    : undefined;
}

function tablesOf(contract: Data, notes: string[]): SourceTableRead[] {
  const entries = Array.isArray(contract.schema) ? contract.schema.filter(isRecord) : [];
  return entries.flatMap((entry) => {
    const object = nameOf(entry);
    const list = Array.isArray(entry.properties) ? entry.properties : [];
    return object === undefined
      ? []
      : [{ object, columns: columnsOf(list, [], { object, notes }) }];
  });
}

/** Reads the file as a data contract, or says why it cannot. */
function read(input: ReaderInput): Outcome {
  const contract = contractOf(input);
  if (contract === undefined)
    return {
      refused: [`${input.file} is not an ODCS data contract: it has no kind: DataContract.`],
    };
  if ("refused" in contract) return contract;
  const notes: string[] = [];
  const tables = tablesOf(contract.value, notes);
  if (tables.length === 0)
    return { refused: [`${input.file} is a data contract with no schema entries.`] };
  return { tables, notes };
}

/** True when the file is YAML or JSON with `kind: DataContract`. */
function accepts(input: ReaderInput): boolean {
  if (![".yaml", ".yml", ".json"].includes(extensionOf(input.file))) return false;
  const contract = contractOf(input);
  return contract !== undefined && "value" in contract;
}

/** The ODCS reader. */
export const odcsReader: Reader = { accepts, read };
