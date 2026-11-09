// ingestron contract <sample>: a draft ODCS contract from a sample file, with
// each column's name and inferred logical type and no sample values. Keys,
// required columns and descriptions are left to the person reviewing it.
import { basename } from "node:path";
import { stringify } from "yaml";
import { readSample } from "./sample-read.js";

/**
 * The contract text for a sample's columns, with the object named after the file.
 * @example
 * contractFromSample("id,name\n1,a\n", "customers.csv", "shop.customers");
 * @public
 */
export function contractFromSample(text: string, file: string, id: string): string {
  const { columns, rows } = readSample(text, file);
  const properties = columns.map(
    (column) =>
      `      - { name: ${scalar(column)}, logicalType: ${typeOf(rows.map((row) => row[column]))} }`,
  );
  return [
    `# Drafted from ${file} (${rows.length} ${rows.length === 1 ? "row" : "rows"}): names and types only. Review the`,
    "# types, then add primaryKey, required and descriptions before use.",
    "apiVersion: v3.1.0",
    "kind: DataContract",
    `id: ${scalar(id)}`,
    "version: 0.1.0",
    "status: draft",
    "schema:",
    `  - name: ${scalar(objectName(file))}`,
    "    logicalType: object",
    "    properties:",
    ...properties,
    "",
  ].join("\n");
}

/**
 * `Daily Sales.csv` → `daily_sales`.
 * @internal
 */
export function objectName(file: string): string {
  return basename(file)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function scalar(text: string): string {
  return stringify(text).trimEnd();
}

const patterns: [string, RegExp][] = [
  ["integer", /^-?\d+$/],
  ["number", /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/],
  ["boolean", /^(true|false)$/i],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["timestamp", /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/],
];

/** The narrowest logical type every non-empty value fits; integers widen to number. */
function typeOf(values: unknown[]): string {
  const types = new Set(values.filter((value) => value !== "" && value != null).map(typeOfValue));
  if (types.size === 1) return [...types][0]!;
  return types.size === 2 && types.has("integer") && types.has("number") ? "number" : "string";
}

function typeOfValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  const text = String(value);
  // A code such as 00123 is an identifier: as a number it would lose its zeros.
  if (/^-?0\d/.test(text)) return "string";
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "string";
}
