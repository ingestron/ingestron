// Chooses the method for one action of one table (specification section 4).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { kinds, type ActionDoc } from "./documents.js";
import type { ChosenBy } from "./model.js";
import type { Action, Handover, Method } from "./pack.js";
import { canServe } from "./can-serve.js";
import { storeFixes } from "./store-fixes.js";
import { factsOf, fromRule, matches } from "./rule-facts.js";

/** Facts that `when` rules can match. */
export interface Facts {
  connectivity?: string;
  connector?: string;
  input?: Handover;
  layer: string;
}

/**
 * The reserved store choice that ends a flow at the files ingest lands, with
 * no store step (specification section 4).
 * @example store: { uses: none }
 */
export const NO_STORE = "none";

/** The chosen method, where the choice was written, and the matching rule's settings. */
export interface Choice {
  id: string;
  method: Method;
  origin?: Source;
  ruleWith?: { value: Record<string, unknown>; at?: Source };
  /** How it was chosen; `at` is where a written choice is. */
  chosenBy: Omit<ChosenBy, "file" | "line"> & { at?: Source };
}

/** What the flow or transform says about this action. */
export interface Named {
  owner: DefinitionDocument;
  doc?: ActionDoc;
  /** Where a problem with a method nobody named is reported, such as a flow's `/source`. */
  at?: string;
  /** Chosen by the environment's runs-on, not written by the definition. */
  runsOn?: true;
}

/** Chooses and checks the method; reports and returns undefined when it cannot be used. */
export function chooseMethod(
  context: Context,
  action: Action,
  named: Named,
  facts: Facts,
): Choice | undefined {
  const pick = pickMethod(context, action, named, facts);
  if (!pick) return undefined;
  const method = context.pack.methods[pick.id];
  const report = context.reporter;
  if (!method) {
    report.error(
      "UNKNOWN_METHOD",
      `The pack ${context.pack.id} has no method "${pick.id}".`,
      pick.origin,
      `Methods: ${Object.keys(context.pack.methods).join(", ")}.`,
    );
    return undefined;
  }
  if (method.action !== action) {
    report.error(
      "WRONG_ACTION",
      `"${pick.id}" is a ${method.action} method, not ${action}.`,
      pick.origin,
    );
    return undefined;
  }
  if (method.reads === "landed" && !named.runsOn) {
    report.error(
      "RUNS_ON",
      `"${pick.id}" reads the files another method lands, so only an environment's runs-on chooses it.`,
      pick.origin ?? { document: named.owner, pointer: named.at ?? "" },
    );
    return undefined;
  }
  return isAllowed(context, action, named, pick) ? { ...pick, method } : undefined;
}

/**
 * How `none` was chosen when the table's store choice is `none`; false when
 * the standard does not allow it (reported); undefined for any other choice.
 */
export function endsAtFiles(
  context: Context,
  named: Named,
  facts: Facts,
): ChosenBy | false | undefined {
  const pick = findPick(context, "store", named, facts);
  if (pick?.id !== NO_STORE) return undefined;
  return isAllowed(context, "store", named, pick) && located(pick.chosenBy);
}

/** The method something chooses for this action, without reporting anything. */
export function peekMethod(
  context: Context,
  action: Action,
  named: Named,
  facts: Facts,
): { id: string; method: Method } | undefined {
  const pick = findPick(context, action, named, facts);
  const method = pick && context.pack.methods[pick.id];
  return method && { id: pick.id, method };
}

/** True when something chooses a method for this action; nothing is reported. */
export function hasChoice(context: Context, action: Action, named: Named, facts: Facts): boolean {
  return findPick(context, action, named, facts) !== undefined;
}

/** A choice with the file and line where it was written. */
export function located({ at, ...rest }: Choice["chosenBy"]): ChosenBy {
  const location = at?.document.locate(at.pointer);
  return { ...rest, ...(location && { file: location.file, line: location.line }) };
}

/** The id something chooses for this action (a method, or `none`), without reporting anything. */
export function choiceOf(
  context: Context,
  action: Action,
  named: Named,
  facts: Facts,
): { id: string; written: boolean } | undefined {
  const pick = findPick(context, action, named, facts);
  return pick && { id: pick.id, written: pick.chosenBy.by === "definition" };
}

