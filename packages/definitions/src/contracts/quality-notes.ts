// A contract's quality rules that nothing checks, and why (specification
// section 6): warned where they are written, and kept for the passport.
import { turnOn, warnOff, type Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { isRecord } from "../internal/index.js";

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
  /** The warning that says an engine or the platform could check it, but does not here. */
  notEnforced?: "NOT_APPLIED" | "CAPABILITY_OFF";
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

/** A rule nothing checks, with its words, the reason and, if any, the warning that says so. */
export function unchecked(
  name: string,
  rule: Rule,
  reason: string,
  notEnforced?: UncheckedRule["notEnforced"],
): UncheckedRule {
  const description = typeof rule.description === "string" ? rule.description : undefined;
  return {
    name,
    ...(description !== undefined && { description }),
    reason,
    ...(notEnforced !== undefined && { notEnforced }),
  };
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
  return unchecked(name, rule, CHECKS_OFF, "CAPABILITY_OFF");
}

/** Why a count over all rows is not checked: checks are off for the pack that keeps the table. */
const CHECKS_OFF = "it counts all rows, which is checked only when the platform turns on checks";

/**
 * A column's `unique: true` that does not run because checks are off: `CAPABILITY_OFF` at
 * `unique`, about the table being resolved, in the words of a contract field that needs
 * checks (specification sections 6 and 7.1).
 */
export function uniqueOff(context: Context, name: string, at: Source): UncheckedRule {
  const message = `unique in contract "${at.document.id}" is not applied`;
  warnOff(context, "checks", message, at.document, at.pointer);
  return unchecked(name, {}, CHECKS_OFF, "CAPABILITY_OFF");
}

/**
 * `CAPABILITY_OFF`: a count over all rows is checked only with checks on, with the fix that
 * turns them on.
 */
function warnCount(context: Context, what: string, at: Source): void {
  const { field, fixes } = turnOn(context, "checks");
  context.reporter.warning(
    "CAPABILITY_OFF",
    `${what} rule compares a count over all rows, which is checked after each refresh only when manage.checks is on.`,
    at,
    `Turn on ${field} in platform.yaml to run it after each refresh.`,
    fixes,
    { feature: "checks" },
  );
}
