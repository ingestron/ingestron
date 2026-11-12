// Rules 2 and 3 of spec/cli/sources.md, section 1: the keys a recipe may have, and the shape of
// each field.
import { isMapping, listOf, type Checker, type Data } from "./check.js";
import { logicalTypes, readerNames } from "./recipe.js";
import { sourceRecipeSchema } from "./recipe-schema.js";

const keys = Object.keys(sourceRecipeSchema.properties);
const kinds = ["catalog", "document", "sample"] as const;
const objectKinds = ["sets", "types"] as const;
/** The keys of `ask`, in the order a recipe gives them. */
export const askKeys = ["who", "access", "run", "call", "save", "how"];

/** Rule 2, the keys of the entries inside a recipe: none that is not one of theirs. */
function checkInnerKeys(data: Data, check: Checker): void {
  if (isMapping(data.inputs))
    for (const [name, input] of Object.entries(data.inputs))
      if (isMapping(input)) check.unknownKey(input, ["description"], `inputs.${name}`);
  if (isMapping(data.ask)) check.unknownKey(data.ask, askKeys, "ask");
  if (isMapping(data.names)) check.unknownKey(data.names, ["parts", "caseSensitive"], "names");
  for (const [index, rule] of listOf(data.types).entries())
    if (isMapping(rule))
      check.unknownKey(rule, ["match", "logicalType", "options"], `types[${index}]`);
  for (const [index, entry] of listOf(data.sources).entries())
    if (isMapping(entry)) check.unknownKey(entry, ["url", "read"], `sources[${index}]`);
}

/** Rule 2: no other key than the recipe's, and none of the required ones missing. */
export function checkKeys(data: Data, check: Checker): void {
  check.unknownKey(data, keys);
  for (const key of sourceRecipeSchema.required) check.required(data, key, "");
  checkInnerKeys(data, check);
}

function checkAskShape(ask: Data, check: Checker): void {
  for (const key of ["who", "access", "save"]) check.required(ask, key, "ask.");
  for (const key of askKeys) if (ask[key] !== undefined) check.text(ask[key], `ask.${key}`);
}

function checkInputsShape(inputs: Data, check: Checker): void {
  for (const [name, input] of Object.entries(inputs)) {
    const entry = check.mapping(input, `inputs.${name}`, "description:");
    const description = check.required(entry, "description", `inputs.${name}.`);
    check.text(description, `inputs.${name}.description`);
  }
}

function checkTypeRules(rules: unknown[], check: Checker): void {
  for (const [index, item] of rules.entries()) {
    const path = `types[${index}]`;
    const rule = check.mapping(item, path, "match: and logicalType:");
    check.text(check.required(rule, "match", `${path}.`), `${path}.match`);
    const logicalType = check.required(rule, "logicalType", `${path}.`);
    check.oneOf(logicalType, logicalTypes, `${path}.logicalType`);
    if (rule.options === undefined) continue;
    const options = check.mapping(rule.options, `${path}.options`, "precision: $1");
    for (const [name, value] of Object.entries(options))
      if (typeof value !== "string" && typeof value !== "number")
        check.fail(`"${path}.options.${name}" must be text or a number.`);
  }
}

function checkNames(names: unknown, check: Checker): void {
  if (names === undefined) return;
  const data = check.mapping(names, "names", "parts: and caseSensitive:");
  const parts = check.required(data, "parts", "names.");
  if (typeof parts !== "number" || !Number.isInteger(parts) || parts < 1 || parts > 4)
    check.fail('"names.parts" must be a whole number from 1 to 4.');
  if (typeof check.required(data, "caseSensitive", "names.") !== "boolean")
    check.fail('"names.caseSensitive" must be true or false.');
}

function checkMappedFields(fields: Data, check: Checker): void {
  for (const [field, value] of Object.entries(fields))
    if (typeof value !== "string" || value.replace(/^!/, "") === "")
      check.fail(`"fields.${field}" must be the name of a field of the result, as text.`);
}

function checkContainers(data: Data, check: Checker): void {
  check.text(data.title, "title");
  if (data.rows !== undefined) check.text(data.rows, "rows");
  if (data.inputs !== undefined)
    check.mapping(data.inputs, "inputs", "database: { description: … }");
  check.mapping(data.ask, "ask", "who: and access:");
  if (data.fields !== undefined)
    check.mapping(data.fields, "fields", "table_name: and column_name:");
  for (const key of ["types", "key", "sources"])
    if (data[key] !== undefined && !Array.isArray(data[key]))
      check.fail(`"${key}" must be a list.`);
}

/** Rule 3: each field has its shape. */
export function checkShapes(data: Data, check: Checker): void {
  checkContainers(data, check);
  checkAskShape(data.ask as Data, check);
  checkInputsShape((data.inputs ?? {}) as Data, check);
  check.oneOf(data.kind, kinds, "kind");
  check.oneOf(data.read, readerNames, "read");
  if (data.objects !== undefined) check.oneOf(data.objects, objectKinds, "objects");
  checkTypeRules(listOf(data.types), check);
  checkNames(data.names, check);
  checkMappedFields((data.fields ?? {}) as Data, check);
  if (listOf(data.key).some((column) => typeof column !== "string" || column === ""))
    check.fail('"key" must be a list of column names.');
}
