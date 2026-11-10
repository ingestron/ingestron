// Reads the parts of a table's ODCS contract that generation uses (section 6).
import { notAppliedAtFiles, notCheckedAtFiles } from "./at-files.js";
import { rememberPlaces } from "./check-places.js";
import { qualityActions } from "./layer-quality.js";
import { ruleChecks } from "./quality-rules.js";
import { checksRun, type Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { kinds, type ContractDoc, type ExpectationDoc } from "../documents/index.js";
import type { Column, Contract, Expectation } from "../pack/index.js";

type Entry = NonNullable<ContractDoc["schema"]>[number];

/**
 * The table's contract, or undefined after reporting. `at` is the table's
 * contract field; `atFiles`, the ingest step's pack, when the table ends at the
 * landed files, so its rules are not applied; `keeper`, the pack that keeps the
 * table, which decides whether table checks run (section 7.1). Each table that
 * uses a contract resolves it for itself, since tables kept by different packs
 * get different table checks.
 */
export function contractFor(
  context: Context,
  table: string,
  id: string,
  at: Source,
  { atFiles, keeper }: { atFiles?: string; keeper?: string } = {},
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
  const place = { document: document!, pointer: `/schema/${index}` };
  const { places, ...checks } = checksOf(context, entry, place, { atFiles, keeper });
  const contract: Contract = {
    id,
    ...(entry.description && { description: entry.description }),
    columns,
    primaryKey: primaryKeyOf(entry),
    ...checks,
    tags: (entry.tags ?? []).map(String),
    ...accessOf(document!.value),
  };
  rememberPlaces(contract, { entry: place, ...places });
  return contract;
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

/** The schema entry of the contract the table uses, if any (see `entryIndex`). */
export function contractEntry(context: Context, id: string, table: string): Entry | undefined {
  const entries = context.project.get(kinds.contract, id)?.value.schema ?? [];
  return entries[entryIndex(entries, table)];
}

/** The entry named like the table, else the only entry; -1 when there is none. */
function entryIndex(entries: Entry[], table: string): number {
  const named = entries.findIndex((candidate) => candidate.name === table);
  return named >= 0 ? named : entries.length === 1 ? 0 : -1;
}

/** Checks of each row, and checks over all rows, from the object's rules, with their places. */
function checksOf(
  context: Context,
  entry: Entry,
  at: Source,
  { atFiles, keeper }: { atFiles?: string; keeper?: string },
) {
  if (atFiles !== undefined)
    return {
      checks: [],
      tableChecks: [],
      unchecked: notCheckedAtFiles(context, entry, at, atFiles),
      places: { checks: [], tableChecks: [] },
    };
  const where = { at, checksRun: checksRun(context, keeper) };
  const { rows, table, tableAt, unchecked } = ruleChecks(context, entry, where);
  return {
    checks: rows.map(({ name, check, rule }) => ({ name, check, ...(rule && { rule }) })),
    tableChecks: table,
    unchecked,
    places: { checks: rows.map((row) => row.at), tableChecks: tableAt },
  };
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

/**
 * On a table that ends at the landed files, each of the flow table's expectations is
 * `NOT_APPLIED` on `pack`, the ingest step's.
 */
export function expectationsNotChecked(
  context: Context,
  own: ExpectationDoc[],
  at: Source,
  pack: string,
): void {
  own.forEach((expectation, index) =>
    notAppliedAtFiles(
      context,
      `Expectation "${expectation.name}"`,
      pack,
      { ...at, pointer: `${at.pointer}/${index}` },
      "expectations",
    ),
  );
}

/**
 * Not-null checks for required columns, then the table's own checks, with actions filled in:
 * the standard's, over which the table's `layer` applies.
 */
export function expectationsFor(
  context: Context,
  contract: Contract,
  own: ExpectationDoc[] = [],
  layer?: string,
): Expectation[] {
  const quality = qualityActions(context, layer);
  const required = contract.columns
    .filter((column) => !column.nullable)
    .map((column) => ({
      name: `${column.name}_not_null`,
      check: `\`${column.name}\` IS NOT NULL`,
      rule: { kind: "notNull" as const, column: column.name },
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
