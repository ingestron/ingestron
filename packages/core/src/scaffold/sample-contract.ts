// ingestron contract <sample>: a draft ODCS contract from a sample file, with
// each column's name and inferred logical type and no sample values. Keys,
// required columns and descriptions are left to the person reviewing it.
import { basename } from "node:path";
import { stringify } from "yaml";
import { readSample } from "./sample-read.js";
import { typeOf } from "../sample-type.js";

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
