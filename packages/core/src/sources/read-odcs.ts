// The ODCS reader (spec/cli/sources.md, section 2.3): a data contract, such as one a source's team
// keeps. Each entry of `schema` is a table, each property a column.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { logicalTypes } from "./recipe.js";
import { isRecord } from "./records.js";
import type { Outcome, Reader, ReaderInput, Refused, SourceTableRead } from "./result.js";
import { itemsName } from "./sample-columns.js";
import { extensionOf, parseYaml } from "./text.js";

type Data = Record<string, unknown>;

function nameOf(entry: Data, fallback?: string): string | undefined {
  for (const key of ["physicalName", "name"])
    if (typeof entry[key] === "string" && entry[key] !== "") return entry[key];
  return fallback;
}

/** The key positions of the properties: each given, or the next free place for `primaryKey: true`. */
function keyPositions(properties: Data[]): (number | undefined)[] {
  const given = (property: Data): number | undefined => {
    const place = property.primaryKeyPosition;
    return typeof place === "number" && Number.isInteger(place) && place >= 1 ? place : undefined;
  };
  const used = new Set(properties.flatMap((property) => given(property) ?? []));
  let next = 1;
  return properties.map((property) => {
    if (property.primaryKey !== true) return undefined;
    while (given(property) === undefined && used.has(next)) next += 1;
    return given(property) ?? next++;
  });
}

function columnOf(property: Data, name: string, place?: number): SourceColumnDoc {
  const declared = property.logicalType;
  const logicalType = logicalTypes.find((type) => type === declared) ?? "string";
  return {
    name,
    ...(typeof property.physicalType === "string" && { sourceType: property.physicalType }),
    logicalType,
    ...(isRecord(property.logicalTypeOptions) && {
      logicalTypeOptions: { ...property.logicalTypeOptions },
    }),
    required: property.required === true,
    ...(place !== undefined && { primaryKeyPosition: place }),
    ...(Array.isArray(property.properties) && { properties: columnsOf(property.properties) }),
    ...(isRecord(property.items) && {
      items: columnOf(property.items, nameOf(property.items, itemsName)!),
    }),
  };
}

function columnsOf(list: unknown[]): SourceColumnDoc[] {
  const properties = list.filter(isRecord).filter((property) => nameOf(property) !== undefined);
  const places = keyPositions(properties);
  return properties.map((property, at) => columnOf(property, nameOf(property)!, places[at]));
}

/** The contract in the file's text, undefined when it is not a data contract; or the refusal. */
function contractOf(input: ReaderInput): { value: Data } | Refused | undefined {
  const parsed = parseYaml(input.text, input.file);
  if ("refused" in parsed) return parsed;
  return isRecord(parsed.value) && parsed.value.kind === "DataContract"
    ? { value: parsed.value }
    : undefined;
}

function tablesOf(contract: Data): SourceTableRead[] {
  const entries = Array.isArray(contract.schema) ? contract.schema.filter(isRecord) : [];
  return entries.flatMap((entry) => {
    const object = nameOf(entry);
    const list = Array.isArray(entry.properties) ? entry.properties : [];
    return object === undefined ? [] : [{ object, columns: columnsOf(list) }];
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
  const tables = tablesOf(contract.value);
  if (tables.length === 0)
    return { refused: [`${input.file} is a data contract with no schema entries.`] };
  return { tables, notes: [] };
}

/** True when the file is YAML or JSON with `kind: DataContract`. */
function accepts(input: ReaderInput): boolean {
  if (![".yaml", ".yml", ".json"].includes(extensionOf(input.file))) return false;
  const contract = contractOf(input);
  return contract !== undefined && "value" in contract;
}

/** The ODCS reader. */
export const odcsReader: Reader = { accepts, read };
