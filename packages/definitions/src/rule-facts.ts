// What a rule says: the facts it matches, the method it chooses, and its settings.
import type { Source } from "./diagnostics.js";
import type { RuleDoc } from "./documents.js";
import type { Rule } from "./pack.js";
import type { Facts, Choice } from "./choose.js";

/** A rule's facts: everything but the method it chooses and its settings. */
export function factsOf(rule: Rule | RuleDoc): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rule as unknown as Record<string, unknown>).filter(
      ([key]) => key !== "use" && key !== "with",
    ),
  );
}

/** A rule's method and settings, with where they were written when it is the standard's. */
export function fromRule(rule: Rule | RuleDoc, at?: Source): Omit<Choice, "method" | "chosenBy"> {
  const origin = at && { document: at.document, pointer: `${at.pointer}/use` };
  const ruleWith = rule.with && {
    value: rule.with,
    at: at && { document: at.document, pointer: `${at.pointer}/with` },
  };
  return { id: rule.use, ...(origin && { origin }), ...(ruleWith && { ruleWith }) };
}

/** A rule matches when every fact it names equals the table's. */
export function matches(rule: Rule | RuleDoc, facts: Facts): boolean {
  return Object.entries(rule).every(
    ([key, value]) => key === "use" || key === "with" || facts[key as keyof Facts] === value,
  );
}
