// Reads the parts of a table's ODCS contract that generation uses (section 6).
import { AT_FILES, notCheckedAtFiles, ruleChecks } from "./quality-rules.js";
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { kinds, type ContractDoc, type ExpectationDoc } from "./documents.js";
import type { Column, Contract, Expectation } from "./model.js";

type Entry = NonNullable<ContractDoc["schema"]>[number];

/**
 * The table's contract, or undefined after reporting. `at` is the table's
 * contract field; `atFiles` when the table ends at the landed files, so its
 * rules are not checked.
 */
export function contractFor(
  context: Context,
  table: string,
  id: string,
  at: Source,
  atFiles = false,
): Contract | undefined {
  const document = context.project.get(kinds.contract, id);
  const entries = document?.value.schema ?? [];
  const index = entryIndex(entries, table);
  const entry = entries[index];
  if (!entry) {
    const names = entries.map((candidate) => candidate.name).join(", ") || "none";
    context.reporter.error(
      "CONTRACT_TABLE",
      `Contract "${id}" has no schema entry named "${table}".`,
      at,
      `Its entries: ${names}.`,
    );
    return undefined;
  }
  const columns = (entry.properties ?? []).map((property) => columnOf(context, property));
  return {
    id,
    ...(entry.description && { description: entry.description }),
    columns,
    primaryKey: primaryKeyOf(entry),
    ...checksOf(context, entry, { document: document!, pointer: `/schema/${index}` }, atFiles),
    tags: (entry.tags ?? []).map(String),
    ...accessOf(document!.value),
  };
}

/** Who may use the data and what the contract promises (ODCS `roles`, `slaProperties`). */
function accessOf(value: ContractDoc): Pick<Contract, "roles" | "sla"> {
  return {
    roles: (value.roles ?? []).map(({ role, access, description, firstLevelApprovers }) => ({
      role,
      ...(access !== undefined && { access }),
      ...(description !== undefined && { description }),
      ...(firstLevelApprovers !== undefined && { firstLevelApprovers }),
    })),
    sla: (value.slaProperties ?? []).map(({ property, value: text, unit }) => ({
      property,
      value: String(text),
      ...(unit !== undefined && { unit }),
    })),
  };
}

/** The entry named like the table, else the only entry; -1 when there is none. */
function entryIndex(entries: Entry[], table: string): number {
  const named = entries.findIndex((candidate) => candidate.name === table);
  return named >= 0 ? named : entries.length === 1 ? 0 : -1;
}

/** Checks of each row, and checks over all rows, from the object's rules. */
function checksOf(context: Context, entry: Entry, at: Source, atFiles: boolean) {
  if (atFiles) {
    notCheckedAtFiles(context, entry, at);
    return { checks: [], tableChecks: [] };
  }
  const { rows, table } = ruleChecks(context, entry, at);
  return { checks: rows, tableChecks: table };
}

function columnOf(context: Context, property: NonNullable<Entry["properties"]>[number]): Column {
  const types = { ...context.pack.defaults.types, ...context.standard.value.types };
  const type =
    property.physicalType ?? (property.logicalType ? types[property.logicalType] : undefined);
  return {
    name: property.name,
    ...(type && { type }),
    ...(property.logicalType && { logicalType: property.logicalType }),
    ...(property.physicalName && { physicalName: property.physicalName }),
    ...(property.tags?.length && { tags: property.tags.map(String) }),
    ...(property.classification && { classification: property.classification }),
    nullable: property.required !== true,
    ...(property.description && { description: property.description }),
  };
}

function primaryKeyOf(entry: Entry): string[] {
  return (entry.properties ?? [])
    .filter((property) => property.primaryKey === true)
    .sort((a, b) => (a.primaryKeyPosition ?? 0) - (b.primaryKeyPosition ?? 0))
    .map((property) => property.name);
}

/** On a table that ends at the landed files, each of the flow table's expectations warns. */
export function expectationsNotChecked(context: Context, own: ExpectationDoc[], at: Source): void {
  own.forEach((expectation, index) =>
    context.reporter.warning(
      "QUALITY_RULE_NOT_CHECKED",
      `Expectation "${expectation.name}" is not checked: ${AT_FILES}`,
      { ...at, pointer: `${at.pointer}/${index}` },
      "Add a store step to have it checked.",
    ),
  );
}

/** Not-null checks for required columns, then the table's own checks, with actions filled in. */
export function expectationsFor(
  context: Context,
  contract: Contract,
  own: ExpectationDoc[] = [],
): Expectation[] {
  const quality = { ...context.pack.defaults.quality, ...context.standard.value.quality };
  const required = contract.columns
    .filter((column) => !column.nullable)
    .map((column) => ({
      name: `${column.name}_not_null`,
      check: `\`${column.name}\` IS NOT NULL`,
      action: quality.required,
      from: "contract" as const,
    }));
  const rules = contract.checks.map((item) => ({
    ...item,
    action: quality.default,
    from: "contract" as const,
  }));
  return [
    ...required,
    ...rules,
    ...own.map((item) => ({
      name: item.name,
      check: item.check,
      action: item.action ?? quality.default,
      from: "definition" as const,
    })),
  ];
}
