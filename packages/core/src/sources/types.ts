// The logical type of a source's type name (spec/cli/sources.md, section 2.6): the recipe's rules
// first, then the generic map. A type neither knows is left to the caller, which reads it as
// string with a note.
import type { SourceRecipe } from "./recipe.js";

/** A logical type with the options that go with it. */
export interface LogicalTypeResult {
  logicalType: string;
  logicalTypeOptions?: Record<string, unknown>;
}

const stringTypes = new Set([
  "char",
  "character",
  "varchar",
  "character varying",
  "nchar",
  "nvarchar",
  "text",
  "clob",
  "nclob",
  "string",
]);
const integerTypes = new Set(["smallint", "int", "integer", "bigint"]);
const numberTypes = new Set(["real", "float", "double", "double precision"]);
const exactTypes = new Set(["decimal", "numeric"]);

/** A whole number from text, or undefined when it is not one. */
function whole(text: string | undefined): number | undefined {
  return text !== undefined && /^\d+$/.test(text.trim()) ? Number(text) : undefined;
}

function withOptions(logicalType: string, options: Record<string, unknown>): LogicalTypeResult {
  return Object.keys(options).length > 0
    ? { logicalType, logicalTypeOptions: options }
    : { logicalType };
}

/** `(200)` gives a maxLength of 200; `(max)` gives none. */
function lengthOptions(args: string | undefined): Record<string, unknown> {
  const length = whole(args);
  return length === undefined ? {} : { maxLength: length };
}

/** `decimal(18,2)` gives precision 18 and scale 2; `decimal(18)` gives scale 0. */
function exactOptions(args: string | undefined): Record<string, unknown> {
  const [precision, scale] = (args ?? "").split(",");
  const digits = whole(precision);
  if (digits === undefined) return {};
  return { precision: digits, scale: whole(scale) ?? 0 };
}

/** The rule's options, with each `$n` replaced by capture group n as a whole number. */
function ruleOptions(
  options: Record<string, string | number> | undefined,
  match: RegExpExecArray,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(options ?? {})) {
    const group = typeof value === "string" ? /^\$(\d+)$/.exec(value)?.[1] : undefined;
    if (group === undefined) result[name] = value;
    else if (whole(match[Number(group)]) !== undefined) result[name] = whole(match[Number(group)]);
  }
  return result;
}

function byRecipe(type: string, recipe: SourceRecipe | undefined): LogicalTypeResult | undefined {
  for (const rule of recipe?.types ?? []) {
    const match = new RegExp(rule.match, "i").exec(type);
    if (match) return withOptions(rule.logicalType, ruleOptions(rule.options, match));
  }
  return undefined;
}

const typeShape = /^([a-z]+(?: [a-z]+)*?)\s*(?:\(([^)]*)\))?\s*((?:with|without) time zone)?$/;

const timeTypes = new Set(["timestamp", "time"]);

function byName(name: string, args: string | undefined): LogicalTypeResult | undefined {
  if (stringTypes.has(name)) return withOptions("string", lengthOptions(args));
  if (integerTypes.has(name)) return { logicalType: "integer" };
  if (exactTypes.has(name)) return withOptions("number", exactOptions(args));
  if (numberTypes.has(name)) return { logicalType: "number" };
  return name === "boolean" || name === "date" || timeTypes.has(name)
    ? { logicalType: name }
    : undefined;
}

function byMap(type: string): LogicalTypeResult | undefined {
  const shape = typeShape.exec(type.toLowerCase().replace(/\s+/g, " "));
  if (!shape) return undefined;
  const [, name = "", args, zone] = shape;
  if (zone === undefined) return byName(name, args);
  return timeTypes.has(name) ? { logicalType: name } : undefined;
}

/**
 * The logical type of a source type, or undefined when neither the recipe's rules nor the generic
 * map know it.
 * @internal
 */
export function logicalTypeOf(
  sourceType: string,
  recipe: SourceRecipe | undefined,
): LogicalTypeResult | undefined {
  const type = sourceType.trim();
  return byRecipe(type, recipe) ?? byMap(type);
}

/** The note for a type nothing knows. */
export function unknownTypeNote(type: string, object: string, column: string): string {
  return `Type "${type.trim()}" of ${object}.${column} is not known; read as string.`;
}