/** True when the standard allows `id` where the definition names it; otherwise reported. */
export function allowsWritten(context: Context, action: Action, named: Named, id: string): boolean {
  const origin = { document: named.owner, pointer: `/${action}/uses` };
  return isAllowed(context, action, named, { id, origin, chosenBy: { by: "definition" } });
}

/** A method the definition names must be in the standard's `allowed` list. */
function isAllowed(context: Context, action: Action, named: Named, pick: Pick): boolean {
  const allowed = context.standard.value[action]?.allowed;
  if (!named.doc?.uses || named.runsOn || !allowed || allowed.includes(pick.id)) return true;
  context.reporter.error(
    "METHOD_NOT_ALLOWED",
    `The standard does not allow "${pick.id}" for ${action}.`,
    pick.origin,
    `Allowed: ${allowed.join(", ")}.`,
  );
  return false;
}

type Pick = Omit<Choice, "method">;
type Picker = (context: Context, action: Action, named: Named, facts: Facts) => Pick | undefined;

/** Tried in order (section 4): the definition's own choice, then rules, then defaults. */
const pickers: Picker[] = [
  (_context, action, named) => {
    if (!named.doc?.uses) return undefined;
    const origin = { document: named.owner, pointer: `/${action}/uses` };
    return { id: named.doc.uses, origin, chosenBy: { by: "definition", at: origin } };
  },
  (context, action, _named, facts) => {
    const rules = context.standard.value[action]?.when ?? [];
    const index = rules.findIndex(
      (rule) => matches(rule, facts) && applies(action, rule.use, facts),
    );
    const rule = rules[index];
    const at = { document: context.standard, pointer: `/${action}/when/${index}` };
    return (
      rule && { ...fromRule(rule, at), chosenBy: { by: "standard-rule", when: factsOf(rule), at } }
    );
  },
  (context, action, _named, facts) => {
    // A pack's rule only counts when its method can read the source, so a
    // later pack can serve sources an earlier one cannot reach.
    const rule = context.pack.rules[action]?.when?.find(
      (candidate) =>
        matches(candidate, facts) && canServe(context.pack.methods[candidate.use], facts),
    );
    const pack = rule && context.owner.get(rule.use);
    return (
      rule && {
        ...fromRule(rule),
        chosenBy: { by: "pack-rule", when: factsOf(rule), ...(pack && { pack }) },
      }
    );
  },
  (context, action) => {
    const id = context.standard.value[action]?.default;
    const origin = { document: context.standard, pointer: `/${action}/default` };
    return id ? { id, origin, chosenBy: { by: "standard-default", at: origin } } : undefined;
  },
  (context, action) => {
    const id = context.pack.rules[action]?.default;
    const pack = id && context.owner.get(id);
    return id ? { id, chosenBy: { by: "pack-default", ...(pack && { pack }) } } : undefined;
  },
];

/** The first picker's choice that applies (see `applies`). */
function findPick(context: Context, action: Action, named: Named, facts: Facts): Pick | undefined {
  for (const picker of pickers) {
    const pick = picker(context, action, named, facts);
    const written = pick?.chosenBy.by === "definition";
    if (pick && (written || applies(action, pick.id, facts))) return pick;
  }
  return undefined;
}

/**
 * A standard's or pack's store `none` applies only where ingest hands over
 * files, or where that is not known because ingest failed; elsewhere, such
 * as for a transform, the next matching rule or default applies.
 */
function applies(action: Action, id: string, facts: Facts): boolean {
  if (action !== "store" || id !== NO_STORE) return true;
  return facts.input === undefined || facts.input === "files";
}

function pickMethod(
  context: Context,
  action: Action,
  named: Named,
  facts: Facts,
): Pick | undefined {
  const pick = findPick(context, action, named, facts);
  if (pick) return pick;
  if (action === "store" && named.owner.kind === kinds.flow.kind) {
    // When ingest failed, its own problem says why; nothing more is known.
    if (facts.input === undefined) return undefined;
    context.reporter.error(
      "UNKNOWN_METHOD",
      "Nothing chooses a store method, so nothing keeps the files ingest lands.",
      { document: named.owner, pointer: "" },
      "Add a store pack, or end the flow at the landed files with store: none.",
      storeFixes(context, named),
    );
    return undefined;
  }
  context.reporter.error(
    "UNKNOWN_METHOD",
    `Neither the standard nor the pack chooses a ${action} method.`,
    { document: named.owner, pointer: "" },
  );
  return undefined;
}

export { canServe } from "./can-serve.js";
