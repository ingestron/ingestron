// What a rule says: the facts it matches, the method it chooses, and its settings.
import type { Source } from "../diagnostics/index.js";
import type { RuleDoc } from "../documents/index.js";
import type { Rule } from "../pack/index.js";
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
    facts: Object.entries(factsOf(rule))
      .map(([fact, value]) => `${fact} ${String(value)}`)
      .join(" and "),
  };
  return { id: rule.use, ...(origin && { origin }), ...(ruleWith && { ruleWith }) };
}

/**
 * A rule matches when every fact it names equals the table's; `tag` matches
 * when the table's contract has that tag. A fact the table does not have
 * does not match.
 */
export function matches(rule: Rule | RuleDoc, facts: Facts): boolean {
  return Object.entries(rule).every(([key, value]) => {
    if (key === "use" || key === "with") return true;
    if (key === "tag") return facts.tags?.includes(value as string) === true;
    return facts[key as keyof Facts] === value;
  });
}
