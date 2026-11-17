// The parameters of a flow and the values its triggers give them (specification section 5.1).
import type { Context } from "../context/index.js";
import {
  fits,
  isExpression,
  typeWords,
  type ParameterDef,
  type ParameterDoc,
  type ParameterValue,
  type TriggerDoc,
} from "../triggers/index.js";
import { placeIn, type Flow } from "./trigger-place.js";

/** The names the pipeline already uses. */
const reserved = new Set(["windowStart", "windowEnd", "load", "tables"]);

const namePattern = /^[a-z][a-z0-9_]*$/;

/** `TRIGGER_PARAMETER`, an error at `keys` in the flow. */
function report(
  context: Context,
  flow: Flow,
  keys: (string | number)[],
  message: string,
  hint: string,
): void {
  context.reporter.error("TRIGGER_PARAMETER", message, placeIn(flow, ...keys), hint);
}

/** What a declaration gets wrong, in the order the problems are reported. */
function checkDeclaration(context: Context, flow: Flow, name: string, doc: ParameterDoc): void {
  const at = ["ingest", "parameters", name];
  if (reserved.has(name))
    report(
      context,
      flow,
      at,
      `"${name}" is reserved for the pipeline, so a flow cannot declare a parameter with that name.`,
      "Choose another name.",
    );
  else if (!namePattern.test(name))
    report(
      context,
      flow,
      at,
      `"${name}" is not a valid parameter name.`,
      "Use lowercase letters, digits and underscores, starting with a letter.",
    );
  if (doc.default === undefined)
    report(
      context,
      flow,
      at,
      `The parameter "${name}" has no default.`,
      "Give it a `default`, so a run that no trigger sets still has a value.",
    );
  else if (!fits(doc.type, doc.default))
    report(
      context,
      flow,
      [...at, "default"],
      `The default of the parameter "${name}" is not ${typeWords[doc.type]}.`,
      `Write a default that is ${typeWords[doc.type]}.`,
    );
}

/**
 * Checks each declared parameter, and returns those that have a default, as the model holds
 * them.
 */
export function checkDeclarations(context: Context, flow: Flow): Record<string, ParameterDef> {
  const declared = flow.value.ingest?.parameters ?? {};
  const kept: Record<string, ParameterDef> = {};
  for (const [name, doc] of Object.entries(declared)) {
    checkDeclaration(context, flow, name, doc);
    if (doc.default !== undefined) kept[name] = { type: doc.type, default: doc.default };
  }
  return kept;
}

/** What is wrong with a trigger's value for a reserved name: its message and hint, if anything. */
function builtInProblem(
  trigger: TriggerDoc,
  name: string,
  value: ParameterValue,
): [string, string] | undefined {
  const who = `The trigger "${trigger.name}"`;
  if (name === "tables")
    return [`"tables" is reserved for the pipeline, so ${who} cannot set it.`, "Leave it out."];
  if (name === "load")
    return isExpression(value) || value === "incremental" || value === "full"
      ? undefined
      : [
          `${who} sets the built-in parameter "load" to ${JSON.stringify(value)}.`,
          "Use incremental or full, or an expression.",
        ];
  if (trigger.type === "tumbling-window")
    return [
      `${who} sets the built-in parameter "${name}", which only a schedule trigger can set.`,
      "A tumbling window passes its own window to the pipeline.",
    ];
  return isExpression(value)
    ? undefined
    : [
        `The built-in parameter "${name}" of the trigger "${trigger.name}" must be an expression.`,
        'Write `{ expression: "..." }`.',
      ];
}

/** What is wrong with a trigger's value for `name`: its message and hint, if anything. */
function valueProblem(
  trigger: TriggerDoc,
  name: string,
  value: ParameterValue,
  declared: Record<string, ParameterDoc>,
): [string, string] | undefined {
  if (reserved.has(name)) return builtInProblem(trigger, name, value);
  const def = Object.hasOwn(declared, name) ? declared[name] : undefined;
  if (!def)
    return [
      `The trigger "${trigger.name}" sets the parameter "${name}", which the flow does not declare.`,
      "Declare it under `ingest.parameters`, with a type and a default.",
    ];
  return fits(def.type, value)
    ? undefined
    : [
        `The parameter "${name}" is ${typeWords[def.type]}, but the trigger "${trigger.name}" gives ${JSON.stringify(value)}.`,
        `Give ${typeWords[def.type]}, or an expression.`,
      ];
}

/** `TRIGGER_PARAMETER` for each value a trigger gives that the flow's parameters do not allow. */
export function checkValues(
  context: Context,
  flow: Flow,
  trigger: TriggerDoc,
  index: number,
  declared: Record<string, ParameterDoc>,
): void {
  for (const [name, value] of Object.entries(trigger.parameters ?? {})) {
    const problem = valueProblem(trigger, name, value, declared);
    if (problem)
      report(context, flow, ["ingest", "triggers", index, "parameters", name], ...problem);
  }
}
