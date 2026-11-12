// Rules 4 to 9 of spec/cli/sources.md, section 1: the id, the inputs, the ask, the keys that go
// with a reader, the regular expressions and the sources.
import type { Checker, Data } from "./check.js";
import {
  columnsFields,
  type ColumnsField,
  type SourceReaderName,
  type SourceTypeRule,
} from "./recipe.js";

const reserved = ["connection", "object", "schemas"];
const mappedFields = ["table_name", "column_name", "data_type"];

/** Rule 4: `id` matches its pattern and equals the file's name. */
export function checkId(id: unknown, check: Checker): string {
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id))
    check.fail(
      `"id" must start with a lower-case letter and hold only lower-case letters, digits and "-"; "${String(id)}" does not.`,
    );
  const expected = check.name.replace(/\.yaml$/, "");
  if (id !== expected)
    check.fail(
      `"id" is "${id}", but the file is named ${check.name}. Rename the file, or change id to ${expected}.`,
    );
  return id;
}

/** Rule 5: each input's name matches its pattern and is not a reserved name. */
export function checkInputNames(inputs: Data, check: Checker): void {
  for (const name of Object.keys(inputs)) {
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(name))
      check.fail(
        `the input name "${name}" must start with a lower-case letter and hold only letters, digits and "_".`,
      );
    if (reserved.includes(name))
      check.fail(`the input name "${name}" is reserved. Use another name.`);
  }
}

/** Rule 6: `ask` has `run` or `call` as `kind` says, and `save` starts `sources/`. */
export function checkAsk(ask: Data, kind: string, check: Checker): void {
  const given = ["run", "call"].filter((key) => ask[key] !== undefined);
  if (kind === "sample" && given.length > 0)
    check.fail('"ask" must have neither run nor call for a sample recipe.');
  if (kind !== "sample" && given.length > 1)
    check.fail('"ask" has both run and call. Keep the one that fits.');
  if (kind !== "sample" && given.length === 0)
    check.fail(`"ask" needs run (a query) or call (a URL) for a ${kind} recipe.`);
  if (!(ask.save as string).startsWith("sources/"))
    check.fail('"ask.save" must start with sources/.');
}

/** Rule 7: `rows`, `fields`, `key` and `objects` only with their readers, and `fields` well formed. */
export function checkReaderKeys(data: Data, check: Checker): void {
  const reader = data.read as SourceReaderName;
  const only: [string, readonly SourceReaderName[]][] = [
    ["rows", ["columns", "sample"]],
    ["fields", ["columns"]],
    ["key", ["columns"]],
    ["objects", ["odata"]],
  ];
  for (const [key, readers] of only) {
    if (data[key] === undefined || readers.includes(reader)) continue;
    const these =
      readers.length === 1 ? `the reader ${readers[0]}` : `the readers ${readers.join(" and ")}`;
    check.fail(`"${key}" is given only with ${these}; this recipe reads ${reader}.`);
  }
  if (data.fields === undefined) return;
  const fields = data.fields as Data;
  for (const key of Object.keys(fields))
    if (!columnsFields.includes(key as ColumnsField))
      check.fail(
        `"fields" has the key "${key}", which is not a field of the columns file. Its fields: ${columnsFields.join(", ")}.`,
      );
  const missing = mappedFields.find((key) => fields[key] === undefined);
  if (missing !== undefined)
    check.fail(`"fields" must map table_name, column_name and data_type; "${missing}" is missing.`);
}

/** Fails when `match` is not a regular expression, saying which key it is. */
function checkMatch(match: string, path: string, check: Checker): void {
  try {
    new RegExp(match, "i");
  } catch (error) {
    check.fail(
      `"${path}" is not a valid regular expression: ${(error as Error).message.split("\n")[0]}`,
    );
  }
}

/** Rule 8: each `match` is a valid regular expression, those of `types` first, then `columnNames`'s. */
export function checkMatches(
  rules: SourceTypeRule[],
  columnNames: Data | undefined,
  check: Checker,
): void {
  for (const [index, rule] of rules.entries())
    checkMatch(rule.match, `types[${index}].match`, check);
  if (columnNames !== undefined)
    checkMatch(columnNames.match as string, "columnNames.match", check);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:" && value.startsWith("https://");
  } catch {
    return false;
  }
}

/** Rule 9: at least one source; each `url` an `https://` URL and each `read` a real date. */
export function checkSources(sources: unknown[], check: Checker): { url: string; read: string }[] {
  if (sources.length === 0)
    check.fail(
      '"sources" needs at least one entry, such as { url: https://example.com/docs, read: 2026-01-31 }.',
    );
  return sources.map((item, index) => {
    const path = `sources[${index}]`;
    const entry = check.mapping(item, path, "url: and read:");
    const url = check.required(entry, "url", `${path}.`);
    if (typeof url !== "string" || !isHttps(url))
      check.fail(`"${path}.url" must be an https:// URL; "${String(url)}" is not.`);
    const read = check.required(entry, "read", `${path}.`);
    if (typeof read !== "string" || !isRealDate(read))
      check.fail(
        `"${path}.read" must be a real date written YYYY-MM-DD; "${String(read)}" is not.`,
      );
    return { url, read };
  });
}
