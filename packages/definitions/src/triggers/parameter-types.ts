// Whether a value fits the type a flow declares for a parameter (specification section 5.1).
import type { ParameterDef, ParameterValue } from "./types.js";

type ParameterType = ParameterDef["type"];

/** How each type is said in a message. */
export const typeWords: Record<ParameterType, string> = {
  string: "text",
  int: "a whole number",
  float: "a number",
  bool: "true or false",
  date: "a date",
  datetime: "a date and time",
};

const date = /^\d{4}-\d{2}-\d{2}$/;
const datetime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/** True when `value` is an expression, written `{ expression: "..." }`. */
export function isExpression(value: unknown): value is { expression: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { expression?: unknown }).expression === "string"
  );
}

/** True when the literal is of the type; an expression fits every type. */
export function fits(type: ParameterType, value: ParameterValue | undefined): boolean {
  if (isExpression(value)) return true;
  switch (type) {
    case "string":
      return typeof value === "string";
    case "int":
      return Number.isInteger(value);
    case "float":
      return typeof value === "number";
    case "bool":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && date.test(value);
    case "datetime":
      return typeof value === "string" && datetime.test(value);
  }
}
