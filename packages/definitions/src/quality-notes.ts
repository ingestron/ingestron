// A contract's quality rules that nothing checks, and why (specification
// section 6): warned where they are written, and kept for the passport.
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { isRecord } from "./merge.js";

/** An ODCS quality rule, as written. */
export type Rule = Record<string, unknown>;

/** A contract object: its rules, and its columns' rules and options. */
export type Entry = {
  name: string;
  quality?: unknown;
  properties?: {
    name: string;
    quality?: unknown;
    unique?: boolean;
    logicalTypeOptions?: unknown;
  }[];
};

/** A rule nothing checks: its name, its words, and why it is not checked. */
export interface UncheckedRule {
  name: string;
  description?: string;
  reason: string;
}

/** Why nothing checks a table that ends at the landed files. */
export const AT_FILES = "the table ends at the landed files, and nothing checks them.";

const IN_WORDS = "it is written for people to follow";

/** The rules in a `quality` list. */
export function rulesOf(value: unknown): Rule[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** The rule's name, else `<column>_<metric>`, in lower case. */
export function nameOf(column: string, rule: Rule): string {
  const given = typeof rule.name === "string" ? rule.name : `${column}_${String(rule.metric)}`;
  return given.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function labelOf(rule: Rule): string {
  return typeof rule.metric === "string"
    ? `"${rule.metric}"`
    : `A ${String(rule.type ?? "library")}`;
}

function unchecked(name: string, rule: Rule, reason: string): UncheckedRule {
  const description = typeof rule.description === "string" ? rule.description : undefined;
  return { name, ...(description !== undefined && { description }), reason };
}

/**
 * A rule that is not checked, warned at where it is written unless it is a
 * text rule: over all rows only with checks on; another engine's never.
 */
export function notChecked(
  context: Context,
  { rule, name }: { rule: Rule; name: string },
  at: Source,
  countable: boolean,
): UncheckedRule {
  if (rule.type === "text") return unchecked(name, rule, IN_WORDS);
  const what = labelOf(rule);
  if (!countable) {
    const why =
      rule.type === "custom"
        ? "Ingestron does not run other engines' checks"
        : "it has no comparison, such as mustBe: 0";
    context.reporter.warning(
      "QUALITY_RULE_NOT_CHECKED",
      `${what} rule is not checked: ${why}.`,
      at,
      "Write it as a library or sql rule with a comparison, such as mustBe: 0, to have it checked.",
    );
    return unchecked(name, rule, why);
  }
  warnCount(context, what, at);
  return unchecked(
    name,
    rule,
    "it counts all rows, which is checked only when the platform turns on checks",
  );
}

/** Warns that a count over all rows is checked only with checks on, with the fix. */
function warnCount(context: Context, what: string, at: Source): void {
  const platform = context.platform;
  context.reporter.warning(
    "QUALITY_RULE_NOT_CHECKED",
    `${what} rule compares a count over all rows, which is checked after each refresh only when manage.checks is on.`,
    at,
    "Turn on manage.checks in platform.yaml to run it after each refresh.",
    platform
      ? [
          {
            title: "Turn on manage.checks",
            edits: [{ file: platform.file, pointer: "/manage/checks", set: true }],
          },
        ]
      : [],
  );
}

/** On a table that ends at the landed files nothing checks rows: each rule but text warns. */
export function notCheckedAtFiles(context: Context, entry: Entry, at: Source): UncheckedRule[] {
  const found: UncheckedRule[] = [];
  const note = (column: string, rule: Rule, pointer: string) => {
    const name = nameOf(column, rule);
    if (rule.type === "text") return found.push(unchecked(name, rule, IN_WORDS));
    context.reporter.warning(
      "QUALITY_RULE_NOT_CHECKED",
      `${labelOf(rule)} rule is not checked: ${AT_FILES}`,
      { ...at, pointer },
      "Add a store step to have it checked.",
    );
    return found.push(unchecked(name, rule, AT_FILES.replace(/\.$/, "")));
  };
  rulesOf(entry.quality).forEach((rule, index) =>
    note(entry.name, rule, `${at.pointer}/quality/${index}`),
  );
  (entry.properties ?? []).forEach((property, column) =>
    rulesOf(property.quality).forEach((rule, index) =>
      note(property.name, rule, `${at.pointer}/properties/${column}/quality/${index}`),
    ),
  );
  return found;
}
