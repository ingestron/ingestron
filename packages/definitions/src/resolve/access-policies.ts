// What a pack's masks and row filters need of the platform (specification sections 7.1 and
// 8.2): tags to match columns by, run_as to let the pipeline read real values, a schema for
// the functions, and no more policies or exempt principals than the platform allows.
import type { Context } from "../context/index.js";
import { isOn, warnOff } from "../context/index.js";
import { movedFieldPointer, movedTo, sectionsOf, withMovedFields } from "../documents/index.js";
import { isRecord } from "../internal/index.js";
import type { JudgedTable } from "./access-judge.js";
import { maskName } from "./access-judge.js";

/** What the platform allows: policies on one schema and on one table, principals in one `EXCEPT`. */
export const policyLimits = { schema: 100, table: 50, principals: 20 } as const;

/** Checks what each pack's masks and filters need, for the packs that keep the tables. */
export function checkPolicies(context: Context, judged: JudgedTable[]): void {
  for (const pack of context.packs) {
    if (pack.capabilities?.some((capability) => capability.id === "masks"))
      checkTags(context, pack.id);
    const kept = judged.filter((item) => item.keeper.pack === pack.id);
    const on = isOn(context, "masks", pack.id) || isOn(context, "filters", pack.id);
    if (kept.length > 0 && on) checkPack(context, pack.id, kept);
  }
}

/** Masks match columns by their classification tags, so they need tags on. */
function checkTags(context: Context, pack: string): void {
  const platform = context.platform;
  if (!platform || !isOn(context, "masks", pack) || isOn(context, "tags", pack)) return;
  const pointer = manageAt(context, pack, "masks");
  warnOff(context, "tags", "Masks are not applied", platform, pointer, undefined, pack);
}

function checkPack(context: Context, pack: string, kept: JudgedTable[]): void {
  const platform = context.platform!;
  const at = {
    document: platform,
    pointer: manageAt(context, pack, isOn(context, "masks", pack) ? "masks" : "filters"),
  };
  const section = sectionOf(context, pack);
  if (section.run_as === undefined || section.run_as === null)
    context.reporter.error(
      "MASK_NEEDS_RUN_AS",
      `Masks and filters on ${pack} need run_as, the principal the pipeline runs as, so it reads real values.`,
      at,
      `Give ${pack}.run_as.`,
    );
  const governance = isRecord(section.governance) ? section.governance : {};
  const items = needingFunctions(kept);
  if (items.length > 0 && typeof governance.functions !== "string")
    context.reporter.error(
      "MASK_FUNCTIONS",
      `Masks and filters on ${pack} need governance.functions, the schema that holds ${items.join(", ")}.`,
      at,
      `Give ${pack}.governance.functions, such as \${values.governance_schema}.`,
    );
  if (kept.some((item) => item.masks.length + item.filters.length > 0)) {
    checkPrincipals(context, pack, section);
    checkLimits(context, pack, kept);
  }
}

/** The pack's section; for databricks, with the fields that moved into it read as the model has them. */
function sectionOf(context: Context, pack: string): Record<string, unknown> {
  const doc = context.platform!.value;
  const section = sectionsOf(doc)[pack] ?? {};
  return pack === movedTo ? { ...section, run_as: withMovedFields(doc).run_as } : section;
}

/** Where the pack's `manage.<id>` is written: in its section, or for databricks at the top. */
function manageAt(context: Context, pack: string, id: string): string {
  if (pack !== movedTo) return `/${pack}/manage/${id}`;
  return `${movedFieldPointer(context.platform!.value, "manage")}/${id}`;
}

/** The built-in masks and one-part functions the tables apply, each once, in order. */
function needingFunctions(kept: JudgedTable[]): string[] {
  const items = kept.flatMap(({ masks, filters }) => [
    ...masks.map((mask) =>
      typeof mask.mask === "string" ? `the "${mask.mask}" mask` : onePart(maskName(mask)),
    ),
    ...filters.map((filter) => onePart(filter.function)),
  ]);
  return [...new Set(items.filter((item): item is string => item !== undefined))];
}

function onePart(name: string): string | undefined {
  return name.includes(".") ? undefined : `the function "${name}"`;
}

/** `POLICY_PRINCIPALS` when run_as and the unmasked principals are too many for one `EXCEPT`. */
function checkPrincipals(context: Context, pack: string, section: Record<string, unknown>): void {
  const governance = isRecord(section.governance) ? section.governance : {};
  const unmasked = Array.isArray(governance.unmasked) ? governance.unmasked : [];
  const runAs = isRecord(section.run_as) ? Object.values(section.run_as) : [section.run_as];
  const principals = new Set([...runAs, ...unmasked].filter((item) => typeof item === "string"));
  if (principals.size <= policyLimits.principals) return;
  context.reporter.error(
    "POLICY_PRINCIPALS",
    `${principals.size} principals would see real values: run_as and governance.unmasked may name ${policyLimits.principals}.`,
    { document: context.platform!, pointer: `/${pack}/governance/unmasked` },
    "Put the principals in fewer groups.",
  );
}

/**
 * `POLICY_LIMIT` for each schema, when the pack manages schemas, else for each table, that
 * would have more policies than the platform allows: one per masked classification and filter.
 */
function checkLimits(context: Context, pack: string, kept: JudgedTable[]): void {
  const scope = isOn(context, "schemas", pack) ? "schema" : "table";
  const limit = policyLimits[scope];
  for (const [place, names] of policiesByPlace(kept, scope)) {
    if (names.size <= limit) continue;
    context.reporter.error(
      "POLICY_LIMIT",
      `${names.size} policies would be on the ${scope} "${place}", over the ${limit} a ${scope} may have.`,
      { document: context.standard, pointer: "/governance" },
      "Mask fewer classifications, or use fewer filters.",
    );
  }
}

/** The policies on each schema or table, by its full name: one per masked classification and filter. */
function policiesByPlace(kept: JudgedTable[], scope: "schema" | "table"): Map<string, Set<string>> {
  const policies = new Map<string, Set<string>>();
  for (const { table, masks, filters } of kept) {
    const { catalog, schema } = table.fullName;
    const place =
      scope === "schema" ? `${catalog}.${schema}` : `${catalog}.${schema}.${table.fullName.table}`;
    const names = policies.get(place) ?? new Set<string>();
    for (const mask of masks) names.add(`mask:${mask.classification}`);
    for (const filter of filters) names.add(`filter:${filter.name}`);
    policies.set(place, names);
  }
  return policies;
}
