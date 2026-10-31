// One action of one table: choose the method, check what it reads and
// receives, and merge its settings (specification sections 3 and 4).
import { chooseMethod, located, type Choice, type Facts, type Named } from "./choose.js";
import type { Context } from "./context.js";
import type { DefinitionCode } from "./diagnostics.js";
import type { Step } from "./model.js";
import type { Action, Handover, Method } from "./pack.js";
import { methodFixes } from "./method-fixes.js";
import { mergeSettings, type SettingsLayer } from "./settings.js";

/** A resolved step and what it hands to the next action. */
export type StepResult = Step & { produces: Handover; renames: boolean };

/** Resolves one step, or returns undefined after reporting. */
export function resolveStep(
  context: Context,
  action: Action,
  named: Named,
  facts: Facts,
  tableLayers: SettingsLayer[] = [],
  previous?: { method: string; produces: Handover },
): StepResult | undefined {
  const choice = chooseMethod(context, action, named, facts);
  if (!choice || !canRead(context, action, choice, facts, previous, named)) return undefined;
  const own = named.doc?.with && {
    value: named.doc.with,
    at: { document: named.owner, pointer: `/${action}/with` },
    definition: true,
    origin: "definition" as const,
  };
  const rule = choice.ruleWith && { ...choice.ruleWith, origin: "rule" as const };
  const layers = [rule, own, ...tableLayers].filter(
    (layer): layer is SettingsLayer => layer !== undefined,
  );
  const user = { owner: named.owner, at: named.at ?? "" };
  const merged = mergeSettings(context, action, choice.id, choice.method, layers, user);
  const pack = context.owner.get(choice.id) ?? "";
  return (
    merged && {
      method: choice.id,
      pack,
      ...merged,
      chosenBy: located(choice.chosenBy),
      produces: choice.method.produces,
      renames: choice.method.renames === true,
    }
  );
}

type Previous = { method: string; produces: Handover } | undefined;
type Problem = { code: DefinitionCode; message: string; hint?: string };

/** The method reads the connector and connectivity (ingest) and accepts what it is handed. */
function canRead(
  context: Context,
  action: Action,
  choice: Choice,
  facts: Facts,
  previous: Previous,
  named: Named,
): boolean {
  const problem = readProblem(action, choice, facts, previous, context.pack.methods);
  if (!problem) return true;
  const { code } = problem;
  const fixes =
    code === "CONNECTOR_NOT_SUPPORTED" || code === "CONNECTIVITY_NOT_SUPPORTED"
      ? methodFixes(context, choice, facts, named, code)
      : [];
  const at = choice.origin ?? { document: named.owner, pointer: named.at ?? "" };
  context.reporter.error(code, problem.message, at, problem.hint, fixes);
  return false;
}

function readProblem(
  action: Action,
  choice: Choice,
  facts: Facts,
  previous: Previous,
  methods: Record<string, Method>,
): Problem | undefined {
  const ingest = action === "ingest";
  const sourceProblem = ingest
    ? (connectorProblem(choice, facts, methods) ?? connectivityProblem(choice, facts))
    : undefined;
  return sourceProblem ?? handoverProblem(choice, previous);
}

function connectorProblem(
  { id, method }: Choice,
  facts: Facts,
  methods: Record<string, Method>,
): Problem | undefined {
  if (!method.connectors || method.connectors.includes(facts.connector ?? "")) return undefined;
  // Name the methods that can read this connector, so the fix is visible.
  const readers = Object.entries(methods)
    .filter(
      ([, candidate]) =>
        candidate.action === "ingest" && candidate.connectors?.includes(facts.connector ?? ""),
    )
    .map(
      ([name, candidate]) =>
        `${name} (${candidate.connectivity?.join(", ") ?? "any connectivity"})`,
    );
  const hint =
    readers.length > 0
      ? `Methods that read ${facts.connector}: ${readers.join("; ")}.`
      : `No pack in the standard reads ${facts.connector}.`;
  return {
    code: "CONNECTOR_NOT_SUPPORTED",
    message: `"${id}" cannot read the "${facts.connector}" connector.`,
    hint,
  };
}

function connectivityProblem({ id, method }: Choice, facts: Facts): Problem | undefined {
  if (
    !method.connectivity ||
    !facts.connectivity ||
    method.connectivity.includes(facts.connectivity)
  )
    return undefined;
  const message = `"${id}" cannot reach a source with ${facts.connectivity} connectivity.`;
  return {
    code: "CONNECTIVITY_NOT_SUPPORTED",
    message,
    hint: `It supports: ${method.connectivity.join(", ")}.`,
  };
}

function handoverProblem({ id, method }: Choice, previous: Previous): Problem | undefined {
  if (!previous || !method.accepts || method.accepts.includes(previous.produces)) return undefined;
  return {
    code: "HANDOVER",
    message: `"${id}" accepts ${method.accepts.join(" or ")}, but "${previous.method}" hands over ${previous.produces}.`,
  };
}

/** The step as the model records it, without what it hands over. */
export function stepOf(result: StepResult): Step {
  const { method, pack, settings, origins, chosenBy } = result;
  return { method, pack, settings, origins, chosenBy };
}
